'use strict';

(() => {
  const buttons = [...document.querySelectorAll('.main-nav [data-tab]')];
  const historyMonth = $('#historyMonth14');
  const historyEmployee = $('#historyEmployee14');
  const historyRecords = $('#historyRecords14');
  const syncSetup = $('#payrollSyncSetup');
  const syncStatus = $('#payrollSyncStatus');
  const syncDialog = $('#payrollSyncDialog');
  const syncSettings = $('#syncSettings14');
  const syncAnchor = $('#syncSetupAnchor14');

  function options(select, values, allLabel) {
    const previous = select.value;
    select.replaceChildren(new Option(allLabel,''), ...values.map(([value,label])=>new Option(label,value)));
    if (values.some(([value])=>value===previous)) select.value = previous;
  }

  function collectHistory() {
    const entries = [];
    for (const person of state?.employees ?? []) {
      const prefix = person.id+':';
      const records = new Map();
      for (const [key,period] of Object.entries(state.payrollV07?.periods ?? {})) {
        if (!key.startsWith(prefix)) continue;
        const month = key.slice(prefix.length);
        const versions = (period.revisions ?? []).map(snapshot=>({snapshot,previous:true}));
        if (period.snapshot) versions.push({snapshot:period.snapshot,previous:false});
        if (versions.length) records.set(month,versions.reverse());
      }
      const legacy = state.fixedPayrollSync;
      if (legacy?.employee?.id===person.id) {
        for (const month of Object.keys(legacy.months)) {
          if (records.has(month)) continue;
          const snapshot = window.legacyFixedPeriod132(person.id,month)?.snapshot;
          if (snapshot) records.set(month,[{snapshot,previous:false}]);
        }
      }
      for (const [month,versions] of records) {
        for (const version of versions) entries.push({...version,id:person.id,name:person.name,month,past:!!person.archivedAt132});
      }
    }
    return entries.sort((a,b)=>b.month.localeCompare(a.month)||a.name.localeCompare(b.name,'ja'));
  }

  function historyCard(entry) {
    const {name,month,snapshot,previous,past} = entry;
    const item = document.createElement('details');
    const title = document.createElement('summary');
    title.textContent = `${month} · ${name} · 差引 ${yen(snapshot.net)}`;
    const body = document.createElement('div');
    const period = PeriodCore.period(month);
    const summary = document.createElement('p');
    summary.textContent = `${period.start}〜${period.end} · ${previous?'確定履歴':'確定済み'}${past?' · 過去の従業員':''}`;
    const totals = document.createElement('p');
    totals.textContent = `支給 ${yen(snapshot.gross)} ／ 控除 ${yen(snapshot.deductionTotal)} ／ 差引 ${yen(snapshot.net)}`;
    body.append(summary,totals);
    for (const [label,items] of [['支給明細',snapshot.earnings],['控除明細',snapshot.deductions]]) {
      const lines = (items ?? []).filter(line=>line.amount!==0 && line.enabled!==false);
      if (!lines.length) continue;
      const heading = document.createElement('h3');
      heading.textContent = label;
      const list = document.createElement('ul');
      for (const line of lines) {
        const row = document.createElement('li');
        row.textContent = `${label==='支給明細'?earningName(line):line.name} ${yen(line.amount)}`;
        list.append(row);
      }
      body.append(heading,list);
    }
    body.append(exportButton('PDF・Excelを再出力',()=>openPayrollExport(false,entry)));
    item.append(title,body);
    return item;
  }

  function renderHistory() {
    const entries = collectHistory();
    const months = [...new Set(entries.map(entry=>entry.month))];
    options(historyMonth,months.map(month=>[month,month]),'すべての月');
    const people = [...new Map(entries.map(entry=>[entry.id,entry.name+(entry.past?'（過去）':'')]))];
    options(historyEmployee,people,'すべての従業員');
    const matches = entries.filter(entry=>(!historyMonth.value || entry.month===historyMonth.value) &&
      (!historyEmployee.value || entry.id===historyEmployee.value));
    historyRecords.replaceChildren(...matches.map(historyCard));
    if (!matches.length) historyRecords.textContent = entries.length?'条件に合う確定給与はありません。':'確定済みの給与はまだありません。';
  }

  historyMonth.onchange = historyEmployee.onchange = renderHistory;
  window.showTimeLabPage14 = (page,{archive=false,past=false}={}) => {
    if (!archive) window.closeArchiveView14();
    for (const button of buttons) {
      const active = button.dataset.tab===page;
      button.classList.toggle('active',active);
      if (active) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
      $('#'+button.dataset.tab).hidden = !active;
    }
    if (page==='employeeManager132') window.openEmployeePage14(past);
    if (page==='payrollHistory14') renderHistory();
    if (page==='data') {
      syncSettings.append(syncSetup,syncStatus);
      syncSetup.querySelector('summary').textContent = 'Google Sheets同期';
      syncSetup.open = false;
      $('#payrollSyncEndpoint').value = localStorage.getItem('time-lab-payroll-sync-endpoint-v1') || '';
      syncStatus.textContent = '';
      navigator.storage?.estimate().then(info=>{
        if (Number.isFinite(info.usage)) $('#storageStatus').textContent = `端末内の使用量: 約${Math.round(info.usage/104857.6)/10} MB`;
      }).catch(()=>{});
    } else if (syncSetup.parentNode===syncSettings) {
      syncSetup.querySelector('summary').textContent = 'Google初回設定';
      syncAnchor.after(syncSetup);
      syncDialog.append(syncStatus);
    }
    window.scrollTo(0,0);
  };
  for (const button of buttons) button.onclick = () => window.showTimeLabPage14(button.dataset.tab);
})();
