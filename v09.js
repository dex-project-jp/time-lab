'use strict';

const priorLivePay09 = livePay;
const priorPayRows09 = payRows;
const priorRenderPay09 = renderPay07;
const priorStartPay09 = $('#startPay07').onclick;
const priorPrint09 = $('#periodPrint').onclick;

function extrasFor09(period, fresh = false) {
  const profile = payStore().extraProfiles09?.[employee().id];
  return period.extras09 ?? PayrollExtras.defaults(period, profile, periodOptions().mode, fresh);
}

livePay = function () {
  const period = payPeriod();
  if (!period || period.snapshot) return priorLivePay09();
  const plan = employeePlan();
  const rows = PeriodCore.rows(state, employee().id, salaryMonth());
  return PayrollExtras.calculate(period, extrasFor09(period), plan, rows, taxFor(period.settings.taxYear),
    employeeHistory().length ? plan.specialSalary : undefined);
};

payRows = function (side, period, result) {
  if (period.snapshot) return priorPayRows09(side, period, result);
  const extras = extrasFor09(period);
  const hiddenKeys = side === 'earnings'
    ? [...(extras.special.formula ? ['special'] : []), ...(extras.leave.touched ? ['leave'] : [])]
    : ['housing','utilities'];
  const hidden = new Set(hiddenKeys.map(key => PayrollExtras.find(period[side],key)?.id).filter(Boolean));
  return priorPayRows09(side, {...period,[side]:period[side].filter(item => !hidden.has(item.id))}, result);
};

const extrasPanel09 = document.createElement('section');
extrasPanel09.className = 'extras09';
extrasPanel09.innerHTML = `
  <fieldset><legend>特別給与</legend>
    <label><input type="checkbox" data-extra09="special.enabled"> 特別給与を使用する</label>
    <label>今月の n <input inputmode="numeric" type="number" min="0" step="1" data-extra09="special.n"></label>
    <output id="specialAmount09"></output>
    <details><summary>計算式 A × n ＋ B の設定</summary>
      <label>A（円） <input inputmode="numeric" type="number" min="0" step="1" data-extra09="special.a"></label>
      <label>B（円） <input inputmode="numeric" type="number" min="0" step="1" data-extra09="special.b"></label>
    </details>
  </fieldset>
  <fieldset><legend>有給休暇手当</legend>
    <label><input type="checkbox" data-extra09="leave.enabled"> 有給休暇手当を使用する</label>
    <div id="leaveInputs09">
      <label>有給日数（0.5日単位） <input inputmode="decimal" type="number" min="0" max="31" step="0.5" data-extra09="leave.days"></label>
      <label>有給取得日（1行に1日、半日は日付の後に「午前」または「午後」）<textarea rows="2" maxlength="1500" placeholder="2026-11-06 午後" data-extra09="leave.dates"></textarea></label>
      <label><input type="checkbox" data-extra09="leave.confirmed"> 就業規則等を確認し、基本時給 × 8時間 × 日数で算定する</label>
    </div>
    <output id="leaveAmount09"></output>
  </fieldset>`;
$('#pay07Earnings').before(extrasPanel09);

const deductionPanel09 = document.createElement('div');
deductionPanel09.className = 'extras09';
deductionPanel09.innerHTML = ['housing','utilities'].map(key => `
  <fieldset><legend>${PayrollExtras.labels[key]}</legend>
    <label><input type="checkbox" data-extra09="${key}.enabled"> 控除する</label>
    <label>金額（円） <input type="number" inputmode="numeric" min="0" step="1" data-extra09="${key}.amount"></label>
    <details><summary>控除の根拠を確認</summary>
      <label>賃金控除協定などの根拠 <input type="text" maxlength="200" data-extra09="${key}.reason"></label>
      <label><input type="checkbox" data-extra09="${key}.confirmed"> 適法な控除根拠を確認した</label>
    </details>
  </fieldset>`).join('');
$('#pay07Deductions').after(deductionPanel09);

