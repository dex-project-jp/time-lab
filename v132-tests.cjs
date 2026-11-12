'use strict';
const assert = require('node:assert/strict');
require('./core');
require('./attendance-core');
require('./period-core');
const PayrollCore = require('./payroll-core');
const EmployeeCore = require('./employee-core');
const PayrollExtras = require('./payroll-extras');
const PayrollSync = require('./payroll-sync-core');
const tax = require('./tax-2026');

const month = '2026-11';
const condition = {
  mode:'fixed',effectiveFrom:'2026-10-16',rate:0,monthlyBase:123400,specialSalary:0,
  special:{...PayrollCore.specialDefaults(),rate:0,enabled:false}
};
const employee = {id:'a'.repeat(32),name:'架空 固定給',mode:'daily',rate:0};
const start = () => PayrollCore.create(month,null,null,employee.name);
const earningsPeriod = start();
Object.assign(earningsPeriod.settings,{taxColumn:'kou',residency:'resident',insured:'no'});
earningsPeriod.earnings.push({id:'additional',name:'追加支給',source:'manual',kind:'salary',amount:600,eiBase:true});
earningsPeriod.deductions.push({id:'other',name:'追加控除',calc:'manual',kind:'voluntary',amount:400});
earningsPeriod.deductions.find(item=>item.calc==='income').enabled = false;
const extras = PayrollExtras.defaults(earningsPeriod,undefined,'fixed',true);
extras.housing.enabled = true;
extras.housing.amount = 10000;
const plan = EmployeeCore.plan([],month,[condition],condition);
const result = PayrollExtras.calculate(earningsPeriod,extras,plan,[],tax,0,true);
assert.equal(result.ready,true);
assert.equal(result.gross,124000);
assert.equal(result.deductionTotal,10400);
assert.equal(result.net,113600);
assert.equal(result.options.mode,'fixed');
const snapshot = PayrollCore.freeze(earningsPeriod,result,'2026-11-12T09:00:00.000Z');
const row = PayrollSync.normalize(PayrollSync.fromSnapshot(employee,month,snapshot));
assert.equal(row.mode,'fixed');
assert.equal(row.minutes,null);
assert.equal(row.earnings.find(item=>item.field==='base').amount,123400);
assert.equal(row.net,113600);
const changedPlan = EmployeeCore.plan([],'2026-12',[condition],condition);
assert.equal(changedPlan.base,123400);
const updated = {...condition,effectiveFrom:'2026-11-16',monthlyBase:135000};
assert.equal(EmployeeCore.plan([],'2026-12',[condition,updated],condition).base,135000);
assert.equal(snapshot.gross,124000);
const store = {profiles:{},taxTables:{},periods:{[employee.id+':'+month]:earningsPeriod},employeeConditions:{[employee.id]:[condition]}};
const archived = {...employee,archivedAt132:'2026-11-12T10:00:00.000Z'};
PayrollCore.validateStore(JSON.parse(JSON.stringify(store)),[archived]);
EmployeeCore.validateStore(JSON.parse(JSON.stringify(store)),[archived]);
console.log('Fixed pay without attendance, monthly defaults, deductions, confirmed snapshots and archived backup passed');
