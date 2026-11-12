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
  const special = settings.querySelector('details');
  special.querySelector('summary').textContent = '特別出勤の設定';
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
    $('#empSpecialSalary08').closest('label').hidden = fixed;
    $('#effectiveField132').hidden = !editingId;
    special.hidden = fixed;
  }
  mode.addEventListener('change',updateFields);
  function openEditor(person = null) {
    if (manager.open) manager.close();
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
    $('#empHistory08').closest('details').hidden = !editingId;
    updateFields();
    editor.showModal();
  }

  $('#addEmployee').onclick = $('#newEmployee132').onclick = () => openEditor();
  $('#editEmployeePay08').onclick = () => openEditor(employee());
  $('#closeEditor132').onclick = () => editor.close();
  $('#closeManager132').onclick = () => manager.close();
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
  function updateManager() {
    const list = $('#employeeList132');
    list.replaceChildren();
    for (const person of state.employees) {
      const item = document.createElement('section');
      const name = document.createElement('h3');
      name.textContent = person.name;
      const detail = document.createElement('p');
      detail.textContent = labels[conditionFor(person).mode] + (person.archivedAt132 ? ' · 削除済み（履歴あり）' : '');
      const buttons = document.createElement('div');
      buttons.className = 'actions';
      if (person.archivedAt132) {
        buttons.append(action('履歴を見る',()=>{state.selected=person.id;manager.close();render();}));
        buttons.append(action('一覧に戻す',()=>changeEmployee(person,'restore')));
        const more = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'テストデータの完全削除';
        more.append(summary,action('完全削除',()=>changeEmployee(person,'purge')));
        item.append(name,detail,buttons,more);
      } else {
        buttons.append(action('編集',()=>openEditor(person)),action('削除',()=>changeEmployee(person,'archive')));
        item.append(name,detail,buttons);
      }
      list.append(item);
    }
    if (!state.employees.length) list.textContent = '従業員は未登録です。';
  }

  async function changeEmployee(person,operation) {
    try {
      if (operation==='archive') {
        if (!confirm(person.name+'さんを一覧から削除しますか？ 確定済み給与や勤怠は履歴に残ります。')) return;
        person.archivedAt132 = new Date().toISOString();
        if (state.selected===person.id) state.selected = state.employees.find(e=>!e.archivedAt132)?.id ?? null;
      } else if (operation==='restore') {
        delete person.archivedAt132;
        state.selected = person.id;
      } else {
        if (!confirm(person.name+'さんの端末内の勤怠・写真・確定給与を完全削除します。元に戻せません。実行しますか？')) return;
        for (const map of [state.months,state.payPeriods,state.photoSets,state.payrollV07?.periods]) {
          for (const key of Object.keys(map ?? {})) if (key.startsWith(person.id+':')) delete map[key];
        }
        for (const key of ['profiles','specialProfiles','employeeConditions','extraProfiles09']) {
          const map = state.payrollV07?.[key];
          if (map) delete map[person.id];
        }
        if (state.fixedPayrollSync?.employee?.id===person.id) state.fixedPayrollSync=emptyLegacy();
        state.employees = state.employees.filter(e=>e.id!==person.id);
        if (state.selected===person.id) state.selected = state.employees.find(e=>!e.archivedAt132)?.id ?? null;
        localStorage.removeItem(vaultKey09(person.id));
      }
      await persistPay();
      savedChecks08.clear();
      render();
      updateManager();
      managerStatus.textContent = {archive:'従業員を一覧から削除しました。',restore:'従業員一覧に戻しました。',purge:'端末内のデータを完全削除しました。'}[operation];
    } catch (error) { managerStatus.textContent = error.message; }
  }

  $('#manageEmployees132').onclick = () => {
    managerStatus.textContent = '';
    updateManager();
    manager.showModal();
  };

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
    $('#pay07Panel').querySelector('h3').textContent = archived?'給与履歴':fixed?'給与を計算・確定する':'4. 給与を計算・確定する';
    baseField.hidden = !fixed || !period || locked || archived;
    if (!baseField.hidden && document.activeElement!==baseInput) {
      baseInput.value = period.fixedBase132 ?? conditionFor(person).monthlyBase ?? '';
    }
    if (fixed && period && locked) $('#dayPaySummary').textContent = '固定給';
    if (fixed) $('#attendanceTop').hidden = true;
    $('#captureFold08').hidden = archived;
    $('#importFold08').hidden = archived;
    $('#attendanceFold08').hidden = archived;
    $('#calendarDetails').hidden = archived;
    const attendance = $('#attendanceFold08');
    if (fixed) $('#salaryPanel').after($('#captureFold08'),$('#importFold08'),attendance);
    else $('#salaryPanel').before($('#captureFold08'),$('#importFold08'),attendance,$('#attendanceTop'));
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
    $('#earningsFold08').open = !locked;
    $('#deductionsFold08').open = !locked;
    const legacyInfo = $('#archiveStatus132');
    legacyInfo.hidden = !archived;
    legacyInfo.textContent = archived ? person.name+'さんの履歴を表示中。従業員管理から一覧に戻せます。' : '';
  };
  const previousRender = render;
  render = function() {
    if (!state) return;
    try { adoptLegacy(); } catch (error) { toast(error.message); }
    const active = employee();
    const empty = !active;
    $('#employee').closest('label').hidden = empty;
    $('#salaryMonth').closest('label').hidden = empty;
    $('#addEmployee').hidden = !empty;
    for (const child of [...oldWork.children].slice(1)) {
      if (empty) child.hidden = true;
      else if (['salaryPanel','attendanceTop'].includes(child.id)) child.hidden = false;
    }
    if (empty) {
      $('#archiveStatus132').hidden = true;
      return;
    }
    if (state.selected!==active.id) state.selected=active.id;
    previousRender();
  };
  if (state) render();
})();
