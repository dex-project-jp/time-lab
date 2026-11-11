const assert = require('node:assert/strict');
const {test} = require('node:test');
require('./core');
require('./attendance-core');
const Period = require('./period-core');
const Payroll = require('./payroll-core');
const Employee = require('./employee-core');
const Extras = require('./payroll-extras');
const table = require('./tax-2026');

function example() {
  const period = Payroll.create('2026-11', null, null, '木曜設定');
  const condition = {effectiveFrom:'2026-10-16',mode:'daily',rate:1200,specialSalary:0,
    special:{...Payroll.specialDefaults('サン'),legalConfirmed:true,legalBasis:'合成テスト'}};
  const thursdays = ['2026-10-22','2026-10-29','2026-11-05'];
  const ordinary = [];
  for (let i = 0; i < 31; i++) {
    const date = new Date(Date.UTC(2026,9,16+i)).toISOString().slice(0,10);
    if (new Date(date).getUTCDay() !== 4) ordinary.push(date);
  }
  const rows = [...ordinary.slice(0,19), ...thursdays].map(date => ({
    date,am:true,pm:true,reviewed:true,times:['05:00','08:00','15:00','18:00']
  }));
  const plan = Employee.plan(rows,period.month,[condition],condition,'2026-11-20');
  const extra = Extras.defaults(period,{},'daily',true);
  extra.special.n = 3;
  for (const key of ['housing','utilities']) Object.assign(extra[key],{enabled:true,reason:'合成テスト',confirmed:true});
  return {period,extra,run:() => Extras.calculate(period,extra,plan,rows,table)};
}

test('258400 gross retains independently confirmed 20000 subtotal during statutory review', () => {
  const {extra,run} = example();
  const result = run();
  assert.equal(result.gross,258400);
  assert.equal(result.knownDeduction,20000);
  assert.equal(result.deductionTotal,null);
  assert.equal(result.net,null);
  assert.equal(result.ready,false);
  extra.utilities.confirmed = false;
  assert.equal(run().knownDeduction,10000);
  extra.utilities.enabled = false;
  assert.equal(run().deductions.find(item => item.name === '水道光熱費').amount,0);
});

test('official table and confirmed insurance complete the net and freeze the applied amounts', () => {
  const {period,run} = example();
  Object.assign(period.settings,{insured:'yes',eiConfirmed:true,taxColumn:'kou',dependents:0,
    residency:'resident',taxConditions:true,socialConfirmed:true,otherSocial10:15000});
  const result = run();
  const tax = Payroll.income(258400-15000-1292,period.settings,table,0).amount;
  assert.ok(Number.isInteger(tax) && tax > 0);
  assert.equal(result.deductionTotal,20000+15000+1292+tax);
  assert.equal(result.net,258400-result.deductionTotal);
  assert.equal(result.ready,true);
  Payroll.freeze(period,result,'2026-11-20T00:00:00Z');
  period.settings.otherSocial10 = 0;
  assert.equal(period.snapshot.net,result.net);
});

test('confirmed employee deduction grounds carry forward independently', () => {
  const {period} = example();
  const profile = {housing:{amount:10000,enabled:true,reason:'合成テスト',confirmed:true},
    utilities:{amount:10000,enabled:true,reason:'',confirmed:true}};
  const extras = Extras.defaults(period,profile,'daily',true);
  assert.equal(extras.housing.confirmed,true);
  assert.equal(extras.utilities.confirmed,false);
});
