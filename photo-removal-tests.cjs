'use strict';

const assert = require('node:assert/strict');
const PhotoRemoval = require('./photo-removal-core');
const month = '2026-11';
const key = 'employee:'+month;
const makeRow = (day,sourceIds=['target'])=>({
  day,times:['05:00','08:00','14:00','18:00'],am:true,pm:true,note:'',sourceIds,reviewed:true
});
const rows = Object.fromEntries(Array.from({length:8},(_,i)=>[i+1,makeRow(i+1)]));
rows[3].sourceIds.push('other');
rows[4].sourceIds = [];
rows[7].sourceIds = ['other'];
for (const day of [1,2,3,5,6,8]) PhotoRemoval.link(rows[day],'target');
PhotoRemoval.protect(rows[2]);
rows[6].times[0] = '05:05';
rows[8].history = [{times:['05:00','08:00','14:00','18:00']}];
const fixture = {
  months:{
    [key]:{images:[{id:'target'},{id:'other',localCandidates:[{day:5}]}],rows},
    'otherEmployee:2026-11':{images:[{id:'target'}],rows:{1:makeRow(1)}}
  },
  photoSets:{
    [key]:{first:{month,id:'target'}},
    'otherEmployee:2026-11':{first:{month,id:'target'}}
  },
  payrollV07:{periods:{[key]:{snapshot:{gross:9600,net:9600},revisions:[]}}}
};
const before = JSON.stringify(fixture);
const plan = PhotoRemoval.plan(fixture,'employee',month,'target');
assert.deepEqual(plan.rows.map(r=>r.date),['2026-11-01']);
assert.deepEqual(plan.kept.map(r=>r.day),['2','3','5','6','8']);
assert.equal(JSON.stringify(fixture),before,'preview and cancel are read-only');
const photoOnly = JSON.parse(before);
PhotoRemoval.remove(photoOnly,'employee',month,'target',false);
assert.deepEqual(photoOnly.months[key].rows,fixture.months[key].rows);
assert.deepEqual(photoOnly.payrollV07,fixture.payrollV07);
assert.deepEqual(photoOnly.photoSets[key],{});
assert.deepEqual(photoOnly.photoSets['otherEmployee:2026-11'],fixture.photoSets['otherEmployee:2026-11']);
const withRows = JSON.parse(before);
PhotoRemoval.remove(withRows,'employee',month,'target',true);
assert.deepEqual(Object.keys(withRows.months[key].rows),['2','3','4','5','6','7','8']);
assert.deepEqual(withRows.months[key].images,[{id:'other',localCandidates:[{day:5}]}]);
assert.deepEqual(withRows.months['otherEmployee:2026-11'],fixture.months['otherEmployee:2026-11']);
assert.deepEqual(withRows.payrollV07,fixture.payrollV07);
assert.throws(()=>PhotoRemoval.remove(withRows,'employee',month,'target',true),/見つかりません/);
assert.equal(PhotoRemoval.salaryMonth('2026-12-15'),'2026-12');
assert.equal(PhotoRemoval.salaryMonth('2026-12-16'),'2027-01');
console.log('Photo removal: read-only preview, photo-only preservation, linked attendance, edited and overlapping rows, employee and period isolation passed');