function extraResult09(result, key) {
  return PayrollExtras.find(result?.earnings ?? [],key)?.amount;
}

renderPay07 = function (keepRows = false) {
  // Keep monthly input nodes intact when the legacy renderer refreshes its rows.
  if (!keepRows) $('#pay07Earnings').before(extrasPanel09);
  priorRenderPay09(keepRows);
  const period = payPeriod();
  if (!period) return;
  const locked = !!period.snapshot;
  const extra = period.snapshot?.extras09 ?? extrasFor09(period);
  extrasPanel09.hidden = deductionPanel09.hidden = locked;
  if (!locked) {
    const leading = PayrollExtras.find(period.earnings,'special')?.id;
    const rows = [...$('#pay07Earnings').children].filter(row => row !== extrasPanel09);
    const baseIds = new Set(period.earnings.filter(item => ['attendance','specialAttendance'].includes(item.source)).map(item => item.id));
    const lastBase = rows.filter(row => baseIds.has(row.dataset.payId)).at(-1);
    const legacySpecial = rows.find(row => row.dataset.payId === leading);
    if (legacySpecial) legacySpecial.after(extrasPanel09);
    else if (lastBase) lastBase.after(extrasPanel09);
    else $('#pay07Earnings').prepend(extrasPanel09);
  }
  for (const input of document.querySelectorAll('[data-extra09]')) {
    const [key, field] = input.dataset.extra09.split('.');
    const value = extra[key][field];
    if (input.type === 'checkbox') input.checked = !!value;
    else if (input !== document.activeElement || !keepRows) input.value = value ?? '';
    input.disabled = locked || (key === 'leave' && field !== 'enabled' && !extra.leave.enabled) ||
      (key === 'special' && field === 'n' && !extra.special.enabled);
  }
  $('#leaveInputs09').hidden = !extra.leave.enabled;
  try {
    const result = livePay();
    $('#specialAmount09').textContent = (extra.special.formula ? '' : '従来の設定額 · n の入力またはチェック操作で計算式に切替 · ') + yen(extraResult09(result,'special'));
    const leave = extraResult09(result,'leave');
    const preview = extra.leave.enabled && extra.leave.days !== null ? employeePlan().rate * 8 * extra.leave.days : null;
    $('#leaveAmount09').textContent = leave === null && preview !== null
      ? '参考 ' + yen(preview) + '（取得日と算定方式の確認待ち）' : yen(leave);
    if (result.gross === null) $('#pay07Reference').textContent = '支給の入力待ち。税・保険・Excel照合額は支給がそろうと計算します。';
  } catch {
    $('#specialAmount09').textContent = $('#leaveAmount09').textContent = '要確認';
  }
};

async function editExtras09(event) {
  const input = event.target;
  const period = payPeriod();
  if (!input.dataset.extra09 || !period || period.snapshot) return;
  try {
    const [key, field] = input.dataset.extra09.split('.');
    const previous = period.extras09;
    const extras = structuredClone(extrasFor09(period));
    let value = input.type === 'checkbox' ? input.checked : input.value;
    if (input.type === 'number') {
      if (!input.validity.valid) throw Error('入力範囲を確認してください');
      value = input.value === '' && ['n','days'].includes(field) ? null :
        field === 'days' ? Number(input.value) : PayrollCore.money(input.value);
    }
    extras[key][field] = value;
    if (key === 'special' && ['enabled','n'].includes(field)) extras.special.formula = true;
    if (key === 'leave') {
      extras.leave.touched = true;
      if (field === 'enabled') extras.leave.confirmed = false;
    }
    if (['housing','utilities'].includes(key) && field !== 'confirmed') extras[key].confirmed = false;
    period.extras09 = extras;
    const profiles = payStore().extraProfiles09 ??= {};
    const profile = profiles[employee().id] ??= {};
    if (key === 'special' && ['a','b'].includes(field)) profile[field] = value;
    if (['housing','utilities'].includes(key)) profile[key] = {amount:extras[key].amount,enabled:extras[key].enabled,reason:extras[key].reason};
    const switchedSpecial = key === 'special' && !previous?.special.formula && extras.special.formula;
    const switchedLeave = key === 'leave' && !previous?.leave.touched;
    renderPay07(!switchedSpecial && !switchedLeave);
    await persistPay();
  } catch (error) {
    payStatus(error.message);
    $('#freezePay07').disabled = true;
  }
}
for (const panel of [extrasPanel09,deductionPanel09]) {
  panel.addEventListener('input', event => {
    if (event.target.type !== 'checkbox') editExtras09(event);
  });
  panel.addEventListener('change', event => {
    if (event.target.type === 'checkbox') editExtras09(event);
  });
}

