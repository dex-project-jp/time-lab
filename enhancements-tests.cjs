const fs=require('fs'),vm=require('vm'),assert=require('assert');
const el=()=>({addEventListener(){},style:{}}),els={};const ctx={console,crypto:require('crypto').webcrypto,structuredClone,Date,Number,Set,Map,JSON,Math,Promise,Uint8Array,document:{querySelector:s=>els[s]||=(el()),querySelectorAll:()=>[]},navigator:{},location:{protocol:'file:'}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/core.js','utf8'),ctx);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8').replace('\ninit();','\n'),ctx);vm.runInContext(fs.readFileSync(__dirname+'/enhancements.js','utf8'),ctx);
function run(s){return vm.runInContext(s,ctx)}
assert.equal(run(`ChappyCore.parse('{"month":"2026-11","rows":[{"day":1,"times":["05:00","08:00",null,null]}]}','2026-11','first',30)[0].times[0]`),'05:00');
for(const rows of [[{day:1,times:['25:00','','','']}],[{day:16,times:['','','','']}],[{day:31,times:['','','','']}],[{day:1,times:['','','','']},{day:1,times:['','','','']}],[{day:1,times:[null,null,null,null],am:'yes'}]]){ctx.payload=JSON.stringify({month:'2026-11',rows});assert.throws(()=>run("ChappyCore.parse(payload,'2026-11','first',30)"))}
ctx.payload=JSON.stringify({month:'2026-12',rows:[]});assert.throws(()=>run("ChappyCore.parse(payload,'2026-11','first',30)"));
assert.equal(run("ChappyCore.pay({days:24.5},{monthly:260000,scheduled:26,allowance:10000,deductions:20000},'daily').total"),235000);
assert.equal(run("ChappyCore.pay({wage:8400},{allowance:1000,deductions:400},'hourly').total"),9000);
const backup={version:1,employees:[{id:'12345678-1234-1234-1234-123456789abc',name:'互換テスト',mode:'daily',rate:0}],month:'2026-11',selected:'12345678-1234-1234-1234-123456789abc',months:{'12345678-1234-1234-1234-123456789abc:2026-11':{rows:{1:{day:1,times:['05:00','08:00','',''],am:true,pm:false,reviewed:true,original:[],note:'',sourceIds:[]}},images:[],settings:{mode:'daily',rate:0}}}};
ctx.payload=JSON.stringify(backup);assert.equal(run('JSON.stringify(validateBackup(JSON.parse(payload)))'),ctx.payload);
backup.months[backup.selected+':2026-11'].payroll={scheduled:26,monthly:260000};backup.months[backup.selected+':2026-11'].rows[1].history=[{times:['','','','']}];ctx.payload=JSON.stringify(backup);assert.equal(run('JSON.stringify(validateBackup(JSON.parse(payload)))'),ctx.payload);
console.log('11 JSON validation, payroll and v1 backup compatibility checks passed');
