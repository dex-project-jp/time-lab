'use strict';
let tableDraft=null,tableEditIndex=null;
function resetTableDraft(){tableDraft=null;updateTableSelectionLabel();$('#tablePreview').innerHTML='';$('#saveTable').disabled=true;const link=$('#linkTablePhoto141');if(link)link.checked=false;if($('#tableEditor').open)$('#tableEditor').close()}
function tableBlocked(r){let old=state.months[employee().id+':'+r.date.slice(0,7)]?.rows?.[+r.date.slice(8)];return !!(old&&(old.reviewed||old.times.some(Boolean)||old.am||old.pm||old.original?.length))}
const timeCellLabels = ['午前出勤','午前退勤','午後出勤','午後退勤'];
function timeCellButton(date, time, slot, editAttribute, rowKey) {
  const label = date + ' ' + timeCellLabels[slot] + ' ' + (time || '未入力') + 'を編集';
  return `<button type="button" class="time-cell-edit" ${editAttribute}="${esc(String(rowKey))}" data-time-slot="${slot}" aria-label="${esc(label)}">${esc(time || '—')}</button>`;
}
function showTimeEditor(slot) {
  const selected = slot === undefined ? $('#tableEditorTitle') : $(`[data-edit-time="${slot}"]`);
  selected.autofocus = true;
  $('#tableEditor').showModal();
  selected.autofocus = false;
}
function readEditorTimes(date) {
  return Array.from(document.querySelectorAll('#tableEditor [data-edit-time]'),
    input => TableCore.editorTime(input.value,date,Number(input.dataset.editTime)));
}
function tablePhotoSources() {
  return typeof selectedPair==='function'
    ? Object.fromEntries(selectedPair().filter(slot=>slot.image).map(slot=>[slot.month,slot.image.id]))
    : {};
}
function tablePhotosMatch(draft) {
  const current = tablePhotoSources();
  const previous = draft.photoSources ?? {};
  return Object.keys({...current,...previous}).every(month=>current[month]===previous[month]);
}
function discardTableForNewPhoto() {
  resetTableDraft();
  $('#tableInput').value = '';
  $('#tableStatus').textContent = '写真が変わりました。新しい写真の読み取り結果を貼り付けてください。';
  renderAttendance();
}

