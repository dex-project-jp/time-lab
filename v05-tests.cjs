// Synthetic schema fixtures only. These are not real-photo accuracy references.
const assert=require('node:assert/strict');global.OcrCore=require('./ocr-core');global.ImportCore=require('./import-core');global.TimeCore=require('./core');const C=require('./cell-core'),E=require('./exchange-core'),P=require('./period-core');let n=0;function test(name,fn){fn();n++;console.log('OK '+name)}
const employee={id:'a',name:'テスト'},card={month:'2026-10',employeeName:'テスト',rows:[{date:'2026-10-17',in1:'06:11',out1:'09:12',in2:'14:13',out2:'18:14'}]},parse=v=>E.parse(JSON.stringify(v),'2026-10','first',31,employee);
test('Screenshot JSON named columns are converted to four times',()=>assert.deepEqual(parse(card)[0].times,['06:11','09:12','14:13','18:14']));
test('Code fences and commentary copied together',()=>assert.equal(E.parse('結果\n```json\n'+JSON.stringify(card)+'\n```','2026-10','first',31,employee)[0].day,17));
test('Infer month only from explicit same-month ISO dates',()=>{let c={...card};delete c.month;assert.equal(parse(c)[0].day,17)});
test('Missing photograph reply gets specific error',()=>assert.throws(()=>parse({error:'写真がありません'}),/写真がありません/));
test('Employee mismatch rejected',()=>assert.throws(()=>parse({...card,employeeName:'別の人'}),/employeeName/));
test('Employee ID mismatch rejected',()=>assert.throws(()=>parse({...card,employeeId:'b'}),/employeeId/));
test('Name alias requires explicit user confirmation',()=>assert.equal(E.parse(JSON.stringify({...card,employeeName:'別表記'}),'2026-10','first',31,employee,true).length,1));
test('Missing named time field rejected',()=>assert.throws(()=>parse({...card,rows:[{date:'2026-10-17',in1:'06:11'}]}),/4項目/));
test('Unknown values null stay empty candidates',()=>assert.deepEqual(parse({...card,rows:[{date:'2026-10-17',times:[null,null,null,null]}]})[0].times,['','','','']));
test('Invalid time rejected before import',()=>assert.throws(()=>parse({...card,rows:[{date:'2026-10-17',times:['29:00',null,null,null]}]}),/不正な時刻/));
test('Duplicate date rejected',()=>assert.throws(()=>parse({...card,rows:[card.rows[0],card.rows[0]]}),/重複/));
test('Period path accepts full-date named time fields',()=>assert.equal(P.parse(JSON.stringify({...card,payrollMonth:'2026-11'}),'2026-11','a')[0].date,'2026-10-17'));
test('Cell recognition needs two valid agreements',()=>assert.equal(C.select([{text:'611',confidence:90}],1).value,null));
test('Conflicting valid times remain null',()=>assert.equal(C.select([{text:'611',confidence:90},{text:'612',confidence:90}],1).value,null));
test('Stable time candidates normalized HH:MM',()=>assert.equal(C.select([{text:'611',confidence:90},{text:'6:11',confidence:80}],1).value,'06:11'));
test('Date OCR range strict',()=>assert.equal(C.select([{text:'32',confidence:90},{text:'32',confidence:90}],0).value,null));
test('Blank cells never become a time',()=>assert.equal(C.select([{text:'',confidence:100},{text:'',confidence:100}],1).value,null));
test('Date recognition is independent of manual row mapping',()=>assert.equal(C.select([{text:'17',confidence:84},{text:'17',confidence:79}],0).value,17));
test('Unconfirmed and blank references excluded from main accuracy',()=>{let m=C.metrics([{row:0,column:1,expected:'04:30',confirmed:false},{row:0,column:2,expected:null,confirmed:true}],[]);assert.equal(m['午前出勤'].total,0);assert.equal(m['午前退勤'].accuracy,null)});
test('Metrics classify wrong unread correct and handwriting separately',()=>{let refs=[{row:0,column:1,expected:'04:30',confirmed:true,handwritten:true},{row:0,column:2,expected:'08:00',confirmed:true},{row:0,column:3,expected:'14:00',confirmed:true}],r=[{row:0,cells:[{value:16},{value:'04:30'},{value:null},{value:'14:01'}]}],m=C.metrics(refs,r);assert.equal(m['手書き修正'].correct,1);assert.equal(m['午前退勤'].unread,1);assert.equal(m['午後出勤'].wrong,1)});
test('Empty background has no text bounding box',()=>{let p=new Uint8ClampedArray(20*20*4).fill(255);assert.equal(C.bounds(C.clean(p,20,20),20,20),null)});
test('Same parser used by prompt: month date times employeeName',()=>{let prompt=E.prompt('2026-10');for(let key of ['"month"','"date"','"times"','"employeeName"'])assert.ok(prompt.includes(key))});
console.log(n+' v0.5 schema, cell consensus and verified-metric tests passed');
