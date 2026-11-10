// Synthetic payroll/UI regression tests. Not verified individual attendance.
const a=require('node:assert/strict');require('./core');const A=require('./attendance-core'),P=require('./payroll-core'),R=require('./period-core'),E=require('./employee-core'),T=require('./tax-2026');let n=0;function test(name,f){f();n++;console.log('OK',name)}
function row(date,half=false){return {date,times:half?['05:00','08:00','','']:['05:00','08:00','15:00','18:00'],am:true,pm:!half,reviewed:true,original:[],sourceIds:[]}}
const rows=[];for(let d=new Date('2026-10-16Z');d<=new Date('2026-11-11Z');d.setUTCDate(d.getUTCDate()+1)){let date=d.toISOString().slice(0,10);if(d.getUTCDay()!==0&&date!=='2026-10-17')rows.push(row(date))}
function c(name='サン'){return {effectiveFrom:'2026-10-16',mode:'daily',rate:1200,specialSalary:0,special:{...P.specialDefaults(name),legalConfirmed:true,legalBasis:'架空の計算検証'}}}
function plan(rs=rows,h=[c()],fb=c()){return E.plan(rs,'2026-11',h,fb,'2026-11-20')}
function calc(h=[c()],rs=rows){const q=plan(rs,h),p=P.create('2026-11',null,null,'サン');Object.assign(p.settings,{insured:'yes',eiConfirmed:true,taxColumn:'kou',dependents:0,residency:'resident',taxConditions:true,socialConfirmed:true});p.earnings.find(i=>i.id==='special').amount=q.specialSalary;return {p,q,r:P.calculate(p,q.summary,{mode:q.mode,rate:q.rate},T,rs,q)}}
test('22 days split19+3 basic182400 allowance36000 gross218400',()=>{let {r}=calc();a.equal(r.dayPay.regularDays,19);a.equal(r.dayPay.saturdayDays,3);a.equal(r.gross,218400);a.equal(r.dayPay.base,182400);a.equal(r.dayPay.allowance,36000);a(r.ready)});
test('monthly special20000 independent',()=>{let v=c();v.specialSalary=20000;a.equal(calc([v]).r.gross,238400)});
test('other earning and deduction instant arithmetic',()=>{let {p,q}=calc();p.earnings.push({id:'x',name:'追加',kind:'salary',source:'manual',amount:5000});p.deductions.push({id:'y',name:'その他控除',kind:'voluntary',calc:'manual',amount:2000,reason:'検証',legalConfirmed:true});let r=P.calculate(p,q.summary,{mode:'daily',rate:1200},T,rows,q);a.equal(r.gross,223400);a.equal(r.net,r.gross-r.deductionTotal)});
test('Sunday F Heong',()=>{let q=plan([row('2026-11-01'),row('2026-11-02')],[c('フオン')]);a.equal(q.dayPay.saturdayDays,1);a.equal(q.dayPay.regularDays,1);a.equal(q.base,9600);a.equal(q.special.amount,12000)});
test('half day .5',()=>{let rs=structuredClone(rows);rs[rs.findIndex(x=>x.date==='2026-11-05')]=row('2026-11-05',true);a.equal(calc([c()],rs).r.gross,212400)});
test('rate1400 all period',()=>{let v=c();v.rate=v.special.rate=1400;a.equal(calc([v]).r.gross,254800)});
test('midperiod rate split by effective actual dates',()=>{let v=c();v.effectiveFrom='2026-11-01';v.rate=v.special.rate=1500;let q=plan(rows,[c(),v]);let expected=rows.reduce((x,r)=>{let rate=r.date>='2026-11-01'?1500:1200;return x+rate*8*(new Date(r.date+'T00:00:00Z').getUTCDay()===4?1.25:1)},0);a.equal(q.base+q.special.amount,expected);a.equal(q.conditions.length,2)});
test('future condition not applied early',()=>{let v=c();v.effectiveFrom='2026-11-16';v.rate=v.special.rate=1500;a.equal(calc([c(),v]).r.gross,218400)});
test('rounding hourly after month total',()=>{let v=c();v.mode='hourly';v.special.enabled=false;let rs=[row('2026-11-02',true),row('2026-11-03',true)];rs[0].times[1]='08:01';rs[1].times[1]='08:02';let q=plan(rs,[v]);a.equal(q.summary.minutes,363);a.equal(q.summary.payroll,375);a.equal(q.base,7500)});
test('custom Saturday hours preserved without changing regular8h',()=>{let v=c();v.special.hours=6;let q=plan(rows,[v]);a.equal(q.base,182400);a.equal(q.special.amount,27000)});
test('conditions history roundtrip and old source untouched',()=>{let fb=c();fb.effectiveFrom='2000-01-01';let v=c(),before=JSON.stringify(v),h=E.put([],v,fb);a.equal(h.length,2);a.equal(JSON.stringify(v),before);a.deepEqual(JSON.parse(JSON.stringify(h)),h);a.equal(E.at(h,'2026-10-15',fb).effectiveFrom,'2000-01-01')});
test('same effective date replaces with no duplicate',()=>{let h=E.put([c()],c(),c());a.equal(h.length,1)});
test('past frozen payroll immutable after rate update',()=>{let {p,r}=calc();P.freeze(p,r,'2026-11-20T00:00:00Z');const before=JSON.stringify(p.snapshot);let v=c();v.rate=v.special.rate=1500;calc([v]);a.equal(JSON.stringify(p.snapshot),before);P.revise(p);a.equal(JSON.stringify(p.revisions[0]),before)});
test('backup accepts new condition and split snapshot',()=>{let {p,r}=calc();P.freeze(p,r,'2026-11-20T00:00:00Z');let store={profiles:{},periods:{'a:2026-11':p},taxTables:{},employeeConditions:{a:[c()]}};P.validateStore(store,[{id:'a'}]);E.validateStore(store,[{id:'a'}])});
test('old no conditions accepted',()=>E.validateStore({profiles:{},periods:{},taxTables:{}},[{id:'a'}]));
test('bad foreign employee condition refused',()=>a.throws(()=>E.validateStore({employeeConditions:{b:[c()]}},[{id:'a'}])));
test('invalid date rejected',()=>a.throws(()=>E.validate({...c(),effectiveFrom:'2026-02-30'})));
test('mismatched rates rejected',()=>a.throws(()=>E.validate({...c(),rate:1500})));
test('midperiod mode change held',()=>a.throws(()=>plan(rows,[c(),{...c(),mode:'hourly',effectiveFrom:'2026-11-01'}]),/方式変更/));
test('outside15 cutoff not counted',()=>{let q=plan([...rows,row('2026-10-15'),row('2026-11-16')]);a.equal(q.summary.days,22)});
test('eligible complete rows only',()=>a(E.eligible({...row('2026-11-02'),reviewed:false},null,'2026-11-20')));
test('missing punch not auto checked',()=>{let r=row('2026-11-02');r.times[1]='';a.equal(E.eligible(r,null,'2026-11-20'),false)});
test('all blank not auto checked',()=>a.equal(E.eligible({date:'2026-11-02',times:['','','',''],am:false,pm:false},null,'2026-11-20'),false));
test('future not auto checked',()=>a.equal(E.eligible(row('2027-11-02'),null,'2026-11-20'),false));
test('existing conflict not auto checked',()=>{let r=row('2026-11-02'),old=row(r.date);old.times[1]='08:01';a.equal(E.eligible(r,old,'2026-11-20'),false)});
test('identical existing row can be checked',()=>{let r=row('2026-11-02');a(E.eligible(r,structuredClone(r),'2026-11-20'))});
test('earning stable display order',()=>{let list=[{id:'bonus'},{id:'special'},{id:'base'},{id:'saturday'}];a.deepEqual(E.ordered(list).map(x=>x.id),['base','saturday','special','bonus']);a.equal(list[0].id,'bonus')});
test('unconfirmed tax or insurance net remains unknown',()=>{let {p,q}=calc();p.settings.eiConfirmed=false;let r=P.calculate(p,q.summary,{mode:'daily',rate:1200},T,rows,q);a.equal(r.net,null);a(!r.ready)});
test('Excel reference never formal1.45%',()=>{a.equal(P.temporary(286000),4150);a.equal(P.temporary(309200),4490);let {p,q}=calc();p.settings.eiRate=.0145;p.settings.business='custom';let r=P.calculate(p,q.summary,{mode:'daily',rate:1200},T,rows,q);a.equal(r.ei.amount,null)});
test('unconfirmed attendance not fixed',()=>{let rs=structuredClone(rows);rs[0].reviewed=false;a(!calc([c()],rs).r.ready)});
console.log(n+' v0.8 condition, split, confirmation and protection tests passed');
test('unconfirmed half blank session not auto confirmed',()=>{let r=row('2026-11-02',true);r.reviewed=false;a.equal(E.eligible(r,null,'2026-11-20'),false);a(E.eligible(r,null,'2026-11-20',true))});
test('confirmed half remains reusable by bulk',()=>a(E.eligible(row('2026-11-02',true),null,'2026-11-20')));
console.log(n+' total v0.8 tests passed');
test('known honorific spelling selects existing employee ID',()=>a.equal(E.match([{id:'old',name:'サン'}],' サンさん ').id,'old'));
test('ambiguous same-name IDs held for selection',()=>a.throws(()=>E.match([{id:'a',name:'サン'},{id:'b',name:'サンさん'}],'サン'),/複数/));
test('unrelated names never fuzzy merged',()=>a.equal(E.match([{id:'old',name:'フオン'}],'フォン'),undefined));
console.log(n+' final v0.8 tests passed');

