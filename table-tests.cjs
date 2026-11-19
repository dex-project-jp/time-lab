const assert=require('node:assert/strict');global.ImportCore=require('./import-core');global.ExchangeCore=require('./exchange-core');global.TimeCore=require('./core');global.PeriodCore=require('./period-core');const T=require('./table-core');let n=0;function test(name,fn){fn();n++;console.log('OK',name)}
const e={id:'a'.repeat(32),name:'検証用',mode:'hourly',rate:1200},head='| 日付 | 午前出勤 | 午前退勤 | 午後出勤 | 午後退勤 |\n|---|---|---|---|---|\n',text='従業員名：検証用\n'+head+'|2026-10-16|06:00|09:11|||\n|2026-11-01|06:00|09:44|||';const read=s=>T.parse(s,'2026-11',e).records;
test('Markdown two-month period',()=>assert.equal(read(text).length,2));test('fences whitespace fullwidth',()=>assert.equal(read('```markdown\n'+text.replace('06:00','６：００')+'\n```')[0].times[0],'06:00'));test('rendered TSV including empty last cells',()=>assert.equal(read('日付\t午前出勤\t午前退勤\t午後出勤\t午後退勤\n2026-10-16\t06:00\t09:11\t\t')[0].times[3],''));
test('single-column rendered table',()=>assert.equal(read('日付\n午前出勤\n午前退勤\n午後出勤\n午後退勤\n2026-10-16\n06:00\n09:11\n不明\n不明')[0].times[3],''));test('unknowns not inferred',()=>assert.deepEqual(read(head+'|2026-10-16|不明|null|—|空欄|')[0].times,['','','','']));
for(const [name,s] of [['wrong name',text.replace('検証用','別人')],['invalid date',head+'|2026-10-32|06:00|09:11|||'],['invalid time',head+'|2026-10-16|25:00|09:11|||'],['no year',head+'|10/16|06:00|09:11|||'],['outside period',head+'|2026-10-15|06:00|09:11|||'],['duplicate',text+'\n|2026-10-16|06:00|09:11|||'],['missing column',head+'|2026-10-16|06:00|09:11||']])test(name,()=>assert.throws(()=>read(s)));
test('old JSON remains accepted',()=>assert.equal(read(JSON.stringify({payrollMonth:'2026-11',rows:[{date:'2026-10-16',times:['06:00','09:11',null,null]}]})).length,1));
function state(){return {version:1,employees:[e],months:{}}}
test('confirmation needed for payroll',()=>{let s=state(),rows=read(text);T.apply(s,e.id,'2026-11',rows);assert.equal(TimeCore.summary(PeriodCore.rows(s,e.id,'2026-11'),'hourly',1200).minutes,0)});
test('monthly total ceil15 and wages',()=>{let s=state(),rows=read(text).map(r=>({...r,confirmed:true}));T.apply(s,e.id,'2026-11',rows);let v=TimeCore.summary(PeriodCore.rows(s,e.id,'2026-11'),'hourly',1200);assert.equal(v.minutes,415);assert.equal(v.payroll,420);assert.equal(v.wage,8400)});
test('daily AM PM half days',()=>{let s=state(),rows=read(text).map(r=>({...r,confirmed:true}));T.apply(s,e.id,'2026-11',rows);assert.equal(TimeCore.summary(PeriodCore.rows(s,e.id,'2026-11'),'daily',0).days,1)});
test('no overwrite and employee separation',()=>{let s=state(),rows=read(text).map(r=>({...r,confirmed:true}));T.apply(s,e.id,'2026-11',rows);let before=JSON.stringify(s.months);assert.equal(T.apply(s,e.id,'2026-11',rows).skipped,2);assert.equal(JSON.stringify(s.months),before);s.employees.push({...e,id:'b'.repeat(32)});T.apply(s,'b'.repeat(32),'2026-11',rows);assert.ok(s.months['b'.repeat(32)+':2026-10'])});
test('incomplete cannot be confirmed atomic',()=>{let s=state(),r=read(head+'|2026-10-16|06:00||||');r[0].confirmed=true;assert.throws(()=>T.apply(s,e.id,'2026-11',r));assert.deepEqual(s.months,{})});
test('bad edited duplicate rejected atomically',()=>{let s=state(),rows=read(text);rows[1].date=rows[0].date;assert.throws(()=>T.apply(s,e.id,'2026-11',rows));assert.deepEqual(s.months,{})});
test('partial actual format remains unconfirmed',()=>{let s=state(),rows=read(head+'|2026-10-16|06:00||||');rows[0].am=true;T.apply(s,e.id,'2026-11',rows);assert.equal(s.months[e.id+':2026-10'].rows[16].reviewed,false)});
test('edited value retains original analysis text',()=>{let s=state(),rows=read(text);rows[0].times[1]='09:12';T.apply(s,e.id,'2026-11',rows);assert.equal(s.months[e.id+':2026-10'].rows[16].original[1].text,'09:11')});
console.log(n+' table tests passed');

