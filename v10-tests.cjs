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

test('monthly housing overrides, including zero, survive reload and leave future months on employee standards', () => {
  const {period} = example();
  const store = {extraProfiles09:{staff:{
    housing:{amount:10000,enabled:true,reason:'',confirmed:false},
    utilities:{amount:10000,enabled:true,reason:'',confirmed:false}
  }}};
  const current = (draft, fresh = false) => Extras.periodExtras(draft,store,'staff','daily',fresh);
  period.extras09 = current(period,true);
  assert.deepEqual(Extras.housingKeys.map(key => current(period)[key].amount),[10000,10000]);
  Object.assign(period.extras09.housing,{amount:5000,useStandard:false});
  Object.assign(period.extras09.utilities,{amount:0,enabled:false,useStandard:false});
  const reloaded = JSON.parse(JSON.stringify(period));
  store.extraProfiles09.staff.housing.amount = 12500;
  assert.deepEqual(Extras.housingKeys.map(key => current(reloaded)[key].amount),[5000,0]);
  const next = Payroll.create('2026-12',null,null,'木曜設定');
  assert.deepEqual(Extras.housingKeys.map(key => current(next,true)[key].amount),[12500,10000]);
  for (const key of Extras.housingKeys) reloaded.extras09[key].useStandard = true;
  assert.deepEqual(Extras.housingKeys.map(key => current(reloaded)[key].amount),[12500,10000]);
});

test('legacy monthly amounts are preserved and unset standards remain unconfigured', () => {
  const {period,extra} = example();
  period.extras09 = extra;
  extra.housing.amount = 5000;
  const housing = {id:'custom',name:'住宅料金',amount:10000,calc:'manual',recurring:true};
  const store = {profiles:{staff:{deductions:[housing]}}};
  assert.equal(Extras.periodExtras(period,store,'staff','daily').housing.amount,5000);
  const next = Payroll.create('2026-12',null);
  const fresh = Extras.periodExtras(next,store,'staff','daily',true);
  assert.equal(fresh.housing.amount,10000);
  assert.equal(fresh.utilities.enabled,false);
  assert.equal(fresh.utilities.amount,0);
  assert.equal(Extras.standardDeduction(store,'staff','utilities'),undefined);
});

test('disabling employee housing stops only standard deductions and preserves the amounts for re-enabling', () => {
  const profile = {
    housing:{amount:10000,enabled:true,reason:'',confirmed:false},
    utilities:{amount:10000,enabled:true,reason:'',confirmed:false}
  };
  const store = {extraProfiles09:{staff:profile}};
  const {period} = example();
  const current = (draft, fresh = false) => Extras.periodExtras(draft,store,'staff','daily',fresh);
  const amounts = extras => Extras.housingKeys.map(key => extras[key].enabled ? extras[key].amount : 0);
  assert.equal(Extras.usesHousingDeductions(store,'unknown'),false);
  assert.equal(Extras.usesHousingDeductions(store,'staff'),true);
  period.extras09 = current(period,true);
  assert.deepEqual(amounts(current(period)),[10000,10000]);
  period.extras09.housing = {...period.extras09.housing,amount:5000,useStandard:false};
  profile.housingEnabled144 = false;
  assert.equal(Extras.usesHousingDeductions(store,'staff'),false);
  assert.deepEqual(amounts(current(period)),[5000,0]);
  const next = Payroll.create('2026-12',null);
  assert.deepEqual(amounts(current(next,true)),[0,0]);
  assert.equal(Extras.standardDeduction(store,'staff','utilities').amount,10000);
  profile.housingEnabled144 = true;
  assert.deepEqual(amounts(current(next,true)),[10000,10000]);
  assert.deepEqual(amounts(current(period)),[5000,10000]);
  Extras.validateStore(store,[{id:'staff'}]);
});

test('updated saved attendance creates a draft while preserving the prior payroll for reconfirmation', () => {
  const employeeId = 'staff';
  const month = '2026-11';
  const key = employeeId+':'+month;
  const state = {employees:[{id:employeeId,mode:'daily',rate:1200},{id:'peer'}],months:{},
    payrollV07:{periods:{}}};
  const period = Payroll.create(month,null,null,'サン');
  const terms = {effectiveFrom:'2026-10-16',mode:'daily',rate:1200,specialSalary:0,
    special:{...Payroll.specialDefaults('サン'),legalConfirmed:true,legalBasis:'テスト'}};
  const dateGroups = [[],[]];
  for (const date of Period.period(month).dates) {
    dateGroups[new Date(date+'T00:00:00Z').getUTCDay()===4?1:0].push(date);
  }
  const attend = date => {
    const bucket = state.months[employeeId+':'+date.slice(0,7)] ||= {rows:{}};
    bucket.rows[+date.slice(8)] = {times:['06:00','10:00','14:00','18:00'],am:true,pm:true,reviewed:true};
  };
  dateGroups[0].slice(0,19).forEach(attend);
  dateGroups[1].slice(0,3).forEach(attend);
  const calculate = draft => {
    const rows = Period.rows(state,employeeId,month);
    const plan = Employee.plan(rows,month,[terms],terms,'2026-11-19');
    return Extras.calculate(draft,Extras.defaults(draft,{},'daily'),plan,rows,table,0,true);
  };
  Object.assign(period.settings, {taxColumn:'kou',residency:'resident',insured:'no'});
  const old = calculate(period);
  assert.deepEqual([old.dayPay.regularDays,old.dayPay.saturdayDays,old.dayPay.base,old.dayPay.allowance],[19,3,182400,36000]);
  Payroll.freeze(period,old,'2026-11-16T00:00:00Z');
  state.payrollV07.periods[key] = period;
  state.payrollV07.periods['peer:'+month] = {snapshot:{attendanceFingerprint:Payroll.attendanceKey(Period.rows(state,'peer',month))}};
  assert.deepEqual(Payroll.attendanceRevisions(state),[]);
  dateGroups[0].slice(19,22).forEach(attend);
  dateGroups[1].slice(3,4).forEach(attend);
  const [change,...others] = Payroll.attendanceRevisions(state);
  assert.deepEqual(others,[]);
  assert.equal(change.key,key);
  assert.equal(change.next.attendanceRevisionPending,true);
  assert.deepEqual(change.next.revisions,[period.snapshot]);
  assert.equal(change.next.snapshot,null);
  const persisted = JSON.parse(JSON.stringify(change.next));
  const latest = calculate(persisted);
  assert.deepEqual([latest.dayPay.regularDays,latest.dayPay.saturdayDays,latest.dayPay.base,latest.dayPay.allowance],[22,4,211200,48000]);
  Payroll.freeze(persisted,latest,'2026-11-19T00:00:00Z');
  state.payrollV07.periods[key] = persisted;
  assert.equal(persisted.snapshot.revision,2);
  assert.equal(persisted.revisions[0].dayPay.base,182400);
  assert.deepEqual(Payroll.attendanceRevisions(state),[]);
});