$('#startPay07').onclick = async function () {
  const key = payKey();
  const prior = payPeriod();
  await priorStartPay09();
  if (!prior && payKey() === key && payPeriod()) {
    payPeriod().extras09 = extrasFor09(payPeriod(), true);
    await persistPay();
    renderPay07();
  }
};

const vaultPanel09 = document.createElement('details');
vaultPanel09.id = 'vault09';
vaultPanel09.innerHTML = `<summary>給与振込口座</summary>
  <p id="vaultMask09"></p>
  <p class="muted">口座情報はこの端末のブラウザ内で暗号化します。勤怠・給与のバックアップには含まれません。パスフレーズを忘れると開けません。</p>
  <button type="button" id="vaultShow09">表示・編集する</button>
  <div id="vaultAccess09" hidden>
    <label>口座用パスフレーズ（12文字以上） <input type="password" id="vaultPass09" autocomplete="off"></label>
    <button type="button" id="vaultUnlock09">口座を表示</button>
    <div id="vaultFields09" hidden>
      <label>金融機関名 <input data-bank09="bank" maxlength="100" autocomplete="off"></label>
      <label>金融機関コード（任意） <input data-bank09="bankCode" maxlength="4" inputmode="numeric" autocomplete="off"></label>
      <label>支店名 <input data-bank09="branch" maxlength="100" autocomplete="off"></label>
      <label>支店コード（任意） <input data-bank09="branchCode" maxlength="3" inputmode="numeric" autocomplete="off"></label>
      <label>口座種別 <select data-bank09="type"><option>普通</option><option>当座</option><option>貯蓄</option><option>その他</option></select></label>
      <label>口座番号（7桁） <input data-bank09="number" maxlength="7" inputmode="numeric" autocomplete="off"></label>
      <label>口座名義（カタカナ） <input data-bank09="holder" maxlength="100" autocomplete="off"></label>
      <button type="button" id="vaultSave09">暗号化して保存</button>
    </div>
    <button type="button" class="secondary" id="vaultHide09">表示を閉じる</button>
  </div><p role="status" id="vaultStatus09"></p>`;
$('#employeeSettings08').append(vaultPanel09);

const vaultKey09 = id => 'time-lab:v09:bank:'+id;
let vaultEpoch09 = 0;
function vaultRecord09(id) {
  return JSON.parse(localStorage.getItem(vaultKey09(id)) || 'null');
}
function lockVault09() {
  vaultEpoch09++;
  $('#vaultPass09').value = '';
  for (const field of document.querySelectorAll('[data-bank09]')) field.value = field.tagName === 'SELECT' ? '普通' : '';
  $('#vaultAccess09').hidden = $('#vaultFields09').hidden = true;
  $('#vaultStatus09').textContent = '';
  try {
    $('#vaultMask09').textContent = state && vaultRecord09(employee().id) ? '登録済み · •••••••' : '未登録';
  } catch {
    $('#vaultMask09').textContent = '口座の端末内保存を利用できません';
  }
}

