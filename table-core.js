(function(root){'use strict';
const labels=['日付','午前出勤','午前退勤','午後出勤','午後退勤'];
const norm=s=>String(s??'').normalize('NFKC').replace(/[\u200b-\u200d\uFEFF]/g,'').trim();
const nameKey=s=>norm(s).replace(/\s/g,'');
function time(value,date,col){let s=norm(value).replace(/\*\*/g,'');if(/^(?:|[-—–ー―]+|null|不明|未読|判読不能|空欄|休み|休|なし)$/i.test(s))return '';let m=s.match(/^(\d{1,2})\s*[:時]\s*(\d{2})分?$/);if(!m||+m[1]>23||+m[2]>59)throw Error(`${date} ${labels[col+1]}「${s}」を確認してください。時刻はHH:MM、不明は空欄にします`);return m[1].padStart(2,'0')+':'+m[2]}
function parse(text,salaryMonth,employee){if(typeof text!=='string'||text.length>1000000)throw Error('解析結果は1MB以下にしてください');const p=root.PeriodCore.period(salaryMonth),s=text.normalize('NFKC').replace(/[\u200b-\u200d\uFEFF]/g,'').replace(/```[^\n]*\n?/g,'').replace(/\r/g,'');if(/^\s*\{/.test(s)){let src=root.ImportCore.document(s).source;root.ExchangeCore.employee({source:src},employee);return {name:src.employeeName||'',records:root.PeriodCore.parse(s,salaryMonth,employee.id)}}
let lines=s.split('\n').map(x=>x.replace(/^ +| +$/g,'').replace(/\*\*/g,'')),names=lines.map(x=>x.match(/^(?:従業員名|従業員|氏名)\s*[:：]\s*(.+)$/)?.[1]).filter(Boolean);for(let n of names)if(!/^(?:不明|未読|空欄|null)$/.test(n)&&nameKey(n)!==nameKey(employee.name))throw Error(`従業員名が違います。表は「${n}」、選択中は「${employee.name}」です。従業員を選び直してください`);
let rows=[],header=false,stack=[];const clean=x=>norm(x).replace(/\s/g,'');
for(let line of lines){if(!line)continue;let cells;if(line.includes('|')){cells=line.split('|');if(!norm(cells[0]))cells.shift();if(!norm(cells.at(-1)))cells.pop();cells=cells.map(norm)}else if(line.includes('\t'))cells=line.split('\t').map(norm);else if(/\s{2,}/.test(line))cells=line.split(/\s{2,}/).map(norm);else cells=null;
if(cells&&labels.every((v,i)=>clean(cells[i])===v)){header=true;stack=[];continue}if(cells&&cells.every(x=>/^:?-+:?$/.test(x.replace(/\s/g,''))))continue;
if(!cells&&labels.includes(clean(line))){stack.push(clean(line));if(stack.length===5&&stack.every((v,i)=>v===labels[i])){header=true;stack=[]}continue}
if(!header)continue;
if(!cells&&/^\d{4}[-/年]/.test(line)){stack=[line];continue}if(!cells&&stack.length){stack.push(line);if(stack.length<5)continue;cells=stack;stack=[]}
if(!cells)continue;if(!/^\d/.test(norm(cells[0])))continue;
if(cells.length!==5)throw Error(`「${cells[0]}」の列数が${cells.length}です。日付と4時刻の5列をコピーしてください`);
let m=norm(cells[0]).match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:\s*[（(][日月火水木金土](?:曜(?:日)?)?[）)])?$/);if(!m)throw Error(`日付「${cells[0]}」に年・月・日が必要です。例: ${p.start}`);let date=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');rows.push({date,times:cells.slice(1).map((x,j)=>time(x,date,j))})}
if(stack.length)throw Error('表の末尾の列が不足しています。日付と4時刻をまとめてコピーしてください');if(!header||!rows.length)throw Error('日付・午前出勤・午前退勤・午後出勤・午後退勤の表が見つかりません。見出しから表全体をコピーしてください');
return {name:names[0]||'',records:root.PeriodCore.parse(JSON.stringify({payrollMonth:salaryMonth,rows}),salaryMonth,employee.id)}}
function validate(records,month,id){if(!records.length)throw Error('保存する日付がありません');let parsed=root.PeriodCore.parse(JSON.stringify({payrollMonth:month,employeeId:id,rows:records.map(r=>({date:r.date,times:r.times,am:r.am,pm:r.pm}))}),month,id);parsed.forEach((r,i)=>{let issues=root.TimeCore.inspect(r).errors;if(records[i].confirmed&&issues.length)throw Error(`${r.date}: ${issues.join(' / ')}。修正するか確認チェックを外してください`)});return parsed}
function apply(state,id,month,records){let valid=validate(records,month,id),result=root.PeriodCore.apply(state,id,month,valid);for(let date of result.dates){let i=valid.findIndex(r=>r.date===date),r=state.months[id+':'+date.slice(0,7)].rows[+date.slice(8)];r.reviewed=!!records[i].confirmed;r.importMethod='manual-chatgpt-table';r.note=r.reviewed?'写真と解析表を利用者が確認':'解析表から保存・写真との確認が必要'}return result}
function prompt(month){let p=root.PeriodCore.period(month);return `添付した同じ従業員のMAX S/ER-Sタイムカード写真を解析してください。1枚でも2枚でも読み取ってください。写真がなければ「写真が添付されていません」とだけ回答し、推測しないでください。従業員名と実際の年月を写真から確認し「従業員名：氏名」を表の上に表示。不明なら「従業員名：不明」。別人の写真は混ぜず確認を求めてください。給与対象月は${month}、15日締めの${p.start}〜${p.end}です。前月16日〜月末と当月1〜15日を1期間にします。カードの前半/後半の印刷より各行の実際の日付を優先してください。日付不明の行は推測せず別途報告。右端の時間数欄は打刻ではありません。明確な手書き修正は修正後を優先し、重なりで不明な時刻は推測しないで空欄にしてください。JSONは出力せず、次の見出しの日本語表を1つ表示してください。日付は必ずYYYY-MM-DD、時刻はHH:MM。不明と空欄は空セル。\n| 日付 | 午前出勤 | 午前退勤 | 午後出勤 | 午後退勤 |\n| --- | --- | --- | --- | --- |\n全日付を1日1行、同じ日を重複させず、写真にある値だけを記載してください。表の外に注意事項を記載しても構いません。TIME LABへ表全体をコピーして取り込みます。`}
root.TableCore={parse,validate,apply,prompt,time};if(typeof module!=='undefined')module.exports=root.TableCore;
})(typeof window!=='undefined'?window:globalThis);