function updateTableSelectionLabel() {
  $('#tableDraftActions148').hidden = !tableDraft;
}
function showTableDraft() {
  if (!tableDraft) return;
  updateTableSelectionLabel();
  $('#tablePreview').innerHTML = `<p>チェックした日だけ反映します。既存の打刻は上書きされます。</p>
    <div class="compact-wrap"><table class="compact-table"><thead><tr>
    <th>日付</th><th>午前<br>出勤</th><th>午前<br>退勤</th><th>午後<br>出勤</th><th>午後<br>退勤</th><th>反映</th>
    </tr></thead><tbody>${tableDraft.rows.map((row,index)=>{
      const known = TableCore.knownCells(row);
      const issue = TableCore.selectionIssue(row);
      return `<tr><th><button class="date-link" data-edit-table="${index}">${esc(row.date.slice(5).replace('-','/'))}</button></th>
        ${row.times.map((time,slot)=>`<td class="${time?'':known[slot]?'empty-cell':'missing'}">
          ${timeCellButton(row.date,time || (known[slot]?'':'?'),slot,'data-edit-table',index)}</td>`).join('')}
        <td><input aria-label="${row.date} を反映" type="checkbox" data-confirm-table="${index}" ${row.confirmed?'checked':''}>
          ${tableBlocked(row)?'<small>上書き対象</small>':''}${issue?'<small>要確認</small>':''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}
function prepareTableDraft(records,ocrSource=null) {
  resetTableDraft();
  const rows = records.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(row=>({
    ...row,selectionVersion:1,am:row.am??!!(row.times[0]||row.times[1]),
    pm:row.pm??!!(row.times[2]||row.times[3]),confirmed:false
  }));
  tableDraft = {id:employee().id,month:salaryMonth(),rows,photoSources:tablePhotoSources(),ocrSource};
  showTableDraft();
  $('#saveTable').disabled = false;
  $('#tableStatus').textContent = rows.length+'日分。写真と照合し、反映する日にチェックしてください。';
  renderAttendance();
}

function readPastedTable148() {
  const text = $('#tableInput').value.trim();
  if (!text) {
    resetTableDraft();
    $('#tableStatus').textContent = '';
    return;
  }
  try {
    prepareTableDraft(TableCore.parse(text,salaryMonth(),employee()).records);
  } catch (error) {
    resetTableDraft();
    $('#tableStatus').textContent = '取り込めません: '+error.message;
  }
}

let editorKnown148 = null;
function showDayHours148(known=editorKnown148) {
  editorKnown148 = known;
  const target = $('#editTableHours148');
  const times = [...document.querySelectorAll('[data-edit-time]')].map(input=>{
    try { return TableCore.editorTime(input.value,'',Number(input.dataset.editTime)); }
    catch { return '?'; }
  });
  const lines = [];
  let total = 0;
  let complete = true;
  for (const [index,label] of ['午前','午後'].entries()) {
    const [start,end] = times.slice(index*2,index*2+2);
    if (!start && !end) continue;
    const from = TimeCore.minute(start), to = TimeCore.minute(end);
    if (from===null || to===null || to<=from) {
      complete = false;
      lines.push(label+'：打刻を確認');
      continue;
    }
    const minutes = to-from;
    total += minutes;
    lines.push(label+'：'+end+' − '+start+' ＝ '+hm(minutes));
  }
  if (TimeCore.inspect({times}).errors.length) complete = false;
  const absenceKnown = $('#editTableConfirm').checked;
  if (!absenceKnown && (known ? times.some((time,index)=>!time && !known[index]) : !times.some(Boolean))) complete = false;
  lines.push('実働合計：'+(complete?hm(total):'要確認'));
  const mode = periodOptions().mode;
  if (mode==='hourly') lines.push('給与計算時間は月間合計を15分単位で切り上げ');
  if (mode==='daily') {
    const hours = 4*(Number($('#editTableAM').checked)+Number($('#editTablePM').checked));
    lines.push('給与上の出勤換算：'+hours+'時間（通常1日8時間）');
  }
  target.replaceChildren(...lines.map(line=>{
    const text = document.createElement('div');
    text.textContent = line;
    return text;
  }));
}
$('#tableEditor').addEventListener('input',event=>{
  if (event.target.matches('[data-edit-time],#editTableAM,#editTablePM,#editTableConfirm')) showDayHours148();
});

$('#tablePreview').onclick = event => {
  const button = event.target.closest('[data-edit-table]');
  if (button) openTableEditor(+button.dataset.editTable,button.dataset.timeSlot);
};
$('#tablePreview').onchange = event => {
  const index = event.target.dataset.confirmTable;
  if (index===undefined || !tableDraft) return;
  tableDraft.rows[+index].confirmed = event.target.checked;
  updateTableSelectionLabel();
  renderAttendance();
};
function openTableEditor(index,slot) {
  tableEditIndex = index;
  const row = tableDraft.rows[index];
  $('#editTableDate').value = row.date;
  document.querySelectorAll('[data-edit-time]').forEach(input=>input.value=row.times[+input.dataset.editTime]);
  $('#editTableAM').checked = row.am;
  $('#editTablePM').checked = row.pm;
  $('#editTableConfirm').checked = row.confirmed && !TableCore.selectionIssue(row);
  $('#editTableError').textContent = TableCore.selectionIssue(row);
  showDayHours148(TableCore.knownCells(row));
  showTimeEditor(slot);
}
$('#closeTableEditor').onclick = () => $('#tableEditor').close();
$('#saveTableEdit').onclick = () => {
  try {
    const old = tableDraft.rows[tableEditIndex];
    const date = $('#editTableDate').value;
    const times = readEditorTimes(date);
    const confirmed = $('#editTableConfirm').checked;
    const row = {...old,date,times,confirmed,selectionVersion:1,
      known:times.map((time,slot)=>!!time || confirmed || (!old.times[slot] && TableCore.knownCells(old)[slot])),
      am:$('#editTableAM').checked,pm:$('#editTablePM').checked};
    const issue = confirmed && TableCore.selectionIssue(row);
    if (issue) throw Error(issue);
    if (old.date!==row.date || old.times.join('|')!==row.times.join('|') || old.am!==row.am || old.pm!==row.pm) {
      row.manualPhotoEdit = true;
    }
    const rows = tableDraft.rows.map((value,index)=>index===tableEditIndex?row:value);
    TableCore.validate(rows,salaryMonth(),employee().id);
    tableDraft.rows = rows.sort((a,b)=>a.date.localeCompare(b.date));
    $('#tableEditor').close();
      showTableDraft();
    renderAttendance();
  } catch (error) { $('#editTableError').textContent = error.message; }
};
function selectTableRows(checked) {
  if (!tableDraft) return;
  for (const row of tableDraft.rows) row.confirmed = checked;
  showTableDraft();
  $('#tableStatus').textContent = checked
    ? tableDraft.rows.length+'日を選びました。「要確認」の日は修正するか、チェックを外してください。'
    : 'すべてのチェックを外しました。';
  renderAttendance();
}
$('#confirmReadableRows').onclick = () => selectTableRows(true);
$('#clearReadableRows08').onclick = () => selectTableRows(false);

$('#saveTable').onclick = async () => {
  const draft = tableDraft;
  const button = $('#saveTable');
  button.disabled = true;
  const buckets = new Map();
  let committed = false;
  try {
    if (!draft || draft.id!==employee().id || draft.month!==salaryMonth() || !tablePhotosMatch(draft) ||
        (draft.ocrSource && !state.months[draft.id+':'+draft.ocrSource.month]?.images?.some(image=>image.id===draft.ocrSource.id))) {
      throw Error('従業員・給与対象月または写真が変わりました。読み取り直してください。');
    }
    const linkPhoto = $('#linkTablePhoto141')?.checked;
    for (const row of draft.rows.filter(row=>row.confirmed)) {
      const key = draft.id+':'+row.date.slice(0,7);
      if (buckets.has(key)) continue;
      const previous = state.months[key];
      const staged = previous && structuredClone(previous);
      if (staged) state.months[key] = staged;
      buckets.set(key,{previous,staged});
    }
    const result = TableCore.applySelected(state,draft.id,draft.month,draft.rows);
    for (const [key,value] of buckets) value.staged = state.months[key];
    for (const date of result.dates) {
      const month = date.slice(0,7);
      const key = draft.id+':'+month;
      const row = state.months[key].rows[+date.slice(8)];
      const source = draft.ocrSource?.month===month ? draft.ocrSource.id : draft.photoSources?.[month];
      if (source) {
        row.sourceIds = [source];
        if ((linkPhoto || draft.ocrSource) && typeof PhotoRemoval!=='undefined') PhotoRemoval.link(row,source);
      }
      if (typeof savedChecks08!=='undefined') savedChecks08.delete(date);
    }
    await save({strict:true});
    committed = true;
    if (tableDraft!==draft) return;
    render();
    $('#tableStatus').textContent = `保存しました：新規${result.added}日、上書き${result.replaced}日。未確定の給与は更新後の勤怠で計算します。`;
  } catch (error) {
    if (!committed) for (const [key,{previous,staged}] of buckets) {
      if (state.months[key] !== staged) continue;
      if (previous) state.months[key] = previous;
      else delete state.months[key];
    }
    if (tableDraft===draft) $('#tableStatus').textContent = '保存できません: '+error.message;
  } finally {
    if (tableDraft===draft) button.disabled = !draft;
  }
};
$('#employee').addEventListener('change',resetTableDraft);
$('#salaryMonth').addEventListener('change',resetTableDraft);