test('unresolved OCR conflict note excluded from bulk',()=>{let r=row('2026-11-02');r.reviewed=false;r.note='OCR結果が不一致';a.equal(E.eligible(r,null,'2026-11-20'),false)});
console.log(n+' final v0.8 checks passed');
test('legacy manual base and Saturday automatically linked with original archived',()=>{let p=P.create('2026-11');p.earnings.find(i=>i.id==='base').source='manual';p.earnings.find(i=>i.id==='saturday').source='manual';p.earnings.find(i=>i.id==='saturday').amount=36000;let old=JSON.stringify(p.earnings);a(E.connect(p,'2026-11-11T00:00:00Z'));a.equal(p.earnings.find(i=>i.id==='base').source,'attendance');a.equal(JSON.stringify(p.conditionMigration[0].earnings),old);a.equal(E.connect(p,'2026-11-11T00:00:00Z'),false)});
test('auto linking never changes fixed result or its input items',()=>{let p=P.create('2026-11');p.snapshot={gross:36000};let old=JSON.stringify(p);a.equal(E.connect(p,'now'),false);a.equal(JSON.stringify(p),old)});
test('zero hourly legacy rate preserved',()=>{let v=E.legacy({id:'a',name:'someone',mode:'hourly',rate:0},{},{mode:'hourly',rate:0});a.equal(v.rate,0)});
console.log(n+' final v0.8 checks passed');
