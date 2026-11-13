'use strict';
(() => {
  const manager = $('#employeeManager132');
  const editor = $('#employeeEditor132');
  const settings = $('#employeeSettings08');
  const managerStatus = $('#managerStatus132');
  const editorStatus = $('#editorStatus132');
  const mode = $('#empMode08');
  const labels = {daily:'日給月給',hourly:'時給',fixed:'固定給'};
  const legacyKey = 'time-lab-fixed-payroll-v1';
  const emptyLegacy = () => ({employee:null,months:{}});
  let editingId = null;
  settings.open = true;
  $('#editorFields132').append(settings);
  const special = $('#empSaturday08').closest('details');
  special.querySelector('summary').textContent = '特別出勤の設定';
  const advanced = document.createElement('details');
  const advancedTitle = document.createElement('summary');
  advancedTitle.textContent = '従業員の詳細設定';
  advanced.append(advancedTitle,$('#employeeResidency16').closest('.form-grid'),vaultPanel09,legacySpecialSettings09,$('#empHistory08').closest('details'));
  settings.append(advanced);
  const saveButton = $('#saveEmployee08');
  $('#closeEditor132').before(saveButton);
  editor.addEventListener('close',lockVault09);
  $('#empName08').autocomplete = 'off';

  // Older exports carry the original fixed-pay records separately. Keep their exact
  // amounts, even when the manually entered totals differ from the line items.
  window.validateLegacyFixed132 = (value, employees) => {
    const owner = value?.employee?.id;
    const others = employees.filter(person => !(person.legacyFixed132 === true && person.id === owner));
    return PayrollSync.fixedBackup(value,others);
  };
  const readLegacy = () => {
    if (state.fixedPayrollSync !== undefined) return state.fixedPayrollSync;
    return window.validateLegacyFixed132(JSON.parse(localStorage.getItem(legacyKey) || JSON.stringify(emptyLegacy())),state.employees);
  };
  window.getFixedPayrollBackup = readLegacy;
  const previousValidate = validateBackup;
  validateBackup = function(backup) {
    previousValidate(backup);
    if (backup.fixedPayrollSync !== undefined) {
      backup.fixedPayrollSync = window.validateLegacyFixed132(backup.fixedPayrollSync,backup.employees);
    }
    return backup;
  };

  const payrollStore = () => state.payrollV07 ||= {profiles:{},periods:{},taxTables:{}};
  const historyFor = person => payStore().employeeConditions?.[person.id] || [];
  const fallbackFor = person => EmployeeCore.legacy(person,payStore(),state.payPeriods?.[person.id+':'+salaryMonth()],payStore().periods?.[person.id+':'+salaryMonth()]);
  const dateFor = () => PeriodCore.period(currentMonth()).start;
  const conditionFor = person => EmployeeCore.at(historyFor(person),dateFor(),fallbackFor(person));
  const currentMonth = () => salaryMonth() || state.salaryMonth || state.month;
  const defaultSpecial = (name,rate) => ({...PayrollCore.specialDefaults(EmployeeCore.nameKey(name)),rate});
  const defaultCondition = (name,method,from,rate,monthlyBase) => ({
    effectiveFrom:from,mode:method,rate,monthlyBase,specialSalary:0,special:defaultSpecial(name,rate)
  });
  function adoptLegacy() {
    const legacy = readLegacy();
    if (!legacy.employee || state.employees.some(person => person.id === legacy.employee.id)) return;
    const months = Object.keys(legacy.months).sort();
    const latest = legacy.months[months.at(-1)];
    const base = latest?.earnings.find(item => item.field==='base')?.amount ?? 0;
    const person = {...legacy.employee,mode:'daily',rate:0,legacyFixed132:true};
    const store = payrollStore();
    (store.employeeConditions ||= {})[person.id] = [defaultCondition(person.name,'fixed','2000-01-01',0,Math.max(0,base))];
    state.fixedPayrollSync = legacy;
    state.employees.push(person);
  }
  window.legacyFixedRow132 = (id,month) => {
    const legacy = state.fixedPayrollSync;
    return legacy?.employee?.id === id ? legacy.months[month] : null;
  };
  window.legacyFixedPeriod132 = (id,month) => {
    const row = window.legacyFixedRow132(id,month);
    if (!row) return null;
    const settings = {...PayrollCore.defaults(month),simplePayroll11:true};
    const special = {...PayrollCore.specialDefaults(),enabled:false};
    const period = {month,settings,special,earnings:row.earnings,deductions:row.deductions,revisions:[],legacyFixed132:true};
    const item = line => ({...line,id:line.field || line.id,kind:'salary',source:'manual'});
    period.snapshot = {
      ...row, at:row.finalizedAt, ready:true, options:{mode:'fixed'}, settings, specialSettings:special,
      earnings:row.earnings.map(item), deductions:row.deductions.map(item), errors:[], warnings:[],
      summary:{days:0,minutes:0,payroll:0,amCount:0,pmCount:0,pending:0}, tax:{},ei:{}
    };
    return period;
  };

  function updateFields() {
    const fixed = mode.value === 'fixed';
    $('#monthlyBaseField132').hidden = !fixed;
    $('#empRate08').closest('label').hidden = fixed;
    legacySpecialSettings09.hidden = fixed;
    $('#effectiveField132').hidden = !editingId;
    special.hidden = fixed;
  }
  mode.addEventListener('change',updateFields);
  function openEditor(person = null) {
    editingId = person?.id ?? null;
    $('#editorTitle132').textContent = editingId ? '従業員の編集' : '従業員の登録';
    editorStatus.textContent = '';
    if (person) {
      state.selected = person.id;
      render();
      fillEmployeeSettings(true);
      $('#empStart08').value = dateFor();
    } else {
      $('#empName08').value = '';
      mode.value = 'daily';
      $('#empRate08').value = 1200;
      $('#empMonthlyBase132').value = '';
      $('#empSpecialSalary08').value = 0;
      $('#empStart08').value = PeriodCore.period(currentMonth()).start;
      $('#empSaturday08').checked = false;
      $('#empWeekday08').value = '';
      $('#empHours08').value = 8;
      $('#empMultiplier08').value = 1.25;
      $('#empLegal08').value = '';
      $('#empLegalConfirmed08').checked = false;
      $('#empLegalKind08').value = 'contract';
    }
    special.open = false;
    advanced.hidden = !editingId;
    advanced.open = false;
    updateFields();
    editor.showModal();
  }

  $('#addEmployee').onclick = $('#newEmployee132').onclick = () => openEditor();
  $('#editEmployeePay08').onclick = () => openEditor(employee());
  $('#closeEditor132').onclick = () => editor.close();
  $('#saveEmployee08').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const name = $('#empName08').value.trim();
      if (!name) throw Error('従業員名を入力してください。');
      if (state.employees.some(e=>!e.archivedAt132 && e.id!==editingId && EmployeeCore.nameKey(e.name)===EmployeeCore.nameKey(name))) {
        throw Error('同じ名前の従業員が登録済みです。従業員管理から編集してください。');
      }
      const existing = state.employees.find(person => person.id===editingId);
      const method = mode.value;
      const fixed = method==='fixed';
      const amount = $(fixed?'#empMonthlyBase132':'#empRate08');
      if (amount.value==='' || !amount.checkValidity()) throw Error(fixed?'月額基本給を入力してください。':'基本時給を入力してください。');
      const rate = fixed ? 0 : PayrollCore.money(amount.value,'基本時給');
      const from = $('#empStart08').value;
      const next = defaultCondition(name,method,from,rate,fixed?PayrollCore.money(amount.value,'月額基本給'):undefined);
      if (!fixed) {
        const week = $('#empWeekday08').value;
        if (!existing && !special.open && next.special.enabled && !$('#empSaturday08').checked) {
          // Preserve the existing name-based defaults for newly registered employees.
          next.special.hours = 8;
        } else {
          Object.assign(next.special,{
            enabled:$('#empSaturday08').checked,weekday:week===''?null:Number(week),
            hours:method==='daily'?8:Number($('#empHours08').value),multiplier:Number($('#empMultiplier08').value),
            legalKind:$('#empLegalKind08').value,legalBasis:$('#empLegal08').value,legalConfirmed:$('#empLegalConfirmed08').checked
          });
        }
        next.specialSalary = PayrollCore.money($('#empSpecialSalary08').value,'特別給与');
      } else {
        next.special.enabled = false;
        next.specialSalary = existing ? conditionFor(existing).specialSalary : 0;
      }
      EmployeeCore.validate(next);
      if (existing && conditionFor(existing).mode!==method && !from.endsWith('-16')) {
        throw Error('給与方式を変更する場合は、適用開始日を16日にしてください。');
      }
      const conditions = existing ? EmployeeCore.put(historyFor(existing),next,fallbackFor(existing)) : [next];
      const person = existing || {id:uid(),name,mode:method==='hourly'?'hourly':'daily',rate};
      person.name = name;
      if (!existing) state.employees.push(person);
      (payrollStore().employeeConditions ||= {})[person.id] = conditions;
      state.selected = person.id;
      await persistPay();
      editor.close();
      employeeEditorKey = '';
      render();
      toast('従業員設定を保存しました。');
    } catch (error) { editorStatus.textContent = error.message; }
    finally { button.disabled = false; }
  };

  function action(label,callback) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = label;
    button.onclick = callback;
    return button;
  }
  const past = $('#pastEmployees133');
  const purgeDialog = $('#employeePurge133');
  const purgeCheck = $('#purgeChecked133');
  const purgeNext = $('#purgeNext133');
  const purgeRun = $('#purgeRun133');
  const purgeStatus = $('#purgeStatus133');
  let purgeId = null;
  let savingEmployee = false;
  let archiveView = null;
  let reordering = false;
  const reorderButton = $('#reorderEmployees142');
  reorderButton.onclick = () => {
    reordering = !reordering;
    managerStatus.textContent = '';
    updateManager();
  };

  async function moveEmployee(id,direction) {
    if (savingEmployee) return;
    const previous = state.employees;
    const active = previous.filter(person=>!person.archivedAt132);
    const position = active.findIndex(person=>person.id===id);
    const neighbor = active[position+direction];
    if (position<0 || !neighbor) return;

    const from = previous.indexOf(active[position]);
    const to = previous.indexOf(neighbor);
    const next = previous.slice();
    [next[from],next[to]] = [next[to],next[from]];
    savingEmployee = true;
    document.body.inert = true;
    state.employees = next;
    try {
      updateManager();
      await persistState();
    } catch {
      state.employees = previous;
      updateManager();
      managerStatus.textContent = '並び順を保存できませんでした。もう一度お試しください。';
      return;
    } finally {
      savingEmployee = false;
      document.body.inert = false;
    }

    render();
    const row = $('#employeeList132').children[position+direction];
    const movedButton = row.querySelector(direction<0 ? '[data-move-up]' : '[data-move-down]');
    (movedButton.disabled ? row.querySelector('button:not(:disabled)') : movedButton)?.focus({preventScroll:true});
    managerStatus.textContent = '並び順を保存しました。';
  }

  function updateManager() {
    const currentList = $('#employeeList132');
    const pastList = $('#pastList133');
    const active = state.employees.filter(person=>!person.archivedAt132);
    reorderButton.hidden = active.length<2;
    if (reorderButton.hidden) reordering = false;
    reorderButton.textContent = reordering ? '完了' : '並べ替え';
    reorderButton.setAttribute('aria-pressed',String(reordering));
    currentList.replaceChildren();
    pastList.replaceChildren();
    for (const person of state.employees) {
      const detail = document.createElement('p');
      detail.textContent = labels[conditionFor(person).mode];
      const buttons = document.createElement('div');
      buttons.className = 'actions';
      if (person.archivedAt132) {
        const item = document.createElement('details');
        const name = document.createElement('summary');
        name.textContent = person.name;
        buttons.append(action('詳細を見る',()=>viewArchived(person)));
        buttons.append(action('在籍中に戻す',()=>changeEmployee(person.id,'restore')));
        buttons.append(action('完全削除',()=>reviewPurge(person)));
        item.append(name,detail,buttons);
        pastList.append(item);
      } else {
        const item = document.createElement('section');
        const name = document.createElement('h4');
        name.textContent = person.name;
        if (reordering) {
          const position = active.indexOf(person);
          const up = action('↑ 上へ',()=>moveEmployee(person.id,-1));
          const down = action('↓ 下へ',()=>moveEmployee(person.id,1));
          up.setAttribute('data-move-up','');
          down.setAttribute('data-move-down','');
          up.setAttribute('aria-label',person.name+'を上へ移動');
          down.setAttribute('aria-label',person.name+'を下へ移動');
          up.disabled = position===0;
          down.disabled = position===active.length-1;
          buttons.append(up,down);
        }
        buttons.append(action('編集',()=>openEditor(person)),action('削除',()=>{
          if (confirm(person.name+'さんを「過去の従業員」に移しますか？ 設定・勤怠・給与履歴は保持されます。')) {
            changeEmployee(person.id,'archive');
          }
        }));
        item.append(name,detail,buttons);
        currentList.append(item);
      }
    }
    $('#pastCount133').textContent = pastList.childElementCount+'人';
    if (!currentList.childElementCount) currentList.textContent = '在籍中の従業員はいません。';
    if (!pastList.childElementCount) pastList.textContent = '過去の従業員はいません。';
  }

  function viewArchived(person) {
    if (savingEmployee) return;
    if (!archiveView) archiveView = {id:state.selected, month:currentMonth()};
    const prefix = person.id+':';
    const months = Object.entries(payStore().periods ?? {})
      .filter(([key,period])=>key.startsWith(prefix) && (period.snapshot || period.revisions?.length))
      .map(([key])=>key.slice(prefix.length));
    if (state.fixedPayrollSync?.employee?.id===person.id) months.push(...Object.keys(state.fixedPayrollSync.months));
    state.selected = person.id;
    state.salaryMonth = months.sort().at(-1) ?? currentMonth();
    $('#salaryMonth').value = state.salaryMonth;
    window.showTimeLabPage14('work', {archive: true});
    render();
    $('#archiveStatus132').focus();
  }

  function closeArchiveView() {
    if (!archiveView) return;
    state.selected = archiveView.id;
    state.salaryMonth = archiveView.month;
    $('#salaryMonth').value = archiveView.month;
    archiveView = null;
    render();
  }

  function reviewPurge(person) {
    if (savingEmployee) return;
    purgeId = person.id;
    $('#purgeName133').textContent = '対象：'+person.name;
    $('#purgeFinal133').hidden = true;
    purgeNext.hidden = false;
    purgeRun.hidden = true;
    purgeRun.disabled = true;
    purgeCheck.checked = false;
    purgeStatus.textContent = '';
    purgeDialog.showModal();
  }
  purgeNext.onclick = () => {
    $('#purgeFinal133').hidden = false;
    purgeNext.hidden = true;
    purgeRun.hidden = false;
    purgeCheck.focus();
  };
  purgeCheck.onchange = () => { purgeRun.disabled = !purgeCheck.checked; };
  purgeRun.onclick = () => {
    if (!purgeRun.hidden && purgeCheck.checked) changeEmployee(purgeId,'purge');
  };
  $('#purgeCancel133').onclick = () => { if (!savingEmployee) purgeDialog.close(); };
  purgeDialog.addEventListener('cancel',event=>{ if (savingEmployee) event.preventDefault(); });

  async function changeEmployee(id,operation) {
    if (savingEmployee) return;
    const person = state.employees.find(item=>item.id===id);
    if (!person || Boolean(person.archivedAt132)===(operation==='archive')) return;
    savingEmployee = true;
    manager.inert = true;
    purgeRun.disabled = true;
    const previous = state;
    const storageBackup = new Map();
    try {
      state = structuredClone(previous);
      const selected = state.employees.find(item=>item.id===id);
      if (operation==='archive') {
        selected.archivedAt132 = new Date().toISOString();
        if (state.selected===id) state.selected = state.employees.find(item=>!item.archivedAt132)?.id ?? null;
      } else if (operation==='restore') {
        delete selected.archivedAt132;
        state.selected = id;
      } else {
        EmployeeCore.purgeArchived(state,id);
        const bankKey = vaultKey09(id);
        const legacy = localStorage.getItem(legacyKey);
        let legacyOwner;
        try { legacyOwner = JSON.parse(legacy)?.employee?.id; } catch { /* Leave unreadable legacy data intact. */ }
        for (const key of legacyOwner===id ? [bankKey,legacyKey] : [bankKey]) {
          const value = localStorage.getItem(key);
          if (value===null) continue;
          localStorage.removeItem(key);
          storageBackup.set(key,value);
        }
      }
      await persistState();
    } catch {
      state = previous;
      for (const [key,value] of storageBackup) localStorage.setItem(key,value);
      const status = operation==='purge' ? purgeStatus : managerStatus;
      status.textContent = '変更を保存できませんでした。もう一度お試しください。';
      return;
    } finally {
      savingEmployee = false;
      manager.inert = false;
      purgeRun.disabled = !purgeCheck.checked;
    }
    if (purgeDialog.open) purgeDialog.close();
    savedChecks08.clear();
    render();
    updateManager();
    if (operation==='archive') past.open = true;
    if (operation==='purge') window.clearPayrollStepData?.(id);
    managerStatus.textContent = {
      archive:'過去の従業員に移動しました。',restore:'在籍中に戻しました。',purge:'端末内のデータを完全削除しました。'
    }[operation];
  }

  function openManager(showPast = false) {
    if (!state || savingEmployee) return;
    closeArchiveView();
    reordering = false;
    managerStatus.textContent = '';
    updateManager();
    past.open = showPast;
  }
  window.openEmployeePage14 = openManager;
  window.closeArchiveView14 = closeArchiveView;
  const historyBack = action('過去の従業員に戻る',()=>window.showTimeLabPage14('employeeManager132',{past:true}));
  historyBack.hidden = true;
  $('#archiveStatus132').after(historyBack);
  $('#archiveStatus132').tabIndex = -1;
  const employeeMonth = $('#employeeMonth132');
  const legacyAttendanceSettings = $('#employeeName').closest('details');

  const baseField = document.createElement('label');
  baseField.id = 'currentFixed132';
  baseField.hidden = true;
  baseField.innerHTML = '今月の基本給（円）<input id="fixedBase132" type="number" inputmode="numeric" min="0" max="1000000000" step="1">';
  $('#dayPaySummary').after(baseField);
  const baseInput = $('#fixedBase132');
  function updateFixedBase() {
    const period = payPeriod();
    if (!period || period.snapshot || employee().archivedAt132 || !baseInput.checkValidity()) return;
    if (baseInput.value === '') delete period.fixedBase132;
    else period.fixedBase132 = PayrollCore.money(baseInput.value,'今月の基本給');
    renderPay07(true);
  }
  baseInput.oninput = updateFixedBase;
  baseInput.onchange = async () => {
    if (!baseInput.checkValidity()) return;
    try {
      updateFixedBase();
      await persistPay();
    } catch (error) { payStatus(error.message); }
  };

  const freeze = $('#freezePay07').onclick;
  $('#freezePay07').onclick = async () => {
    if (!baseField.hidden) {
      if (!baseInput.reportValidity()) return;
      updateFixedBase();
    }
    await freeze();
    if (payPeriod()?.snapshot) $('#outputActions132').scrollIntoView({block:'nearest'});
  };
  const output = $('#exportPC12').parentElement;
  output.id = 'outputActions132';
  output.prepend($('#openPayrollSync'));
  $('#openPayrollSync').className = 'secondary';
  output.prepend($('#exportPC12'));
  const options = document.createElement('details');
  options.id = 'payrollOptions132';
  const optionTitle = document.createElement('summary');
  optionTitle.textContent = '給与の詳細設定';
  $('#pay07History').after(options);
  options.append(optionTitle,$('#pay07Settings'),$('#pay07Reference').closest('details'),$('#savePayTemplate'),$('#pay07History'));
  const confirmActions = $('#freezePay07').parentElement;
  $('#pay07Issues').after(confirmActions);
  // Legacy links and advanced functions remain in Settings.
  const tools = $('#test').firstElementChild;
  $('#data').append(tools);
  tools.querySelector('summary').textContent = '開発者向けのOCRテスト';
  const oldWork = $('#work');
  for (const [selector,title] of [['#captureFold08','1. 写真を撮影・選択する'],['#importFold08','2. 読み取り結果を貼り付ける'],['#attendanceFold08','3. 勤怠を確認する']]) {
    $(selector).querySelector('summary').textContent=title;
  }
  $('#pay07Panel').querySelector('h3').textContent = '4. 給与を計算・確定する';
  $('#pay07Panel').querySelector('p').textContent = '支給と控除を確認して「給与を確定」を押します。';
  $('#calendarDetails').querySelector('summary').textContent = '従来の勤怠・出力';
  const priorPayRender = renderPay07;
  renderPay07 = function(keepRows=false) {
    if (!employee()) return;
    priorPayRender(keepRows);
    const person = employee();
    const period = payPeriod();
    const fixed = (period?.snapshot?.options?.mode ?? conditionFor(person).mode)==='fixed';
    const archived = Boolean(person.archivedAt132);
    const locked = Boolean(period?.snapshot);
    $('#pay07Panel').querySelector('p').hidden = archived || locked;
    if (!archived && $('#pay07Status').textContent==='この月の確定済み給与はありません。') $('#pay07Status').textContent = '';
    $('#pay07Panel').querySelector('h3').textContent = archived?'給与履歴':'給与の明細';
    baseField.hidden = !fixed || !period || locked || archived;
    if (!baseField.hidden && document.activeElement!==baseInput) {
      baseInput.value = period.fixedBase132 ?? conditionFor(person).monthlyBase ?? '';
    }
    if (fixed && period && locked) $('#dayPaySummary').textContent = '固定給';
    if (fixed || archived) $('#attendanceTop').hidden = true;
    $('#captureFold08').hidden = archived;
    $('#importFold08').hidden = archived;
    $('#attendanceFold08').hidden = archived;
    $('#calendarDetails').hidden = archived;

    if (archived && !locked) {
      $('#pay07Body').hidden = true;
      $('#startPay07').hidden = true;
      $('#pay07Status').textContent = 'この月の確定済み給与はありません。';
    } else if (archived) {
      $('#pay07Status').textContent = '';
    }
    $('#editEmployeePay08').hidden = true;
    $('#employeePaySummary08').hidden = true;
    $('#freezePay07').hidden = locked || archived;
    $('#revisePay07').hidden = !locked || archived || !!period?.legacyFixed132;
    $('#payrollOptions132').hidden = archived || !!period?.legacyFixed132;
    output.hidden = !locked;

    const legacyInfo = $('#archiveStatus132');
    legacyInfo.hidden = !archived;
    if (archived) {
      const condition = conditionFor(person);
      const terms = condition.mode==='fixed' ? '月額基本給 '+yen(condition.monthlyBase) : '基本時給 '+yen(condition.rate);
      legacyInfo.textContent = person.name+' · '+labels[condition.mode]+' · '+terms;
    }
  };
  const previousRender = render;
  render = function() {
    if (!state) return;
    try { adoptLegacy(); } catch (error) { toast(error.message); }
    if (!archiveView && employee()?.archivedAt132) state.selected = null;
    const active = employee();
    const archived = Boolean(active?.archivedAt132);
    const empty = !active;
    employeeMonth.classList.toggle('viewing-archive133',archived);
    $('#employee').closest('label').hidden = true;
    historyBack.hidden = !archived;
    legacyAttendanceSettings.hidden = empty || archived;
    $('#salaryMonth').closest('label').hidden = empty;
    $('#addEmployee').hidden = !empty;
    for (const child of [...oldWork.children].slice(1)) {
      if (child.hasAttribute('data-step-ui')) continue;
      if (empty) child.hidden = true;
      else if (['salaryPanel','attendanceTop'].includes(child.id)) child.hidden = false;
    }
    if (empty) {
      $('#archiveStatus132').hidden = true;
      if (!manager.hidden) updateManager();
      return;
    }
    if (state.selected!==active.id) state.selected=active.id;
    previousRender();
    if (!manager.hidden) updateManager();
  };
  if (state) render();
})();
