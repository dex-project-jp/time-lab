(function (root) {
'use strict';

const labels = {special:'特別給与', leave:'有給休暇手当', housing:'住宅料金', utilities:'水道光熱費'};
const find = (items, key) => items.find(item => item.id === key || item.name.normalize('NFKC').trim() === labels[key]);
const money = (value, label) => root.PayrollCore.money(value, label);

function defaults(period, profile = {}, mode, fresh = false) {
  const deduction = key => {
    const old = find(period.deductions, key);
    const saved = profile[key];
    return {
      amount: old?.amount ?? profile[key]?.amount ?? 10000,
      enabled: old ? old.amount > 0 : !!profile[key]?.enabled,
      reason: old?.reason ?? profile[key]?.reason ?? '',
      confirmed: old ? old.legalConfirmed === true : saved?.confirmed === true && typeof saved.reason === 'string' && !!saved.reason.trim()
    };
  };
  return {
    special: { enabled: mode === 'daily', formula: fresh, a: profile.a ?? 10000, b: profile.b ?? 10000, n: null },
    leave: { enabled: false, days: null, dates: '', confirmed: false },
    housing: deduction('housing'),
    utilities: deduction('utilities')
  };
}

function calculate(period, extras, plan, rows, table, legacySpecial, simple = false) {
  const effective = structuredClone(period);
  const issues = [];
  if (simple) effective.settings.simplePayroll11 = true;
  const otherSocial = period.settings.otherSocial10;
  if (!simple && otherSocial === null) issues.push('社会保険料等の金額を入力してください');
  if (otherSocial > 0) {
    const alreadyListed = effective.deductions.some(item => item.socialInsurance && item.amount > 0 && item.overrideFor !== 'employment');
    if (alreadyListed) issues.push('社会保険料等が既存の控除と重複しています。内訳を確認してください');
    else if (!simple && !period.settings.socialConfirmed) issues.push('社会保険料等の金額を確認してください');
    else effective.deductions.push({id:'social10',name:'社会保険料等（雇用保険以外）',kind:'statutory',calc:'manual',
      amount:money(otherSocial),socialInsurance:true});
  }
  const special = extras.special;
  const oldSpecial = find(effective.earnings, 'special');
  let specialAmount = !special.formula ? (legacySpecial ?? oldSpecial?.amount ?? 0) : 0;
  if (!special.enabled && special.formula) specialAmount = 0;
  if (special.formula && special.enabled) {
    if (special.n === null && !simple) {
      specialAmount = null;
      issues.push('特別給与の n を入力してください');
    } else {
      specialAmount = money(money(special.a) * money(special.n ?? 0) + money(special.b), labels.special);
    }
  }

  let leaveAmount = 0;
  if (extras.leave.enabled) {
    try {
      leaveAmount = simple ? calculateLeave11(extras.leave, plan.rate) : calculateLeave(extras.leave, plan, rows, period.month);
    } catch (error) {
      leaveAmount = null;
      issues.push(error.message);
    }
  }

  function replace(items, key, record) {
    const old = find(items, key);
    if (old) {
      Object.assign(old, record, {name:labels[key]});
      return old.id;
    }
    items.push({id:key, name:labels[key], ...record});
    return key;
  }
  const specialId = replace(effective.earnings, 'special', {
    source:'manual', kind:oldSpecial?.kind ?? 'salary', eiBase:oldSpecial?.eiBase ?? true, amount:specialAmount ?? 0
  });
  const oldLeave = find(effective.earnings, 'leave');
  // Preserve any earlier manually entered leave allowance until the dedicated calculation is enabled.
  if (!extras.leave.enabled && oldLeave && !period.extras09?.leave?.touched) leaveAmount = oldLeave.amount;
  const leaveId = replace(effective.earnings, 'leave', {source:'manual', kind:oldLeave?.kind ?? 'salary', eiBase:oldLeave?.eiBase ?? true, amount:leaveAmount ?? 0});
  for (const key of ['housing','utilities']) {
    const item = extras[key];
    replace(effective.deductions, key, {
      calc:'manual', kind:'voluntary', amount:item.enabled ? money(item.amount) : 0,
      reason:item.reason, legalConfirmed:item.confirmed, enabled:item.enabled, socialInsurance:false, overrideFor:undefined
    });
  }
  let duplicate = false;
  for (const key of ['special','leave','housing','utilities']) {
    const items = key === 'special' || key === 'leave' ? effective.earnings : effective.deductions;
    if (items.filter(item => item.id === key || item.name.normalize('NFKC').trim() === labels[key]).length > 1) {
      duplicate = true;
      issues.push(labels[key]+'の項目が重複しています。追加項目を確認してください');
    }
  }

  const result = root.PayrollCore.calculate(effective, plan.summary, {mode:plan.mode, rate:plan.rate}, table, rows, plan);
  const rank = item => item.source === 'attendance' || item.id === 'base' ? 0 : item.source === 'specialAttendance' || item.id === 'saturday' ? 1 : item.id === specialId ? 2 : item.id === leaveId ? 3 : 4;
  result.earnings.sort((a,b) => rank(a)-rank(b));
  if (specialAmount === null || leaveAmount === null || duplicate) {
    result.referenceGross = result.gross;
    result.gross = null;
    result.temporaryEI = null;
    result.tax = {...result.tax, amount:null, note:'支給額の入力待ち'};
    result.ei = {...result.ei, amount:null, note:'支給額の入力待ち'};
    for (const item of result.deductions) if (['income','employment'].includes(item.calc)) item.amount = null;
    result.earnings.find(item => item.id === specialId).amount = specialAmount;
    result.earnings.find(item => item.id === leaveId).amount = leaveAmount;
  }
  if (issues.some(issue => issue.startsWith('社会保険料等'))) {
    for (const item of result.deductions) if (item.calc === 'income') item.amount = null;
    result.tax = {...result.tax,amount:null,note:'社会保険料等の金額が未確認'};
  }
  if (issues.length) {
    result.errors.push(...issues);
    result.net = result.deductionTotal = null;
    result.ready = false;
  }
  result.knownDeduction = result.deductions.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  result.extras09 = structuredClone(extras);
  return result;
}

function calculateLeave11(leave, rate) {
  const days = leave.days ?? 0;
  if (!Number.isFinite(days) || days < 0 || days > 31 || !Number.isInteger(days * 2)) throw Error('有給日数は0〜31日の0.5日単位で入力してください');
  return money(Math.round(rate * 8 * days), labels.leave);
}

function calculateLeave(leave, plan, rows, month) {
  const {start,end} = root.PeriodCore.period(month);
  if (!leave.confirmed) throw Error('有給休暇手当の算定方式を確認してください');
  if (leave.days === null) throw Error('有給日数を入力してください');
  const days = Number(leave.days);
  if (!Number.isFinite(days) || days < 0 || days > 31 || !Number.isInteger(days*2)) throw Error('有給日数は0〜31日の0.5日単位で入力してください');
  const entries = leave.dates.trim() ? leave.dates.trim().split(/\n+/) : [];
  let counted = 0;
  let amount = 0;
  const seen = new Set();
  for (const entry of entries) {
    const match = entry.trim().match(/^(\d{4}-\d{2}-\d{2})(?:\s+(午前|午後))?$/);
    if (!match || !root.EmployeeCore.date(match[1]) || match[1] < start || match[1] > end) throw Error('有給取得日を対象期間内の YYYY-MM-DD で入力してください');
    const [, date, half] = match;
    const sessions = half === '午前' ? [0] : half === '午後' ? [1] : [0,1];
    const attendance = rows.find(row => row.date === date);
    const condition = [...(plan.conditions || [])].reverse().find(item => item.effectiveFrom <= date);
    for (const session of sessions) {
      const key = date+':'+session;
      if (seen.has(key)) throw Error('有給取得日が重複しています');
      seen.add(key);
      if (attendance && (attendance[session === 0 ? 'am' : 'pm'] || attendance.times?.slice(session*2,session*2+2).some(Boolean))) {
        throw Error(date+' の有給と勤怠が重複しています。勤怠を確認してください');
      }
      counted += 0.5;
      amount += (condition?.rate ?? plan.rate)*4;
    }
  }
  if (counted !== days) throw Error('有給日数と取得日の合計を一致させてください');
  return money(amount, labels.leave);
}

function validateStore(store, employees) {
  if (!store) return;
  const ids = new Set(employees.map(employee => employee.id));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const deduction = value => {
    if (!object(value) || typeof value.enabled !== 'boolean' || typeof value.reason !== 'string' || value.reason.length > 200) throw Error('住宅・光熱費設定が不正です');
    money(value.amount);
  };
  if (store.extraProfiles09 !== undefined) {
    if (!object(store.extraProfiles09)) throw Error('従業員の支給・控除設定が不正です');
    for (const [id, profile] of Object.entries(store.extraProfiles09)) {
      if (!ids.has(id) || !object(profile)) throw Error('支給・控除設定の従業員が不正です');
      if (profile.deductionItems11 !== undefined) {
        if (!object(profile.deductionItems11) || Object.keys(profile.deductionItems11).length > 100) throw Error('翌月用控除設定が不正です');
        for (const [key,item] of Object.entries(profile.deductionItems11)) {
          if (item === null) continue;
          if (!object(item) || key !== item.id || typeof item.name !== 'string' || !item.name.trim() ||
              item.name.length > 80 || !['manual','income','employment'].includes(item.calc) ||
              !['statutory','voluntary'].includes(item.kind)) throw Error('翌月用控除項目が不正です');
          money(item.amount);
        }
      }
      for (const key of ['a','b']) if (profile[key] !== undefined) money(profile[key]);
      for (const key of ['housing','utilities']) if (profile[key] !== undefined) deduction(profile[key]);
    }
  }
  const check = extras => {
    if (extras === undefined) return;
    if (!object(extras?.special) || !object(extras.leave) ||
        typeof extras.special.enabled !== 'boolean' || typeof extras.special.formula !== 'boolean' ||
        typeof extras.leave.enabled !== 'boolean' || typeof extras.leave.confirmed !== 'boolean' ||
        typeof extras.leave.dates !== 'string' || extras.leave.dates.length > 1500 ||
        (extras.leave.days !== null && (!Number.isFinite(extras.leave.days) || extras.leave.days < 0 || extras.leave.days > 31 || !Number.isInteger(extras.leave.days*2)))) throw Error('月別の特別給与・有給設定が不正です');
    money(extras.special.a);
    money(extras.special.b);
    if (extras.special.n !== null) money(extras.special.n);
    deduction(extras.housing);
    deduction(extras.utilities);
  };
  for (const period of Object.values(store.periods || {})) {
    check(period.extras09);
    check(period.snapshot?.extras09);
    for (const revision of period.revisions || []) check(revision.extras09);
  }
}

root.PayrollExtras = {labels, find, defaults, calculate, calculateLeave, validateStore};
if (typeof module !== 'undefined') module.exports = root.PayrollExtras;
})(typeof window !== 'undefined' ? window : globalThis);
