'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Sync = require('./payroll-sync-core');
const sheetData = [[Sync.headers],[['履歴記録日時',...Sync.headers]]];
const names = ['確定給与','更新履歴'];
const cache = new Map();
let failWrite = false, failReadback = false, user = 'owner@example.test', writes = 0;
const fakeSheet = id => ({
  getLastRow:() => sheetData[id].length,
  getSheetId:() => id,
  getRange:(row,_col,count) => ({getValues:() => sheetData[id].slice(row-1,row-1+count)})
});
const context = vm.createContext({
  Session:{getActiveUser:() => ({getEmail:() => user}),getEffectiveUser:() => ({getEmail:() => 'owner@example.test'})},
  Utilities:{
    getUuid:crypto.randomUUID,
    base64EncodeWebSafe:bytes => bytes.toString('base64url'),
    computeDigest:(_algorithm,text) => crypto.createHash('sha256').update(text).digest(),
    DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1}
  },
  PropertiesService:{getScriptProperties:() => ({getProperty:() => 'test-only'})},
  SpreadsheetApp:{openById:() => ({getSheetByName:name => fakeSheet(names.indexOf(name))})},
  CacheService:{getScriptCache:() => ({put:cache.set.bind(cache),get:cache.get.bind(cache),remove:cache.delete.bind(cache)})},
  LockService:{getScriptLock:() => ({waitLock(){},releaseLock(){}})},
  HtmlService:{
    createTemplateFromFile:() => ({evaluate(){return {setTitle:() => ({addMetaTag:() => this})};}}),
    createHtmlOutput:text => ({error:text})
  },
  Sheets:{Spreadsheets:{Values:{get:() => {
    if (failReadback === 'pending') {
      failReadback = false;
      throw Error('simulated failure after write');
    }
    return {values:sheetData[0].slice(1)};
  }},batchUpdate:({requests}) => {
    if (failWrite) throw Error('simulated network failure');
    writes++;
    if (failReadback) failReadback = 'pending';
    for (const request of requests) {
      const operation = request.appendCells || request.updateCells;
      const rows = operation.rows.map(row => row.values.map(({userEnteredValue:v}) => v?.numberValue ?? v?.stringValue ?? ''));
      if (request.appendCells) sheetData[operation.sheetId].push(...rows);
      else sheetData[operation.start.sheetId].splice(operation.start.rowIndex,rows.length,...rows);
    }
  }}}
});
vm.runInContext(fs.readFileSync('payroll-sync-core.js','utf8')+'\n'+fs.readFileSync('payroll-sync-server.gs','utf8'),context);
const confirm = rows => context.doPost({parameter:{payroll:JSON.stringify(rows)}});
const commit = view => context.commitPayroll(view.payload,view.nonce);
const send = rows => commit(confirm(rows));
const at = '2027-01-15T00:00:00.000Z';
const snapshot = {
  options:{mode:'daily'},dayPay:{regularDays:17,saturdayDays:2},summary:{minutes:9700},
  earnings:[{id:'base',name:'基本給',amount:173210,source:'attendance'},{id:'bonus',name:'賞与',amount:5000}],
  deductions:[{id:'extra',name:'追加控除',amount:100}],gross:178210,deductionTotal:100,net:178110,at
};
const stored = JSON.stringify(snapshot);
const daily = Sync.fromSnapshot({id:'worker-a',name:'同じ氏名'},'2027-01',snapshot);
const rows = [
  daily,{...daily,id:'worker-b'},{...daily,id:'worker-c',mode:'hourly',normalDays:null,specialDays:null},
  {...daily,id:'worker-d',mode:'fixed',normalDays:null,specialDays:null,minutes:null}
];
assert.equal(Sync.fromSnapshot({id:'draft'},'2027-01',null),null);
assert.throws(() => Sync.normalize({...daily,net:null}));
assert.deepEqual(Sync.period('2027-01'),{start:'2026-12-16',end:'2027-01-15'});
assert.deepEqual(Sync.period('2027-03'),{start:'2027-02-16',end:'2027-03-15'});
assert.equal(send(rows).changed,4);
assert.deepEqual(sheetData[0].slice(1).map(row => row[3]),rows.map(row => row.id));
assert.equal(sheetData[0][4][5],'固定給');
assert.equal(JSON.parse(sheetData[0][1][14])[0].amount,5000);
assert.equal(JSON.parse(sheetData[0][1][20])[0].amount,100);
assert.equal(send(rows).unchanged,4);
assert.equal(writes,1);
assert.equal(sheetData[0].length,5);
assert.equal(sheetData[1].length,1);
assert.ok(confirm([daily,daily]).error);
const revised = {...daily,net:178111};
const stale = confirm([{...daily,net:178112}]);
const preview = confirm([revised]);
assert.equal(preview.preview[0].action,'update');
assert.equal(sheetData[0][1][22],178110);
failWrite = true;
assert.throws(() => commit(preview),/simulated network failure/);
assert.equal(sheetData[0][1][22],178110);
assert.equal(sheetData[1].length,1);
failWrite = false;
assert.equal(send([revised]).changed,1);
assert.equal(sheetData[0][1][22],178111);
assert.equal(sheetData[1][1][23],178110);
assert.throws(() => commit(stale),/更新されました/);
assert.equal(send([{...revised,finalizedAt:'2027-01-16T00:00:00.000Z'}]).unchanged,1);
assert.equal(send([{...daily,month:'2026-12'}]).changed,1);
assert.equal(JSON.stringify(snapshot),stored);
const retry = confirm([{...daily,month:'2027-02'}]);
failReadback = true;
assert.throws(() => commit(retry),/failure after write/);
const writesAfterTimeout = writes;
assert.equal(commit(retry).unchanged,1);
assert.equal(writes,writesAfterTimeout);
const entry = sheetData[0].find(row => row[0] === '2027-02:worker-a');
entry[22]++;
assert.throws(() => commit(retry),/一致しません/);
entry[22]--;

const fixedId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const january = {...rows[3],id:fixedId,name:'登録時の氏名'};
const fixedBackup = {
  employee:{id:fixedId,name:'変更後の氏名'},months:{'2027-01':january,'2027-02':{...january,month:'2027-02'}}
};
assert.deepEqual(Sync.fixedBackup(JSON.parse(JSON.stringify(fixedBackup)),[]),fixedBackup);
assert.throws(() => Sync.fixedBackup(fixedBackup,[{id:fixedId}]),/バックアップ/);
assert.throws(() => Sync.fixedBackup({...fixedBackup,months:{'2027-03':january}},[]),/バックアップ/);
assert.deepEqual(Sync.fixedBackup({employee:null,months:{}},[]),{employee:null,months:{}});
user = 'other@example.test';
assert.ok(confirm([daily]).error);
assert.throws(() => context.commitPayroll(preview.payload,preview.nonce),/所有者/);
console.log('Payroll sync: four IDs, fixed pay, dates, duplicate, update history, stale preview, retry, authorization passed');
