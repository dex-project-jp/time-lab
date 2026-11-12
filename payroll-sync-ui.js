'use strict';
(() => {
  const dialog = $('#payrollSyncDialog');
  const result = $('#payrollSyncStatus');
  const endpoint = $('#payrollSyncEndpoint');
  const prefsKey = 'time-lab-payroll-sync-endpoint-v1';
  const fixedKey = 'time-lab-fixed-payroll-v1';
  const readFixed = () => JSON.parse(localStorage.getItem(fixedKey) || '{"employee":null,"months":{}}');
  const report = message => { result.textContent = message; };
  const fieldNames = {base:'基本給',tax:'所得税',ei:'雇用保険',housing:'住宅料金',utilities:'水道光熱費',gross:'支給総額',deductionTotal:'控除総額',net:'差引支給額'};
  let targetMonth;
  function render() {
    const fixed = readFixed();
    const list = $('#payrollSyncEmployees');
    list.replaceChildren();
    const entries = state.employees.map(person => {
      const period = payStore().periods?.[person.id+':'+targetMonth];
      return {person, snapshot:period?.snapshot, registered:Boolean(period)};
    });
    if (fixed.employee) entries.push({person:fixed.employee, fixed:fixed.months[targetMonth], registered:true});
    for (const entry of entries) {
      const {person,snapshot,registered} = entry;
      const item = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      const ready = Boolean(snapshot || entry.fixed);
      checkbox.checked = ready;
      checkbox.disabled = !ready;
      if (ready) checkbox.dataset.syncId = person.id;
      const amount = snapshot?.net ?? entry.fixed?.net;
      const status = ready ? '確定 / 差引 '+yen(amount) : registered ? '未確定' : '当月給与未登録';
      item.append(checkbox, ' '+person.name+'（'+person.id+'） '+status);
      list.append(item,document.createElement('br'));
    }
    for (let i = entries.length; i < 4; i++) {
      const p = document.createElement('p');
      p.textContent = '従業員未登録';
      list.append(p);
    }
    $('#fixedSyncName').value = fixed.employee?.name || '';
    for (const field of ['earnings','deductions']) {
      const extras = fixed.months[targetMonth]?.[field].filter(line => line.field === null) || [];
      $('#fixedSync-'+field).value = extras.map(line => line.name+'='+line.amount).join('\n');
    }
    for (const input of dialog.querySelectorAll('[data-fixed-field]')) {
      const row = fixed.months[targetMonth];
      const key = input.dataset.fixedField;
      input.value = row?.[key] ?? [...(row?.earnings || []), ...(row?.deductions || [])].find(item => item.field === key)?.amount ?? '';
    }
  }
  $('#openPayrollSync').onclick = () => {
    try {
      targetMonth = salaryMonth();
      const dates = PayrollSync.period(targetMonth);
      $('#payrollSyncPeriod').textContent = targetMonth+'給与（'+dates.start+'〜'+dates.end+'）';
      endpoint.value = localStorage.getItem(prefsKey) || '';
      report('');
      render();
      dialog.showModal();
    } catch (error) { payStatus(error.message); }
  };
  $('#saveFixedSync').onclick = () => {
    try {
      const fixed = readFixed();
      const name = $('#fixedSyncName').value.trim();
      if (!name) throw Error('固定給の従業員名を入力してください');
      if (!fixed.employee && state.employees.length >= 4) throw Error('固定給用の空き枠がありません。登録済みの従業員を確認してください');
      const prior = fixed.months[targetMonth];
      if (prior && !confirm('この月の端末内の固定給記録を変更しますか？')) return;
      const inputs = {};
      for (const el of dialog.querySelectorAll('[data-fixed-field]')) {
        if (!el.checkValidity()) throw Error('固定給の金額を確認してください');
        inputs[el.dataset.fixedField] = el.value === '' ? null : Number(el.value);
      }
      if ([inputs.base,inputs.gross,inputs.deductionTotal,inputs.net].includes(null)) {
        throw Error('基本給・支給総額・控除総額・差引支給額を入力してください。確定した0円は0を入力します');
      }
      fixed.employee = {id:fixed.employee?.id || uid(), name};
      const lines = keys => keys.filter(key => inputs[key] !== null).map(key => ({
        id:key,name:fieldNames[key],amount:inputs[key],field:key
      }));
      const extras = field => $('#fixedSync-'+field).value.split(/\r?\n/).filter(line => line.trim()).map((line,index) => {
        const match = line.match(/^(.+?)\s*=\s*(-?\d+)\s*$/);
        if (!match) throw Error('追加項目は1行に1件、項目名=金額の形式で入力してください');
        return {id:field+'-'+index,name:match[1].trim(),amount:Number(match[2]),field:null};
      });
      const row = PayrollSync.normalize({
        ...fixed.employee,month:targetMonth,mode:'fixed',normalDays:null,specialDays:null,minutes:null,
        earnings:[...lines(['base']),...extras('earnings')],
        deductions:[...lines(['tax','ei','housing','utilities']),...extras('deductions')],
        gross:inputs.gross,deductionTotal:inputs.deductionTotal,net:inputs.net,refund:null,
        finalizedAt:new Date().toISOString(),status:'確定'
      });
      fixed.months[targetMonth] = row;
      localStorage.setItem(fixedKey,JSON.stringify(fixed));
      render();
      report('固定給の確定額をこの端末に保存しました。');
    } catch (error) { report(error.message); }
  };
  $('#sendPayrollSync').onclick = () => {
    try {
      if (salaryMonth() !== targetMonth) throw Error('給与対象月が変更されました。画面を開き直してください');
      const url = endpoint.value.trim();
      if (!/^https:\/\/script\.google\.com\/(?:a\/macros\/[a-zA-Z0-9.-]+|macros)\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url)) {
        throw Error('設定欄に自分専用の Apps Script ウェブアプリURLを入力してください');
      }
      const fixed = readFixed();
      const rows = [...dialog.querySelectorAll('[data-sync-id]:checked')].map(input => {
        const id = input.dataset.syncId;
        const person = state.employees.find(item => item.id === id);
        const snapshot = payStore().periods?.[id+':'+targetMonth]?.snapshot;
        const row = person ? PayrollSync.fromSnapshot(person,targetMonth,snapshot)
          : fixed.employee?.id === id ? fixed.months[targetMonth] : null;
        if (!row) throw Error('確定給与が変更されました。画面を開き直してください');
        return PayrollSync.normalize(row);
      });
      if (!rows.length || rows.length > 4) throw Error('同期する確定給与を1〜4人選択してください');
      const payload = JSON.stringify(rows);
      if (payload.length > 150000) throw Error('明細が多いため、従業員を分けて送信してください');
      localStorage.setItem(prefsKey,url);
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = url;
      form.target = '_blank';
      form.rel = 'noopener noreferrer';
      const data = document.createElement('input');
      data.type = 'hidden';
      data.name = 'payroll';
      data.value = payload;
      form.append(data);
      document.body.append(form);
      try { form.submit(); } finally { form.remove(); }
      report('Googleの確認画面で「同期を確定」を押してください。ログイン画面が開いた場合は、ログイン後にここから再送信してください。');
    } catch (error) { report(error.message); }
  };
})();