$('#vaultShow09').onclick = () => {
  lockVault09();
  if (!window.isSecureContext || !window.crypto?.subtle) {
    $('#vaultStatus09').textContent = '暗号化を利用できるHTTPS環境で開いてください';
    return;
  }
  try {
    const exists = !!vaultRecord09(employee().id);
    $('#vaultAccess09').hidden = false;
    $('#vaultUnlock09').hidden = !exists;
    $('#vaultFields09').hidden = exists;
    $('#vaultPass09').focus();
  } catch {
    $('#vaultStatus09').textContent = '口座の端末内保存を利用できません';
  }
};
$('#vaultHide09').onclick = lockVault09;
vaultPanel09.addEventListener('toggle', () => { if (!vaultPanel09.open) lockVault09(); });
$('#employeeSettings08').addEventListener('toggle', () => { if (!$('#employeeSettings08').open) lockVault09(); });
$('#employee').addEventListener('change', lockVault09);
$('#restore').addEventListener('change', lockVault09);
document.addEventListener('visibilitychange', () => { if (document.hidden) lockVault09(); });

$('#vaultUnlock09').onclick = async () => {
  const id = employee().id;
  const epoch = vaultEpoch09;
  try {
    const account = await AccountVault.open(crypto,id,vaultRecord09(id),$('#vaultPass09').value);
    if (epoch !== vaultEpoch09 || id !== employee().id) return;
    for (const field of document.querySelectorAll('[data-bank09]')) field.value = account[field.dataset.bank09];
    $('#vaultFields09').hidden = false;
    $('#vaultStatus09').textContent = '口座を表示しています';
  } catch {
    if (epoch === vaultEpoch09) $('#vaultStatus09').textContent = '口座を開けません。パスフレーズを確認してください';
  }
};

$('#vaultSave09').onclick = async () => {
  const id = employee().id;
  const epoch = vaultEpoch09;
  try {
    const existing = localStorage.getItem(vaultKey09(id));
    const passphrase = $('#vaultPass09').value;
    if (existing) await AccountVault.open(crypto,id,JSON.parse(existing),passphrase);
    const account = Object.fromEntries([...document.querySelectorAll('[data-bank09]')].map(field => [field.dataset.bank09,field.value]));
    const encrypted = await AccountVault.seal(crypto,id,account,passphrase);
    if (epoch !== vaultEpoch09 || id !== employee().id) return;
    if (localStorage.getItem(vaultKey09(id)) !== existing) throw Error('別の画面で口座が変更されました。表示を開き直してください');
    localStorage.setItem(vaultKey09(id),JSON.stringify(encrypted));
    lockVault09();
    $('#vaultStatus09').textContent = '暗号化して保存しました';
  } catch (error) {
    if (epoch === vaultEpoch09) {
      $('#vaultStatus09').textContent = error.name === 'QuotaExceededError' ? '保存容量が不足しています' :
        error.name === 'Error' ? error.message : '口座を保存できませんでした';
    }
  }
};
const priorFill09 = fillEmployeeSettings;
let vaultEmployee09;
fillEmployeeSettings = function (force = false) {
  priorFill09(force);
  if (!state) return;
  if (force || vaultEmployee09 !== employee().id) {
    vaultEmployee09 = employee().id;
    vaultPanel09.open = false;
    lockVault09();
  }
};

