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
    const store = state?.payrollV07?.periods ?? {};
    const legacy = state?.fixedPayrollSync;
    for (const person of state?.employees ?? []) {
      const prefix = person.id+':';
      const months = new Set(Object.keys(store).filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length)));
      if (legacy?.employee?.id===person.id) {
        for (const month of Object.keys(legacy.months)) months.add(month);
      }
      for (const month of months) {
        const period = store[prefix+month];
        const saved = period?.snapshot ?? period?.revisions?.at(-1);
        const snapshot = saved ?? window.legacyFixedPeriod132(person.id,month)?.snapshot;
        if (!snapshot) continue;
        entries.push({
          id:person.id,month,snapshot,past:!!person.archivedAt132,
          name:snapshot.employeeName ?? (saved ? person.name : legacy.employee.name),
          previous:(period?.revisions ?? []).filter(version=>version!==snapshot).slice().reverse(),
          pending:!period?.snapshot && !!period?.revisions?.length
        });
      }
    }
    return entries;
  }

  function syncStatusFor(entry) {
    try {
      const receipt = JSON.parse(localStorage.getItem('time-lab-sync-receipt:'+entry.id+':'+entry.month));
      if (receipt?.version===entry.snapshot.at) {
        if (receipt.status==='done') return '同期済み';
        if (receipt.status==='failed') return '同期失敗';
        if (receipt.status==='pending') return 'Googleで同期待ち';
      }
    } catch { /* The saved payroll remains readable when storage is unavailable. */ }
    return '未同期';
  }

  function historyCard(entry) {
    const {name,month,snapshot,pending,past} = entry;
    const item = document.createElement('article');
    item.className = 'history-pay-card';
    const title = document.createElement('h3');
    title.textContent = name;
    const meta = document.createElement('p');
    const modes = {daily:'日給月給',hourly:'時給',fixed:'固定給'};
    meta.textContent = [modes[snapshot.options?.mode],past?'過去の従業員':''].filter(Boolean).join(' · ');
    const amount = document.createElement('p');
    amount.className = 'history-pay-amount';
    amount.textContent = '差引支給額 '+yen(snapshot.net);
    const status = document.createElement('p');
    status.textContent = (pending ? '前回確定分・再確定待ち' : '確定済み')+' · '+syncStatusFor(entry);
    item.append(title,amount);
    if (meta.textContent) item.append(meta);
    const open = (version,versionName) => {
      const historical = {...entry,snapshot:version,name:versionName};
      showPayrollSlip09(versionName,PeriodCore.period(month),version,true,{
        pdf:()=>openPayrollExport(false,historical,false,{pdfOnly:true})
      });
    };
    item.append(status,exportButton('給与明細を見る',()=>open(snapshot,name)));
    if (entry.previous.length) {
      const previous = document.createElement('details');
      const heading = document.createElement('summary');
      heading.textContent = '以前の確定版';
      previous.append(heading);
      for (const version of entry.previous) {
        const date = new Date(version.at);
        const label = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ja-JP');
        previous.append(exportButton(label ? label+'の明細' : '明細を見る',
          ()=>open(version,version.employeeName ?? name)));
      }
      item.append(previous);
    }
    return item;
  }

  const dateText = date => date.replace(/^(\d+)-(\d+)-(\d+)$/,(_,year,month,day)=>year+'年'+Number(month)+'月'+Number(day)+'日');
  function renderHistory() {
    const entries = collectHistory();
    if (!historyMonth.value) {
      historyMonth.value = entries.map(entry=>entry.month).sort().at(-1) ?? salaryMonth();
    }
    const month = historyMonth.value;
    const [year,number] = month.split('-');
    $('#historyPeriod14').textContent = '';
    try {
      const period = PeriodCore.period(month);
      $('#historyPeriod14').textContent = year+'年'+Number(number)+'月給与｜'+dateText(period.start)+'〜'+dateText(period.end);
    } catch {
      historyRecords.textContent = '給与対象月を選択してください。';
      return;
    }
    const people = new Map(entries.map(entry=>[entry.id,entry.name+(entry.past?'（過去）':'')]));
    options(historyEmployee,[...people],'すべての従業員');
    const matches = entries.filter(entry=>entry.month===month && (!historyEmployee.value || entry.id===historyEmployee.value));
    historyRecords.replaceChildren(...matches.map(historyCard));
    if (!matches.length) historyRecords.textContent = 'この条件の確定済み給与はありません。';
  }

  const taxImport = $('#importTaxTable');
  const importTaxTable = taxImport.onchange;
  taxImport.onchange = async event => {
    const result = $('#pay07Status');
    result.textContent = '';
    await importTaxTable(event);
    $('#taxTableStatus14').textContent = result.textContent;
  };

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
