const assert = require('node:assert/strict');
const {test} = require('node:test');
const {webcrypto} = require('node:crypto');
require('./core');
require('./attendance-core');
require('./period-core');
const P = require('./payroll-core');
const E = require('./employee-core');
const X = require('./payroll-extras');
const V = require('./account-vault');
const table = require('./tax-2026');

function fixture() {
  const period = P.create('2026-11',null,null,'サン');
  Object.assign(period.settings,{insured:'yes',eiConfirmed:true,taxColumn:'kou',dependents:0,residency:'resident',taxConditions:true,socialConfirmed:true});
  const condition = {effectiveFrom:'2026-10-16',mode:'daily',rate:1200,specialSalary:0,
    special:{...P.specialDefaults('サン'),legalConfirmed:true,legalBasis:'計算テスト'}};
  const rows = ['2026-10-16','2026-10-22'].map(date => ({date,am:true,pm:true,reviewed:true,times:['05:00','08:00','15:00','18:00']}));
  const plan = E.plan(rows,period.month,[condition],condition,'2026-11-20');
  const extra = X.defaults(period,{},'daily',true);
  return {period,extra,plan,rows,run:() => X.calculate(period,extra,plan,rows,table)};
}

test('n is pending, 3 yields 40,000, OFF yields zero and item order is stable', () => {
  const {extra,run} = fixture();
  assert.equal(run().gross,null);
  assert.equal(run().net,null);
  assert.equal(run().ready,false);
  extra.special.n = 3;
  assert.deepEqual(run().earnings.map(item => item.amount),[9600,12000,40000,0]);
  assert.equal(run().gross,61600);
  extra.special.enabled = false;
  assert.equal(run().gross,21600);
});
test('period carries coefficients, not n or leave days', () => {
  const {period,extra} = fixture();
  extra.special.n = 3;
  const next = X.defaults(period,{a:11000,b:9000,housing:{amount:12500,enabled:true,reason:'テスト'}},'daily',true);
  assert.deepEqual(next.special,{enabled:true,formula:true,a:11000,b:9000,n:null});
  assert.equal(next.leave.days,null);
  assert.equal(next.housing.amount,12500);
  assert.equal(next.housing.confirmed,false);
});
test('leave accepts a half day and prevents attendance overlap or wrong totals', () => {
  const {extra,run} = fixture();
  extra.special.enabled = false;
  extra.leave = {enabled:true,days:0.5,dates:'2026-11-06 午後',confirmed:true};
  assert.equal(run().gross,26400);
  extra.leave.dates = '2026-10-22 午後';
  assert.equal(run().gross,null);
  extra.leave.dates = '2026-11-16 午後';
  assert.equal(run().gross,null);
  extra.leave.dates = '2026-11-06';
  assert.equal(run().gross,null);
  extra.leave.enabled = false;
  assert.equal(run().gross,21600);
});
test('housing and utility require grounds and are included only when checked', () => {
  const {extra,run} = fixture();
  extra.special.enabled = false;
  extra.housing.enabled = extra.utilities.enabled = true;
  assert.equal(run().net,null);
  for (const key of ['housing','utilities']) Object.assign(extra[key],{reason:'照合テスト',confirmed:true});
  assert.equal(run().deductionTotal,20108);
  assert.equal(run().net,1492);
  extra.utilities.enabled = false;
  assert.equal(run().deductionTotal,10108);
});
test('existing fixed amount remains available and is not duplicated', () => {
  const {period,extra,run} = fixture();
  period.earnings.find(i=>i.id==='special').amount=25000;
  extra.special.formula=false;
  assert.equal(run().gross,46600);
  assert.equal(run().earnings.filter(i=>i.name==='特別給与').length,1);
  period.earnings.push({id:'extra',name:'特別給与',kind:'salary',source:'manual',amount:10000});
  assert.equal(run().gross,null);
  assert.equal(run().ready,false);
});
test('freeze preserves inputs, formal rate and results after later changes', () => {
  const {period,extra,run} = fixture();
  extra.special.n=3;
  const result=run();
  P.freeze(period,result,'2026-11-20T00:00:00Z');
  extra.special.a=99999;
  assert.equal(period.snapshot.gross,61600);
  assert.equal(period.snapshot.extras09.special.a,10000);
  assert.equal(period.snapshot.settings.eiRate,.005);
  const store={profiles:{},periods:{'x:2026-11':period},taxTables:{}};
  P.validateStore(store,[{id:'x'}]);
  X.validateStore(store,[{id:'x'}]);
});
for (const [base,special,saturday,tax,reference,net] of [[192000,40000,54000,7820,4150,254030],[211200,50000,48000,9160,4490,275550]]) {
  test('historical Excel ledger '+net, () => {
    const gross=base+special+saturday;
    assert.equal(P.temporary(gross),reference);
    assert.equal(gross-tax-reference-20000,net);
    const {period}=fixture();
    assert.notEqual(P.employment(gross,period.settings).amount,reference);
    assert.equal(P.employment(gross,{...period.settings,eiConfirmed:false}).amount,null);
    assert.equal(P.income(gross,period.settings,null,0).amount,null);
  });
}
test('vault is encrypted, round-trips leading zeros, binds ID and rejects wrong password', async () => {
  const fake={bank:'テスト専用',branch:'架空',bankCode:'0000',branchCode:'000',type:'普通',number:'0000012',holder:'テスト'};
  const phrase='fictional test phrase';
  const encrypted=await V.seal(webcrypto,'test-a',fake,phrase);
  assert(!JSON.stringify(encrypted).includes(fake.number));
  assert.deepEqual(await V.open(webcrypto,'test-a',encrypted,phrase),fake);
  assert.equal(V.mask(fake.number),'•••••12');
  await assert.rejects(V.open(webcrypto,'test-b',encrypted,phrase));
  await assert.rejects(V.open(webcrypto,'test-a',encrypted,'another fake phrase'));
  await assert.rejects(V.seal(webcrypto,'test-a',fake,'short'));
});
