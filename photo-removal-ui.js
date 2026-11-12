'use strict';

(() => {
  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'secondary';
  preview.textContent = '給与明細を確認';
  preview.onclick = () => {
    if (payPeriod()?.snapshot) $('#periodPrint').click();
  };
  $('#outputActions132').prepend(preview);

  const dialog = document.createElement('dialog');
  dialog.id = 'removePhoto141';
  dialog.setAttribute('aria-labelledby','removePhotoTitle141');
  dialog.innerHTML = `
    <h2 id="removePhotoTitle141">タイムカード写真を削除</h2>
    <p id="removePhotoContext141"></p>
    <img id="removePhotoImage141" alt="削除するタイムカード写真">
    <fieldset>
      <legend>削除する範囲</legend>
      <label><input type="radio" name="removePhotoScope141" value="photo" checked> 写真だけ削除</label>
      <label><input type="radio" name="removePhotoScope141" value="attendance"> 写真と取り込んだ勤怠を削除</label>
    </fieldset>
    <div id="removePhotoRows141" hidden></div>
    <p id="removePhotoPreserve141"></p>
    <p id="removePhotoStatus141" role="status"></p>
    <div class="actions">
      <button type="button" class="secondary" id="cancelPhotoRemoval141">キャンセル</button>
      <button type="button" id="confirmPhotoRemoval141">選択した範囲を削除</button>
    </div>`;
  document.body.append(dialog);
  const remove = $('#confirmPhotoRemoval141');
  const cancel = $('#cancelPhotoRemoval141');
  const withAttendance = dialog.querySelector('[value=attendance]');
  const rowsList = $('#removePhotoRows141');
  const status = $('#removePhotoStatus141');
  let target = null;
  let busy = false;

  function openRemoval(month,id) {
    try {
      const person = employee();
      if (!person || person.archivedAt132) return;
      const planned = PhotoRemoval.plan(state,person.id,month,id);
      target = {employeeId:person.id,period:salaryMonth(),month,id,rows:JSON.stringify(planned.rows)};
      $('#removePhotoContext141').textContent = person.name+' ／ '+target.period+'給与 ／ 写真の暦月 '+month+' ／ '+planned.photo.name;
      $('#removePhotoImage141').src = planned.photo.data;
      dialog.querySelector('[value=photo]').checked = true;
      withAttendance.disabled = !planned.rows.length;
      rowsList.hidden = true;
      rowsList.replaceChildren();
      if (planned.rows.length) {
        const title = document.createElement('p');
        title.textContent = '削除する打刻（午前出勤・午前退勤・午後出勤・午後退勤）';
        const list = document.createElement('ul');
        for (const row of planned.rows) {
          const item = document.createElement('li');
          item.textContent = row.date+'　'+row.times.map(value=>value || '—').join(' ／ ');
          list.append(item);
        }
        rowsList.append(title,list);
      }
      $('#removePhotoPreserve141').textContent = planned.rows.length
        ? '元の写真を特定できない打刻、手入力・手動修正・別写真と重複する打刻は残ります。'
        : 'この写真だけが元と確認できる未修正の打刻がないため、写真だけ削除できます。必要な打刻は日別勤怠で修正してください。';
      status.textContent = '';
      dialog.showModal();
    } catch (error) {
      $('#pairStatus').textContent = error.message;
    }
  }

  dialog.addEventListener('change',()=>{ rowsList.hidden = !withAttendance.checked; });
  dialog.addEventListener('cancel',event=>{ if (busy) event.preventDefault(); });
  dialog.addEventListener('close',()=>{
    $('#removePhotoImage141').removeAttribute('src');
    target = null;
  });
  cancel.onclick = () => { if (!busy) dialog.close(); };

  const amounts = result => JSON.stringify([
    result.gross,result.deductionTotal,result.net,
    ...['earnings','deductions'].map(side=>(result[side] ?? []).filter(item=>item.amount!==0)
      .map(item=>[item.id,item.amount]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))
  ]);

  function recalculate(previous,updated,employeeId,months) {
    const selectedMonth = $('#salaryMonth');
    const priorMonth = selectedMonth.value;
    const revised = [];
    try {
      for (const month of months) {
        const key = employeeId+':'+month;
        const period = previous.payrollV07?.periods?.[key];
        if (!period?.snapshot) continue;
        const draft = {...period,snapshot:null};
        selectedMonth.value = month;
        let before, after;
        try {
          state = {...previous,payrollV07:{...previous.payrollV07,periods:{...previous.payrollV07.periods,[key]:draft}}};
          before = livePay();
          state = {...updated,payrollV07:{...updated.payrollV07,periods:{...updated.payrollV07.periods,[key]:draft}}};
          after = livePay();
        } catch { /* When recalculation cannot finish, keep the previous version in history. */ }
        if (before && after && amounts(before)===amounts(after) && before.ready===after.ready) continue;
        const replacement = {...period,revisions:[...(period.revisions ?? [])]};
        PayrollCore.revise(replacement);
        updated.payrollV07 = {...updated.payrollV07,periods:{...updated.payrollV07.periods,[key]:replacement}};
        revised.push(month);
      }
    } finally {
      state = previous;
      selectedMonth.value = priorMonth;
    }
    return revised;
  }

  remove.onclick = async () => {
    if (busy || !target) return;
    const {employeeId,period,month,id,rows} = target;
    if (employee()?.id!==employeeId || salaryMonth()!==period) {
      status.textContent = '従業員または給与対象月が変わりました。開き直してください。';
      return;
    }
    busy = true;
    remove.disabled = cancel.disabled = true;
    const previous = state;
    let revised = [];
    try {
      const current = PhotoRemoval.plan(previous,employeeId,month,id);
      const includeRows = withAttendance.checked;
      if (includeRows && JSON.stringify(current.rows)!==rows) throw Error('削除対象の勤怠が変わりました。開き直してください。');
      const key = employeeId+':'+month;
      const bucket = previous.months[key];
      const updated = {...previous,
        months:{...previous.months,[key]:{...bucket,rows:{...bucket.rows}}},
        photoSets:Object.fromEntries(Object.entries(previous.photoSets ?? {}).map(([k,pair])=>[k,{...pair}]))
      };
      PhotoRemoval.remove(updated,employeeId,month,id,includeRows);
      if (includeRows && current.rows.length) {
        delete updated.months[key].calculated;
        revised = recalculate(previous,updated,employeeId,new Set(current.rows.map(row=>PhotoRemoval.salaryMonth(row.date))));
      }
      state = updated;
      await persistState();
    } catch (error) {
      state = previous;
      status.textContent = error?.message || '端末への保存に失敗しました。';
      return;
    } finally {
      busy = false;
      remove.disabled = cancel.disabled = false;
    }
    dialog.close();
    render();
    $('#pairStatus').textContent = revised.length
      ? '削除しました。'+revised.join('、')+'給与は再確認・再確定してください。前の明細は履歴に残っています。'
      : '選択した範囲を削除しました。';
  };

  const priorRenderPair = renderPair;
  renderPair = function () {
    priorRenderPair();
    if (!state || !employee() || employee().archivedAt132) return;
    for (const slot of selectedPair()) {
      const card = $('#pair-'+slot.half);
      card.querySelector('.photo-removal-list')?.remove();
      const images = state.months[employee().id+':'+slot.month]?.images ?? [];
      if (!images.length) continue;
      const list = document.createElement('ul');
      list.className = 'photo-removal-list';
      for (const image of images) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = image.name;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.textContent = '削除';
        button.setAttribute('aria-label',image.name+'を削除');
        button.onclick = () => openRemoval(slot.month,image.id);
        item.append(name,button);
        list.append(item);
      }
      card.querySelector('[data-pair-existing]').closest('details').append(list);
    }
  };
  // The original listener captured renderPair before this enhancement.
  $('#salaryMonth').addEventListener('change',renderPair);
  if (state) renderPair();
})();
