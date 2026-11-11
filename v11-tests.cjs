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
  period.deductions.find(item => item.calc === 'income').enabled = false;
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
  return {period,extra,run:() => Extras.calculate(period,extra,plan,rows,table,undefined,true)};
}

test('specified November payroll deducts housing and utilities without confirmation', () => {
  const {period,extra,run} = example();
  for (const key of ['housing','utilities']) Object.assign(extra[key],{confirmed:false,reason:''});
  const result = run();
  assert.deepEqual(result.earnings.slice(0,3).map(item=>item.amount),[182400,36000,40000]);
  assert.equal(result.gross,258400);
  assert.equal(result.deductionTotal,23750);
  assert.equal(result.net,234650);
  assert.equal(result.ready,true);
  period.deductions[0] = {...period.deductions[0],calc:'manual',overrideFor:'income',amount:5000,enabled:true};
  period.deductions[1] = {...period.deductions[1],calc:'manual',overrideFor:'employment',amount:2000};
  const manual = run();
  assert.equal(manual.deductionTotal,27000);
  assert.equal(manual.net,231400);
  Payroll.freeze(period,manual,'2026-11-20T00:00:00Z');
  extra.utilities.amount = 15000;
  assert.equal(period.snapshot.net,231400);
  Payroll.validateStore({profiles:{},periods:{'x:2026-11':period},taxTables:{}},[{id:'x'}]);
});

test('custom percentage uses gross, rounds up to 10 yen and respects OFF', () => {
  const {period,run} = example();
  assert.equal(run().ei.amount,3750);
  assert.equal(run().taxBase,258400);
  Object.assign(period.settings,{eiMethod11:'custom',eiCustomRate11:1.45,eiCustomRounding11:''});
  assert.equal(run().ei.amount,3750);
  assert.equal(run().deductionTotal,23750);
  period.deductions[1].enabled = false;
  assert.equal(run().deductionTotal,20000);
});

test('blank values, leave and additional deductions calculate without legal metadata', () => {
  const {period,extra,run} = example();
  extra.special.n = null;
  extra.leave = {enabled:true,days:0.5};
  period.deductions.push({id:'add',name:'その他',kind:'voluntary',calc:'manual',amount:1000});
  assert.equal(run().gross,233200);
  assert.equal(run().deductionTotal,24390);
  period.deductions[2].enabled = false;
  assert.equal(run().deductionTotal,23390);
});

test('2026 tax requires a column and uses zero dependents by default', () => {
  const {period,run} = example();
  period.deductions[0].enabled = true;
  assert.equal(period.settings.dependents,0);
  assert.equal(run().tax.amount,null);
  assert.equal(run().net,null);
  assert.equal(run().knownDeduction,23750);
  assert.equal(run().ready,false);
  Object.assign(period.settings,{taxColumn:'kou',residency:'resident'});
  const bracket = table.rows.find(row=>row.lower<=258400&&row.upper>258400);
  assert.equal(run().tax.amount,bracket.kou[0]);
  period.settings.dependents = 2;
  assert.equal(run().tax.amount,bracket.kou[2]);
  period.settings.taxColumn = 'otsu';
  assert.equal(run().tax.amount,bracket.otsu);
});

test('monthly refund changes only net and does not carry into next month', () => {
  const {period,run} = example();
  const original = run();
  period.settings.taxRefund = 3000;
  const adjusted = run();
  assert.equal(adjusted.net,original.net+3000);
  for (const key of ['gross','taxBase','deductionTotal','eiBase']) assert.equal(adjusted[key],original[key]);
  assert.deepEqual(adjusted.tax,original.tax);
  const next = Payroll.create('2026-12',Payroll.template(period));
  assert.equal(next.settings.taxRefund,undefined);
  Payroll.freeze(period,adjusted,'2026-11-20T00:00:00Z');
  Payroll.validateStore({profiles:{},periods:{'x:2026-11':period},taxTables:{}},[{id:'x'}]);
});

test('employee settings are used for existing drafts without changing persisted source data', () => {
  const {period} = example();
  const original = structuredClone(period.settings);
  const saved = {taxColumn:'kou',dependents:2,residency:'resident',eiMethod11:'custom',
    eiCustomRate11:1.2,eiCustomRounding11:'floor'};
  const settings = Payroll.deductionSettings12(period.settings,saved);
  assert.equal(settings.taxColumn,'kou');
  assert.equal(settings.dependents,2);
  assert.equal(settings.eiCustomRate11,1.2);
  assert.equal(settings.eiCustomRounding11,'floor');
  assert.deepEqual(period.settings,original);
});
