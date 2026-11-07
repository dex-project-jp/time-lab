(function(root){
const minute=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')?+s.slice(0,2)*60 + +s.slice(3):null;
function inspect(r){let errors=[],minutes=0; for(let i=0;i<4;i+=2){let a=minute(r.times[i]),b=minute(r.times[i+1]);if(r.times[i]&&a===null||r.times[i+1]&&b===null)errors.push('時刻の形式');if((a===null)!==(b===null))errors.push('出勤・退勤の片方が未入力');if(a!==null&&b!==null){if(b<=a)errors.push('退勤が出勤以前');else minutes+=b-a;}}if(minute(r.times[1])!==null&&minute(r.times[2])!==null&&minute(r.times[2])<minute(r.times[1]))errors.push('午前・午後が重複');return {errors,minutes};}
function summary(rows,mode,rate){let minutes=0,full=0,half=0,pending=0;for(const r of rows){const v=inspect(r);let issue=v.errors.length||!r.reviewed;if(issue){pending++;continue;}if(mode==='daily'){if(r.am&&r.pm)full++;else if(r.am||r.pm)half++;}else minutes+=v.minutes;}let payroll=Math.ceil(minutes/15)*15;return {minutes,payroll,full,half,days:full+half*.5,pending,wage:Math.round(payroll/60*rate)};}
root.TimeCore={minute,inspect,summary};if(typeof module!=='undefined')module.exports=root.TimeCore;
})(typeof window!=='undefined'?window:globalThis);