test('manual editor normalizes numeric input and protects invalid times',()=>{
 const d='2026-11-01';
 assert.deepEqual(['０８３０','905','14:00',''].map((v,i)=>T.editorTime(v,d,i)),['08:30','09:05','14:00','']);
 for(const value of ['2400','0860','1','ab','-'])assert.throws(()=>T.editorTime(value,d,2),/午後出勤/);
});

test('selected replacement preserves unchecked and absent dates and recalculates minutes',()=>{
 const s=state(), id=e.id, month='2026-11';
 const select=(value,checked=true)=>read(value).map(r=>({...r,selectionVersion:1,confirmed:checked}));
 T.applySelected(s,id,month,select('2026-10-22 06:00 09:00 14:00 17:00\n2026-10-23 06:00 09:00 14:00 17:00\n2026-10-24 06:00 09:00 14:00 17:00\n2026-10-25 06:00 09:00 14:00 17:00'));
 const rows=select('2026-10-22 06:00 09:00 14:00 17:10\n2026-10-23 空欄 空欄 空欄 空欄\n2026-10-24 06:00 09:00 14:00 17:30');
 rows[0].times[3]='17:12';
 rows[2].confirmed=false;
 const bucket=s.months[id+':2026-10'];
 const other={...e,id:'b'.repeat(32)};
 s.employees.push(other);
 T.applySelected(s,other.id,month,select('2026-10-23 08:00 10:00 空欄 空欄'));
 const otherBefore=JSON.stringify(s.months[other.id+':2026-10']);
 assert.equal(T.applySelected(s,id,month,rows).replaced,2);
 assert.equal(bucket.rows[22].times[3],'17:12');
 assert.equal(bucket.rows[22].history[0].times[3],'17:00');
 assert.deepEqual(bucket.rows[23].times,['','','','']);
 assert.equal(bucket.rows[23].reviewed,true);
 assert.equal(bucket.rows[24].times[3],'17:00');
 assert.equal(bucket.rows[25].times[3],'17:00');
 assert.equal(JSON.stringify(s.months[other.id+':2026-10']),otherBefore);
 const wage=TimeCore.summary(PeriodCore.rows(s,id,month),'hourly',1200);
 assert.equal(wage.minutes,1092);
 assert.equal(wage.payroll,1095);
 assert.equal(TimeCore.summary(PeriodCore.rows(s,id,month),'daily',0).days,3);
 T.applySelected(s,id,month,rows);
 assert.equal(Object.keys(bucket.rows).length,4);
 assert.equal(bucket.rows[22].history.length,1);
});

test('unread or ambiguous blanks block a selected replacement until resolved',()=>{
 const s=state();
 const rows=read('2026-10-23 空欄 空欄 空欄 空欄\n2026-10-24 - 不明 - -').map(r=>({...r,selectionVersion:1,confirmed:true}));
 assert.deepEqual(rows[0].known,[true,true,true,true]);
 assert.throws(()=>T.applySelected(s,e.id,'2026-11',rows),/2026-10-24/);
 assert.deepEqual(s.months,{});
 rows[1].confirmed=false;
 assert.equal(T.applySelected(s,e.id,'2026-11',rows).added,1);
});
