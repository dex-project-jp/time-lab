'use strict';

(() => {
  const work = $('#work');
  const titles = ['従業員','勤怠入力','給与確認','給与確定','送信'];
  const progress = $('#payProgress');
  const tableInput = $('#tableInput');
  const selection = $('#paySelectSteps');
  const salaryPanel = $('#salaryPanel');
  const receiptPrefix = 'time-lab-sync-receipt:';
  const draftPrefix = 'time-lab-attendance-draft:';
  const stepPrefix = 'time-lab-pay-step:';
  let activeKey = '';
  let step = 1;
  let syncAttempt = [];
  let draftLoadFailed = false;

  function get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function put(key,value) {
    try {
      if (value===null) localStorage.removeItem(key);
      else localStorage.setItem(key,JSON.stringify(value));
      return true;
    } catch { return false; }
  }
  const removeMatching = predicate => {
    for (const key of Object.keys(localStorage)) if (predicate(key)) localStorage.removeItem(key);
  };
  window.clearPayrollStepData = id => {
    try { removeMatching(key=>[receiptPrefix,draftPrefix,stepPrefix].some(prefix=>key.startsWith(prefix+id+':'))); }
    catch { toast('端末に保存した入力途中データを消去できませんでした。'); }
  };

  function button(label,handler,className='secondary') {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = className;
    control.textContent = label;
    control.onclick = handler;
    return control;
  }

  function panel(number,title) {
    const element = document.createElement('section');
    element.className = 'panel';
    element.dataset.stepUi = '';
    element.dataset.stepPanel = number;
    const heading = document.createElement('h2');
    heading.textContent = title;
    heading.tabIndex = -1;
    element.append(heading);
    work.append(element);
    return element;
  }

  progress.dataset.stepUi = '';
  work.prepend(progress);
  selection.dataset.stepUi = '';
  selection.dataset.stepPanel = '1';

  const attendance = panel(2,'勤怠入力');
  const attendanceContext = document.createElement('p');
  const fixedAttendance = document.createElement('details');
  const fixedTitle = document.createElement('summary');
  fixedTitle.textContent = '必要なときだけ勤怠を入力';
  fixedAttendance.append(fixedTitle);
  const attendanceTools = document.createElement('div');
  attendanceTools.id = 'stepAttendanceTools';
  const draftStatus = document.createElement('p');
  draftStatus.className = 'muted';
  draftStatus.setAttribute('role','status');
  const savedCheck = $('#attendanceFold08');
  const calendar = $('#calendarDetails');
  $('#captureFold08 summary').textContent = 'タイムカードを撮影・選択';
  $('#importFold08 summary').textContent = 'ChatGPTの読み取り結果を貼り付け';
  $('#attendanceFold08 summary').textContent = '日別勤怠を入力・確認';
  calendar.querySelector('summary').textContent = '暦月の手入力・OCR・従来の出力';
  attendanceTools.append($('#attendanceTop'),$('#captureFold08'),$('#importFold08'),savedCheck,calendar,draftStatus);
  attendance.append(attendanceContext,attendanceTools,fixedAttendance);

  salaryPanel.dataset.stepPanel = '3';
  const review = document.createElement('div');
  review.id = 'stepReviewSummary';
  const recalculationNotice = document.createElement('p');
  recalculationNotice.className = 'notice';
  recalculationNotice.textContent = '勤怠更新後の給与を表示しています。前回の確定額は履歴に残っています。STEP 4で再確定してください。';
  $('#pay07Totals').before(recalculationNotice);
  const autoPay = document.createElement('div');
  autoPay.id = 'automaticPay148';
  $('#dayPaySummary').after(autoPay);
  monthlySpecial148.after(deductionPanel09);
  const deductions = $('#deductionsFold08');
  deductions.querySelector('summary').textContent = 'その他の支給・控除';
  deductions.append(extrasPanel09,refund12);
  $('#earningsFold08 summary').textContent = '支給明細の詳細編集';
  $('#payrollOptions132 summary').textContent = '給与計算の詳細設定';
  const body = $('#pay07Body');
  $('#pay07Title').after(recalculationNotice);
  body.append($('.pay-columns'),$('#payrollOptions132'),review,$('#pay07Totals'),subtotal12,$('#pay07Issues'));
  const payStatusNode = $('#pay07Status');
  const issues = $('#pay07Issues');
  const confirm = panel(4,'給与確定');
  const confirmSummary = document.createElement('div');
  const confirmStatus = document.createElement('p');
  confirmStatus.setAttribute('role','status');
  const freeze = $('#freezePay07');
  const revise = $('#revisePay07');
  confirm.append(confirmSummary,freeze,revise,confirmStatus);
  const sending = panel(5,'送信');
  const sendSummary = document.createElement('div');
  const syncState = document.createElement('p');
  syncState.setAttribute('role','status');
  const outputActions = $('#outputActions132');
  const share = $('#exportPC12');
  share.textContent = '給与明細を送る';
  share.onclick = () => openPayrollExport(false,null,true);
  const company = $('#exportCompany12');
  const legacyOutput = document.createElement('details');
  const legacyTitle = document.createElement('summary');
  legacyTitle.textContent = 'その他の送信方法';
  legacyOutput.append(legacyTitle,company);
  sending.append(sendSummary,syncState,outputActions,legacyOutput);
  const resultActions = document.createElement('div');
  resultActions.className = 'actions';
  resultActions.append(button('Googleで同期完了を確認した',()=>recordSync('done')),
    button('Googleで失敗を確認した',()=>recordSync('failed')));
  sending.append(resultActions);

  const controls = document.createElement('div');
  controls.id = 'payStepControls';
  controls.dataset.stepUi = '';
  const back = button('戻る',()=>show(step-1,true));
  const next = button('次へ',()=>show(step+1,true),'primary');
  controls.append(back,next);
  work.append(controls);

  function modeFor(person,month) {
    const legacy = EmployeeCore.legacy(person,payStore(),state.payPeriods?.[person.id+':'+month]);
    return EmployeeCore.at(payStore().employeeConditions?.[person.id],PeriodCore.period(month).start,legacy);
  }

  function rowFor(person,month) {
    const snapshot = payStore().periods?.[person.id+':'+month]?.snapshot;
    return snapshot ? PayrollSync.fromSnapshot(person,month,snapshot) : window.legacyFixedRow132(person.id,month);
  }

  const versionOf = row => row?.finalizedAt;

  function syncLabel(id,month,row) {
    const receipt = get(receiptPrefix+id+':'+month);
    if (!receipt || receipt.version!==versionOf(row)) return '給与確定済み・未同期';
    if (receipt.status==='done') return 'Google同期済み（確認を記録）';
    if (receipt.status==='failed') return '同期失敗（確認を記録）';
    return 'Googleの結果を確認してください';
  }

  function statusFor(person,month) {
    const key = person.id+':'+month;
    if (payStore().periods?.[key]?.attendanceRevisionPending) return '再確定が必要';
    const row = rowFor(person,month);
    if (row) return syncLabel(person.id,month,row);
    const recorded = PeriodCore.rows(state,person.id,month).some(r=>r.reviewed || r.am || r.pm || r.times?.some(Boolean));
    const photographed = Object.values(state.photoSets?.[key] ?? {}).some(Boolean);
    return payStore().periods?.[key] || get(draftPrefix+key) || recorded || photographed ? '入力途中' : '未入力';
  }

  function selectionCards(person,month) {
    const period = PeriodCore.period(month);
    $('#payPeriodSteps').textContent = period.start+'〜'+period.end+'（15日締め）';
    const labels = {daily:'日給月給',hourly:'時給',fixed:'固定給'};
    const people = state.employees.filter(item=>!item.archivedAt132);
    const list = $('#payEmployeesSteps');
    list.replaceChildren(...people.map(item=>{
      const kind = modeFor(item,month);
      const control = button(item.name,async()=>{
        const selector = $('#employee');
        if (item.id!==employee()?.id) {
          selector.value = item.id;
          selector.dispatchEvent(new Event('change'));
          await saveQueue;
        }
        const saved = get(stepPrefix+item.id+':'+month);
        show(Number.isInteger(saved)&&saved>1 ? saved : 2,true);
      },'secondary pay-person-step');
      control.setAttribute('aria-pressed',String(person?.id===item.id));
      const info = document.createElement('span');
      info.textContent = labels[kind.mode]+' · '+statusFor(item,month);
      control.append(info);
      return control;
    }));
    list.hidden = Boolean(person?.archivedAt132);
  }

  function summary(target,person,month,result) {
    target.replaceChildren();
    const context = document.createElement('p');
    context.textContent = person.name+' ／ '+month+'給与';
    target.append(context);
    if (!result) return;
    const totals = document.createElement('dl');
    totals.className = 'pay-step-totals';
    for (const [label,value] of [['支給総額',result.gross],['控除総額',result.deductionTotal],['差引支給額',result.net]]) {
      const term = document.createElement('dt');
      const amount = document.createElement('dd');
      term.textContent = label;
      amount.textContent = yen(value);
      totals.append(term,amount);
    }
    target.append(totals);
  }

  function refresh() {
    if (!state) return;
    const person = employee();
    const month = salaryMonth() || state.month;
    if (!$('#salaryMonth').value) $('#salaryMonth').value = month;
    $('#salaryMonth').closest('label').hidden = false;
    selectionCards(person,month);
    const period = person && payPeriod();
    const locked = Boolean(period?.snapshot);
    const recheck = Boolean(!locked && period?.attendanceRevisionPending);
    recalculationNotice.hidden = !recheck;
    freeze.textContent = recheck ? '給与を再確定' : '給与を確定';
    if (!person) step = 1;
    if (person?.archivedAt132 && step<3) step = 3;
    if (step===5 && !locked) step = 4;
    work.dataset.payStep = step;
    progress.replaceChildren(...titles.map((title,i)=>{
      const label = i===0 && step!==1 ? button('1 '+title,()=>show(1,true)) : document.createElement('span');
      label.textContent = (i+1)+' '+title;
      if (step===i+1) label.setAttribute('aria-current','step');
      return label;
    }));
    back.hidden = step===1 || !!person?.archivedAt132 && step===3;
    next.hidden = !person || step===5 || (step===4 && !locked) || (step===3 && !payPeriod());
    if (!person) return;
    const terms = modeFor(person,month);
    const isFixed = terms.mode==='fixed';
    attendanceContext.textContent = isFixed ? '月額基本給 '+yen(terms.monthlyBase) : person.name+' ／ '+month+'給与';
    fixedAttendance.hidden = !isFixed;
    if (isFixed && attendanceTools.parentElement!==fixedAttendance) {
      fixedAttendance.open = false;
      fixedAttendance.append(attendanceTools);
    } else if (!isFixed && attendanceTools.parentElement!==attendance) {
      attendance.insertBefore(attendanceTools,fixedAttendance);
    }
    let result;
    try { result = payPeriod() ? livePay() : null; } catch { result = null; }
    autoPay.replaceChildren();
    if (result && !result.dayPay) {
      for (const line of result.earnings.filter(item=>item.id==='base' || item.source==='attendance' ||
          ((item.id==='saturday' || item.source==='specialAttendance') && item.amount!==0))) {
        const text = document.createElement('p');
        text.textContent = earningName(line)+' '+yen(line.amount);
        autoPay.append(text);
      }
    }
    review.replaceChildren();
    if (result) {
      for (const [label,items] of [['支給',result.earnings],['控除',result.deductions]]) {
        const rows = (items ?? []).filter(item=>item.amount!==0 && item.enabled!==false);
        if (!rows.length) continue;
        const list = document.createElement('dl');
        list.className = 'pay-step-lines';
        list.setAttribute('aria-label',label);
        for (const item of rows) {
          const name = document.createElement('dt');
          const amount = document.createElement('dd');
          name.textContent = label==='支給' ? earningName(item) : item.name;
          amount.textContent = yen(item.amount);
          list.append(name,amount);
        }
        review.append(list);
      }
    }
    summary(confirmSummary,person,month,result);
    summary(sendSummary,person,month,result);
    confirmStatus.textContent = locked ? '確定済み。送信は次のステップで行います。' : (issues.textContent || (recheck ? '勤怠が更新されました。給与を再確定してください。' : payStatusNode.textContent));
    const row = rowFor(person,month);
    syncState.textContent = row ? syncLabel(person.id,month,row) : '';
    const receipt = get(receiptPrefix+person.id+':'+month);
    resultActions.hidden = !row || receipt?.version!==versionOf(row) || receipt.status!=='pending';
  }

  function show(number,scroll=false) {
    if (!state) return;
    const person = employee();
    if (number>1 && !person) return;
    step = Math.max(1,Math.min(5,number));
    if (step===4 && !payPeriod()) step = 3;
    if (step===5 && !payPeriod()?.snapshot) step = 4;
    if (step===3) renderPay07();
    else refresh();
    if (activeKey && step>1) put(stepPrefix+activeKey,step);
    if (scroll) {
      const section = work.querySelector('[data-step-panel="'+step+'"]');
      section?.querySelector('h1,h2,h3')?.focus({preventScroll:true});
      window.scrollTo(0,0);
    }
  }

  function persistDraft() {
    if (!activeKey || draftLoadFailed || !employee() || employee().id+':'+salaryMonth()!==activeKey) return;
    const text = tableInput.value;
    const draft = tableDraft?.id+':'+tableDraft?.month===activeKey ? tableDraft : null;
    if (!put(draftPrefix+activeKey,text.trim() || draft ? {text,draft} : null)) {
      draftStatus.textContent = '入力途中の内容を保存できません。必要な内容をコピーしてください。';
      return;
    }
    draftStatus.textContent = text.trim() || draft ? '入力途中の内容をこの端末に保存済み' : '';
  }

  function loadDraft(key) {
    if (activeKey===key) return false;
    activeKey = key;
    draftLoadFailed = false;
    resetTableDraft();
    tableInput.value = '';
    $('#tableStatus').textContent = '';
    draftStatus.textContent = '';
    const saved = key && get(draftPrefix+key);
    if (saved) {
      tableInput.value = typeof saved.text==='string' ? saved.text : '';
      try {
        const stored = saved.draft;
        if (stored && stored.id+':'+stored.month===key && Array.isArray(stored.rows)) {
          TableCore.validate(stored.rows,stored.month,stored.id);
          if (!tablePhotosMatch(stored)) {
            discardTableForNewPhoto();
            return true;
          }
          for (const row of stored.rows) {
            if (row.selectionVersion !== 1) row.confirmed = false;
          }
          tableDraft = stored;
          showTableDraft();
          $('#saveTable').disabled = false;
        }
        if (tableInput.value || tableDraft) {
          $('#importFold08').open = true;
          draftStatus.textContent = '入力途中の内容を復元しました。';
        }
      } catch {
        draftLoadFailed = true;
        draftStatus.textContent = '確認途中の表を復元できませんでした。貼り付けた内容から読み取り直してください。';
      }
    }
    return true;
  }

  function contextChanged(resume) {
    const person = state && employee();
    const key = person && !person.archivedAt132 ? person.id+':'+salaryMonth() : '';
    if (loadDraft(key)) {
      const saved = resume ? get(stepPrefix+key) : null;
      step = person?.archivedAt132 ? 3 : (Number.isInteger(saved)&&saved>=2&&saved<=5 ? saved : 1);
    }
  }
  for (const selector of ['#employee','#salaryMonth']) $(selector).addEventListener('change',()=>{
    contextChanged(false);
    renderAttendance();
    refresh();
  });

  const oldRender = render;
  render = function() {
    oldRender();
    if (!state) return;
    contextChanged(true);
    if (employee()) renderAttendance();
    refresh();
  };
  const oldPayRender = renderPay07;
  renderPay07 = function(keepRows) {
    oldPayRender(keepRows);
    if (state && employee()) refresh();
  };
  const oldAttendance = renderAttendance;
  renderAttendance = function() {
    oldAttendance();
    if (state && employee()) persistDraft();
  };
  tableInput.addEventListener('input',()=>{
    draftLoadFailed = false;
    if (state && employee()) readPastedTable148();
    persistDraft();
  });

  function showOcrDraft() {
    if (step!==2 || scan?.test || scan?.employee!==employee()?.id || !scan?.image ||
        !PeriodCore.period(salaryMonth()).dates.some(date=>date.startsWith(scan.month))) return false;
    const allowed = new Set(PeriodCore.period(salaryMonth()).dates);
    const records = candidates.filter(row=>!row.duplicate).map(row=>({
      date:scan.month+'-'+String(row.day).padStart(2,'0'),
      times:row.times,known:row.times.map(Boolean),raw:row.raw
    })).filter(row=>allowed.has(row.date));
    if (!records.length) return false;
    TableCore.validate(records,salaryMonth(),employee().id);
    tableInput.value = '';
    draftLoadFailed = false;
    prepareTableDraft(records,{id:scan.image.id,month:scan.month});
    $('#importFold08').open = true;
    $('#scanner').close();
    $('#tablePreview').scrollIntoView({block:'start'});
    return true;
  }

  for (const selector of ['#ocr','#runV04']) {
    const control = $(selector);
    const read = control.onclick;
    control.onclick = async event => {
      const previous = candidates;
      await read.call(control,event);
      if (previous!==candidates && !$('#apply').disabled) {
        try { showOcrDraft(); } catch (error) { toast(error.message); }
      }
    };
  }
  const applyOcr = $('#apply').onclick;
  $('#apply').onclick = async event => {
    try { if (!showOcrDraft()) await applyOcr(event); }
    catch (error) { toast(error.message); }
  };
  const saveTable = $('#saveTable').onclick;
  $('#saveTable').onclick = async () => {
    const key = activeKey;
    await saveTable();
    if (key===activeKey && $('#tableStatus').textContent.startsWith('保存しました：')) {
      resetTableDraft();
      tableInput.value = '';
      persistDraft();
      renderAttendance();
      $('#attendanceTop').scrollIntoView({block:'start'});
    }
    refresh();
  };
  const freezeAction = freeze.onclick;
  freeze.onclick = async () => {
    const key = payKey();
    freeze.disabled = true;
    const saved = await freezeAction();
    if (saved) put(receiptPrefix+key,null);
    if (saved && key===payKey() && payPeriod()?.snapshot) show(5,true);
    else refresh();
  };
  const reviseAction = revise.onclick;
  revise.onclick = async () => {
    const prior = payPeriod()?.snapshot;
    await reviseAction();
    if (prior && !payPeriod()?.snapshot) {
      put(receiptPrefix+payKey(),null);
      show(3,true);
    }
  };

  const registerEndpoint = $('#savePayrollSyncEndpoint');
  const registerAction = registerEndpoint.onclick;
  const endpointKey = 'time-lab-payroll-sync-endpoint-v1';
  registerEndpoint.onclick = () => {
    const before = localStorage.getItem(endpointKey);
    registerAction();
    if (before!==localStorage.getItem(endpointKey)) {
      try { removeMatching(key=>key.startsWith(receiptPrefix)); } catch { toast('同期結果の記録を消去できませんでした。'); }
      syncAttempt = [];
      refresh();
    }
  };
  const syncButton = $('#sendPayrollSync');
  const syncAction = syncButton.onclick;
  syncButton.onclick = () => {
    const month = salaryMonth();
    const selected = [...document.querySelectorAll('#payrollSyncEmployees [data-sync-id]:checked')]
      .map(input=>state.employees.find(person=>person.id===input.dataset.syncId))
      .filter(Boolean).map(person=>({key:person.id+':'+month,row:rowFor(person,month)}))
      .filter(item=>item.row);
    syncAction();
    const status = $('#payrollSyncStatus').textContent.startsWith('同期結果はGoogle画面') ? 'pending' : 'failed';
    syncAttempt = status==='pending' ? selected : [];
    for (const item of selected) {
      const previous = get(receiptPrefix+item.key);
      if (previous?.status==='done' && previous.version===versionOf(item.row)) continue;
      put(receiptPrefix+item.key,{version:versionOf(item.row),status});
    }
    refresh();
  };

  function recordSync(status) {
    if (status==='done' && !window.confirm('Googleの確認画面で「同期完了」と表示された分を記録しますか？')) return;
    const batch = syncAttempt.length ? syncAttempt : [{
      key:payKey(),row:rowFor(employee(),salaryMonth())
    }];
    for (const {key,row} of batch) {
      if (row) put(receiptPrefix+key,{version:versionOf(row),status});
    }
    syncAttempt = [];
    refresh();
  }
  if (state) render();
})();