const slipOptions09 = document.createElement('div');
slipOptions09.className = 'print-actions extras09';
slipOptions09.innerHTML = `<details><summary>口座情報の掲載（初期OFF）</summary>
  <label><input type="checkbox" id="includeBank09"> この明細に現在の振込口座を掲載する</label>
  <div id="slipUnlock09" hidden>
    <label>口座用パスフレーズ <input type="password" id="slipPass09" autocomplete="off"></label>
    <button type="button" id="slipInclude09">口座を開いて掲載</button>
  </div><p id="slipStatus09" role="status"></p>
</details>`;
$('#periodSlipBody').before(slipOptions09);
let slipEpoch09 = 0;
let slipEmployee09 = null;
function clearSlipBank09() {
  slipEpoch09++;
  $('#includeBank09').checked = false;
  $('#slipUnlock09').hidden = true;
  $('#slipPass09').value = '';
  $('#slipStatus09').textContent = '';
  $('#bankOnSlip09')?.remove();
  slipOptions09.querySelector('details').open = false;
}
$('#includeBank09').onchange = () => {
  if (!$('#includeBank09').checked) {
    clearSlipBank09();
    return;
  }
  $('#slipUnlock09').hidden = false;
};
$('#periodSlip').addEventListener('close', clearSlipBank09);
$('#slipInclude09').onclick = async () => {
  const id = slipEmployee09;
  const epoch = slipEpoch09;
  try {
    const record = vaultRecord09(id);
    if (!record) throw Error('振込口座は未登録です');
    const passphrase = $('#slipPass09').value;
    $('#slipPass09').value = '';
    const account = await AccountVault.open(crypto,id,record,passphrase);
    if (epoch !== slipEpoch09 || !$('#periodSlip').open || !$('#includeBank09').checked || employee().id !== id) return;
    $('#bankOnSlip09')?.remove();
    const line = document.createElement('p');
    line.id = 'bankOnSlip09';
    line.textContent = ['振込口座',account.bank,account.bankCode,account.branch,account.branchCode,account.type,account.number,account.holder].filter(Boolean).join(' / ');
    $('#periodSlipBody').append(line);
    $('#slipStatus09').textContent = 'この明細に掲載しました。PDF保存・共有前に内容を確認してください';
  } catch (error) {
    if (epoch === slipEpoch09) $('#slipStatus09').textContent = error.message;
  }
};

$('#periodPrint').onclick = function () {
  clearSlipBank09();
  slipEmployee09 = employee().id;
  if (!payPeriod()) return priorPrint09();
  try {
    const result = livePay();
    const p = PeriodCore.period(salaryMonth());
    const saved = !!payPeriod().snapshot;
    const table = (title, items, total) => `<table><thead><tr><th>${title}</th><th>金額</th></tr></thead><tbody>
      ${items.map(item => `<tr><td>${esc(earningName(item))}</td><td>${yen(item.amount)}</td></tr>`).join('')}
      <tr><th>${title}総額</th><th>${yen(total)}</th></tr></tbody></table>`;
    const day = result.dayPay;
    const deductionNote = (calc, note) => result.deductions.some(item => item.overrideFor === calc)
      ? '手動入力（明細の金額を使用）' : note || '要確認';
    $('#periodSlipBody').innerHTML = `<article class="slip09">
      <h1>${p.month} 給与明細</h1>
      <p><strong>${esc(employee().name)}</strong>　${saved ? '確定済み' : '未確定・確認用'}</p>
      <p>対象期間 ${p.start}〜${p.end}　支払日 ${esc(result.settings.payDate)}</p>
      <p>${day ? `通常出勤 ${day.regularDays}日　土曜出勤 ${day.saturdayDays}日` : `実働 ${hm(result.summary.minutes)}　給与計算用 ${hm(result.summary.payroll)}`}</p>
      <div class="slipTables09">${table('支給',result.earnings,result.gross)}${table('控除',result.deductions,result.deductionTotal)}</div>
      <p class="slipNet09">差引支給額　<strong>${yen(result.net)}</strong></p>
      <p>所得税　${esc(deductionNote('income',result.tax.note))}<br>雇用保険　${esc(deductionNote('employment',result.ei.note))}</p>
      ${result.errors.length ? `<p>要確認　${esc(result.errors.join(' / '))}</p>` : ''}
    </article>`;
    document.body.classList.add('period-print');
    $('#periodSlip').showModal();
  } catch (error) {
    payStatus(error.message);
  }
};

const legacySpecialLabel09 = $('#empSpecialSalary08').closest('label');
const legacySpecialSettings09 = document.createElement('details');
legacySpecialSettings09.innerHTML = '<summary>旧方式の特別給与（固定額）</summary>';
legacySpecialLabel09.before(legacySpecialSettings09);
legacySpecialSettings09.append(legacySpecialLabel09);

const validateBefore09 = validateBackup;
validateBackup = function (backup) {
  validateBefore09(backup);
  PayrollExtras.validateStore(backup.payrollV07, backup.employees);
  return backup;
};

if (state) {
  fillEmployeeSettings(true);
  renderPay07();
}
