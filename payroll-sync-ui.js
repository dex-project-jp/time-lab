'use strict';
(() => {
  const dialog = $('#payrollSyncDialog');
  const endpoint = $('#payrollSyncEndpoint');
  const prefsKey = 'time-lab-payroll-sync-endpoint-v1';
  const settings = $('#payrollSyncSetup');
  const sendButton = $('#sendPayrollSync');
  const validEndpoint = url => /^https:\/\/script\.google\.com\/(?:a\/macros\/[a-zA-Z0-9.-]+|macros)\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url);
  const report = message => { $('#payrollSyncStatus').textContent = message; };
  const selected = () => [...dialog.querySelectorAll('[data-sync-id]:checked')];
  const refreshButton = () => {
    sendButton.disabled = !validEndpoint(localStorage.getItem(prefsKey) || '') || !selected().length;
  };
  let targetMonth;
  const snapshotFor = id => payStore().periods?.[id+':'+targetMonth]?.snapshot;
  const legacyFor = id => window.legacyFixedRow132(id,targetMonth);

  $('#openPayrollSync').onclick = () => {
    try {
      targetMonth = salaryMonth();
      const dates = PayrollSync.period(targetMonth);
      $('#payrollSyncPeriod').textContent = targetMonth+'給与（'+dates.start+'〜'+dates.end+'）';
      endpoint.value = localStorage.getItem(prefsKey) || '';
      settings.open = !validEndpoint(endpoint.value);
      report(settings.open ? '初回のみ、Googleの接続先を登録してください。' : '');
      const list = $('#payrollSyncEmployees');
      list.replaceChildren();
      const people = state.employees.filter(person => !person.archivedAt132 || person.id === state.selected);
      for (const person of people) {
        const record = snapshotFor(person.id) || legacyFor(person.id);
        const item = document.createElement('label');
        item.className = 'sync-person132';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(record && person.id === state.selected);
        checkbox.disabled = !record;
        if (record) checkbox.dataset.syncId = person.id;
        const description = document.createElement('span');
        description.textContent = person.name;
        const amount = document.createElement('strong');
        amount.textContent = record ? '確定済み · 差引 '+yen(record.net) : '未確定';
        description.append(amount);
        item.append(checkbox,description);
        list.append(item);
      }
      refreshButton();
      dialog.showModal();
    } catch (error) { payStatus(error.message); }
  };

  $('#payrollSyncEmployees').onchange = refreshButton;
  $('#savePayrollSyncEndpoint').onclick = () => {
    try {
      const url = endpoint.value.trim();
      if (!validEndpoint(url)) throw Error('所有者専用の Apps Script ウェブアプリURLを入力してください');
      localStorage.setItem(prefsKey,url);
      settings.open = false;
      refreshButton();
      report('接続先を登録しました。');
    } catch (error) { report(error.message); }
  };

  sendButton.onclick = () => {
    try {
      if (salaryMonth() !== targetMonth) throw Error('給与対象月が変更されました。画面を開き直してください');
      const url = localStorage.getItem(prefsKey) || '';
      if (!validEndpoint(url)) throw Error('Google接続先を登録してください');
      if (navigator.onLine === false) throw Error('オフラインです。接続後にもう一度送信してください');
      const rows = selected().map(input => {
        const id = input.dataset.syncId;
        const person = state.employees.find(item => item.id === id);
        const snapshot = snapshotFor(id);
        const row = person && (snapshot ? PayrollSync.fromSnapshot(person,targetMonth,snapshot) : legacyFor(id));
        if (!row) throw Error('確定給与が変更されました。画面を開き直してください');
        return PayrollSync.normalize(row);
      });
      if (!rows.length || rows.length > 4) throw Error('同期する確定給与を1〜4人選択してください');
      const payload = JSON.stringify(rows);
      if (payload.length > 150000) throw Error('明細が多いため、従業員を分けて送信してください');
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
      report('同期結果はGoogle画面に表示されます。ログイン画面が開いた場合は、ログイン後に再送してください。');
    } catch (error) { report(error.message); }
  };
})();
