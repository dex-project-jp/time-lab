'use strict';

function checkOwner_() {
  const active = Session.getActiveUser().getEmail().toLowerCase();
  const effective = Session.getEffectiveUser().getEmail().toLowerCase();
  if (!active || active !== effective) throw Error('所有者のGoogleアカウントで開いてください');
}

function doGet() {
  checkOwner_();
  return HtmlService.createHtmlOutput('TIME LABの「パソコンに反映」から確定給与を送ってください。');
}

function doPost(event) {
  try {
    checkOwner_();
    const data = event.parameter.payroll;
    if (!data || data.length > 150000) throw Error('送信した給与を確認してください');
    const rows = normalizeRows_(JSON.parse(data));
    const book = getBook_();
    const current = readMaster_(book.master);
    const expected = rows.map(row => current.get(key_(row))?.revision ?? null);
    const preview = rows.map((row,i) => {
      const old = current.get(key_(row));
      return { row, old:old?.values ?? null, action:PayrollSync.plan(old,hash_(row),expected[i]) };
    });
    const nonce = Utilities.getUuid();
    CacheService.getScriptCache().put('preview:'+nonce,JSON.stringify({expected,hashes:rows.map(hash_),previewHash:digest_(JSON.stringify(rows))}),600);
    const view = HtmlService.createTemplateFromFile('Review');
    view.preview = preview;
    view.payload = JSON.stringify(rows);
    view.nonce = nonce;
    return view.evaluate().setTitle('TIME LAB 給与同期');
  } catch (error) {
    return HtmlService.createHtmlOutput('確認画面を開けませんでした。Googleアカウント、接続設定、マスターの列構成を確認し、TIME LABから再送信してください。');
  }
}

function normalizeRows_(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 4) throw Error('同期人数を確認してください');
  const normalized = rows.map(PayrollSync.normalize);
  if (new Set(normalized.map(row => row.id)).size !== normalized.length ||
      new Set(normalized.map(row => row.month)).size !== 1) throw Error('従業員IDと対象月を確認してください');
  return normalized;
}

function key_(row) { return row.month+':'+row.id; }
function digest_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8));
}
function hash_(row) {
  const {finalizedAt,...content} = row;
  return digest_(JSON.stringify(content));
}

function getBook_() {
  const id = PropertiesService.getScriptProperties().getProperty('PAYROLL_SHEET_ID');
  if (!id) throw Error('接続設定が必要です');
  const file = SpreadsheetApp.openById(id);
  const getSheet = (name, headers) => {
    const sheet = file.getSheetByName(name);
    if (!sheet || sheet.getRange(1,1,1,headers.length).getValues()[0].some((v,i) => v !== headers[i])) {
      throw Error('同期マスターの列構成を確認してください');
    }
    return sheet;
  };
  return {id,master:getSheet('確定給与',PayrollSync.headers),history:getSheet('更新履歴',['履歴記録日時',...PayrollSync.headers])};
}

function readMaster_(sheet) {
  const last = sheet.getLastRow();
  const found = new Map();
  if (last < 2) return found;
  const data = sheet.getRange(2,1,last-1,PayrollSync.headers.length).getValues();
  data.forEach((values,i) => {
    const key = values[0], revision = values[25], hash = values[30];
    if (!key || !revision || !hash || found.has(key)) throw Error('同期マスターに不整合があります');
    found.set(key,{index:i+1,values,revision,hash});
  });
  return found;
}

function cells_(values) {
  return {values:values.map(value => {
    if (typeof value === 'number') return {userEnteredValue:{numberValue:value}};
    return value === null ? {} : {userEnteredValue:{stringValue:String(value)}};
  })};
}

function commitPayroll(payload, nonce) {
  checkOwner_();
  if (typeof payload !== 'string' || payload.length > 150000 || !/^[a-f0-9-]{36}$/.test(nonce)) throw Error('TIME LABから再送信してください');
  const rows = normalizeRows_(JSON.parse(payload));
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cached = cache.get('preview:'+nonce);
    if (!cached) throw Error('確認の有効期限が切れました。TIME LABから再送信してください');
    const {expected,hashes,previewHash} = JSON.parse(cached);
    if (digest_(JSON.stringify(rows)) !== previewHash) throw Error('確認した給与と一致しません');
    const book = getBook_();
    const current = readMaster_(book.master);
    const requests = [], additions = [], history = [];
    const at = new Date().toISOString();
    rows.forEach((row,i) => {
      const old = current.get(key_(row));
      const action = PayrollSync.plan(old,hashes[i],expected[i]);
      if (action === 'conflict') throw Error('確認画面を開いた後に更新されました。TIME LABから再送信してください');
      if (action === 'same') return;
      const values = cells_(PayrollSync.values(row,at,Utilities.getUuid(),hashes[i]));
      if (action === 'insert') {
        additions.push(values);
        return;
      }
      history.push(cells_([at,...old.values]));
      requests.push({updateCells:{
        start:{sheetId:book.master.getSheetId(),rowIndex:old.index,columnIndex:0},
        rows:[values],fields:'userEnteredValue'
      }});
    });
    if (additions.length) requests.push({appendCells:{sheetId:book.master.getSheetId(),rows:additions,fields:'userEnteredValue'}});
    if (history.length) requests.push({appendCells:{sheetId:book.history.getSheetId(),rows:history,fields:'userEnteredValue'}});
    if (requests.length) Sheets.Spreadsheets.batchUpdate({requests},book.id);
    cache.remove('preview:'+nonce);
    return {changed:additions.length+history.length, unchanged:rows.length-additions.length-history.length};
  } finally { lock.releaseLock(); }
}
