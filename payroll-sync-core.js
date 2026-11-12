'use strict';
const PayrollSync = (() => {
  const headers = [
    '同期キー','給与対象年','給与対象月','従業員ID','氏名','給与方式','期間開始','期間終了',
    '通常出勤日数','特別出勤日数','勤務時間（分）','基本給','土曜出勤手当','特別給与',
    'その他支給項目JSON','支給総額','所得税','雇用保険','住宅料金','水道光熱費',
    'その他控除項目JSON','控除総額','差引支給額','確定状態','同期日時','更新識別子',
    '支給明細JSON','控除明細JSON','所得税還付','端末確定日時','内容識別子'
  ];
  const modes = {daily:'日給月給', hourly:'時給', fixed:'固定給'};
  function period(month) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw Error('給与対象月を確認してください');
    const [year, number] = month.split('-').map(Number);
    const previous = new Date(Date.UTC(year, number - 2, 16));
    return {start:previous.toISOString().slice(0,10), end:month+'-15'};
  }
  function fromSnapshot(employee, month, snapshot) {
    if (!snapshot) return null;
    const items = (list, side) => list.map(({id,name,amount,source,calc,overrideFor}) => {
      let field = side === 'earnings'
        ? source === 'attendance' ? 'base' : source === 'specialAttendance' ? 'saturday' : id
        : ({income:'tax',employment:'ei'})[overrideFor || calc] || id;
      const known = side === 'earnings' ? ['base','saturday','special'] : ['tax','ei','housing','utilities'];
      return {id,name,amount,field:known.includes(field) ? field : null};
    });
    return {
      month, id:employee.id, name:employee.name, mode:snapshot.options?.mode,
      normalDays:snapshot.dayPay?.regularDays ?? (snapshot.options?.mode === 'hourly' && snapshot.special?.count === 0 ? snapshot.summary?.days : null) ?? null,
      specialDays:snapshot.dayPay?.saturdayDays ?? snapshot.special?.count ?? null,
      minutes:snapshot.summary?.minutes ?? null,
      earnings:items(snapshot.earnings,'earnings'), deductions:items(snapshot.deductions,'deductions'),
      gross:snapshot.gross, deductionTotal:snapshot.deductionTotal, net:snapshot.net,
      refund:snapshot.taxRefund ?? null, finalizedAt:snapshot.at, status:'確定'
    };
  }
  function normalize(row) {
    period(row.month);
    const str = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;
    const count = value => value === null || (typeof value === 'number' && value >= 0 && value <= 31 && Number.isInteger(value * 2));
    const money = value => Number.isSafeInteger(value) && Math.abs(value) <= 1000000000000;
    const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(row.id) || !str(row.name,120) ||
        !Object.prototype.hasOwnProperty.call(modes,row.mode) || row.status !== '確定' || !date(row.finalizedAt) ||
        !count(row.normalDays) || !count(row.specialDays) ||
        !(row.minutes === null || Number.isSafeInteger(row.minutes) && row.minutes >= 0 && row.minutes <= 44640) ||
        ![row.gross,row.deductionTotal,row.net].every(money) || !(row.refund === null || money(row.refund))) {
      throw Error('確定給与の内容を確認してください');
    }
    const list = (items, fields) => {
      if (!Array.isArray(items) || items.length > 105) throw Error('給与明細を確認してください');
      return items.map(({id,name,amount,field}) => {
        if (!str(id,100) || !str(name,100) || !money(amount) || !(field === null || fields.includes(field))) {
          throw Error('給与明細に未確定または不正な項目があります');
        }
        return {id,name,amount,field};
      });
    };
    return {
      month:row.month,id:row.id,name:row.name,mode:row.mode,normalDays:row.normalDays,
      specialDays:row.specialDays,minutes:row.minutes,
      earnings:list(row.earnings,['base','saturday','special']),
      deductions:list(row.deductions,['tax','ei','housing','utilities']),
      gross:row.gross,deductionTotal:row.deductionTotal,net:row.net,
      refund:row.refund,finalizedAt:row.finalizedAt,status:row.status
    };
  }
  function values(row, at, revision, hash) {
    const p = period(row.month);
    const [year, month] = row.month.split('-').map(Number);
    const amount = (list, field) => {
      const matching = list.filter(item => item.field === field);
      return matching.length ? matching.reduce((total,item) => total + item.amount,0) : null;
    };
    const extras = list => JSON.stringify(list.filter(item => item.field === null));
    const e = row.earnings, d = row.deductions;
    return [
      row.month+':'+row.id,year,month,row.id,row.name,modes[row.mode],p.start,p.end,
      row.normalDays,row.specialDays,row.minutes,amount(e,'base'),amount(e,'saturday'),amount(e,'special'),
      extras(e),row.gross,amount(d,'tax'),amount(d,'ei'),amount(d,'housing'),amount(d,'utilities'),
      extras(d),row.deductionTotal,row.net,row.status,at,revision,JSON.stringify(e),JSON.stringify(d),
      row.refund,row.finalizedAt,hash
    ];
  }
  function plan(current, hash, expected) {
    if (current?.hash === hash) return 'same';
    if ((current?.revision ?? null) !== expected) return 'conflict';
    return current ? 'update' : 'insert';
  }
  return {headers,period,fromSnapshot,normalize,values,plan};
})();
if (typeof module !== 'undefined') module.exports = PayrollSync;
