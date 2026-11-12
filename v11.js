'use strict';

function deductionItems11(create = false) {
  const store = payStore();
  if (create) {
    store.extraProfiles09 ??= {};
    store.extraProfiles09[employee().id] ??= {};
    store.extraProfiles09[employee().id].deductionItems11 ??= {};
  }
  return store.extraProfiles09?.[employee().id]?.deductionItems11;
}

function rememberDeductionItem11(item) {
  deductionItems11(true)[item.id] = structuredClone(item);
}

function forgetDeductionItem11(id) {
  deductionItems11(true)[id] = null;
}

function applyDeductionItems11(period) {
  const items = deductionItems11();
  if (!items) return;
  period.deductions = period.deductions.filter(item => items[item.id] !== null);
  for (const item of Object.values(items)) {
    if (!item) continue;
    const index = period.deductions.findIndex(row => row.id === item.id);
    if (index === -1) period.deductions.push(structuredClone(item));
    else period.deductions[index] = structuredClone(item);
  }
}

const priorRows11 = payRows;
payRows = function (side, period, result) {
  if (side !== 'deductions') return priorRows11(side,period,result);
  if (period.snapshot) return result.deductions.map(item => `<p class="deductionLine11"><span>${esc(item.name)}</span><strong>${yen(item.amount)}</strong></p>`).join('');
  return period.deductions.filter(item => !['housing','utilities'].some(key => PayrollExtras.find([item],key)))
    .map(item => {
      const standard = ['tax','ei'].includes(item.id) || item.calc !== 'manual' || !!item.overrideFor;
      const auto = item.overrideFor ?? (item.calc === 'manual' ? (item.id === 'tax' ? 'income' : 'employment') : item.calc);
      const disabled = item.enabled === false;
      const computed = result.deductions.find(row=>row.id===item.id);
      const hint = standard && !disabled && item.calc !== 'manual' &&
        (computed?.amount == null || computed?.method === 'custom') ? computed?.note : '';
      return `<div class="pay-item deduction11" data-pay-side="deductions" data-pay-id="${esc(item.id)}">
        <label class="deductionLine11"><span>${standard ? esc(item.name) : '控除項目'}</span><input aria-label="${esc(item.name)}を控除する" type="checkbox" data-pay-field="enabled" ${disabled?'':'checked'}></label>
        ${standard ? `<label>計算方法<select data-pay-field="calc"><option value="${auto}" ${item.calc !== 'manual'?'selected':''}>自動計算</option><option value="manual" ${item.calc === 'manual'?'selected':''}>手入力</option></select></label>`
          : `<label>名称<input data-pay-field="name" maxlength="80" value="${esc(item.name)}"></label>`}
        <label>金額（円）<input type="number" inputmode="numeric" min="0" max="1000000000" step="1" placeholder="未入力・未計算" data-pay-field="amount"
          value="${item.calc === 'manual' ? item.amount : result.deductions.find(row=>row.id===item.id)?.amount ?? ''}" ${item.calc !== 'manual'?'disabled':''}></label>
        ${standard ? `<p class="muted" data-deduction-note12>${esc(hint || '')}</p>` : ''}
        ${standard ? `<button type="button" class="secondary" data-open-deduction12>計算設定を開く</button>` : `<button type="button" class="secondary" data-remove-pay="${esc(item.id)}">削除</button>`}
      </div>`;
    }).join('');
};

for (const selector of [
  '#empLegal08','#empLegalKind08','#empLegalConfirmed08','[data-special="legalBasis"]',
  '[data-special="legalKind"]','[data-special="legalConfirmed"]','[data-special="countReason"]',
  '[data-special="countConfirmed"]','[data-pay-setting="eiConfirmed"]','[data-pay-setting="eiSource"]',
  '[data-pay-setting="taxConditions"]','[data-pay-setting="socialConfirmed"]',
  '[data-extra09="leave.dates"]','[data-extra09="leave.confirmed"]'
]) document.querySelector(selector)?.closest('label')?.setAttribute('hidden','');
for (const item of deductionPanel09.querySelectorAll('details')) item.hidden = true;
const payrollSettings11 = $('#pay07Settings');
const modes11 = document.createElement('div');
modes11.className = 'form-grid';
modes11.innerHTML = `
  <label>雇用保険の計算方式<select data-pay-setting="eiMethod11">
    <option value="custom">カスタム（Excel方式・支給総額を使用）</option><option value="">法定の従業員負担率</option>
  </select></label>
  <label>カスタム料率（%）<input data-pay-setting="eiCustomRate11" type="number" inputmode="decimal" min="0" max="100" step="0.001" placeholder="1.45"></label>
  <label>カスタム計算の端数処理<select data-pay-setting="eiCustomRounding11">
    <option value="ceil10">10円単位で切り上げ</option><option value="floor">1円未満切り捨て</option><option value="round">1円未満四捨五入</option><option value="ceil">1円未満切り上げ</option>
  </select></label>
  <button type="button" class="secondary" id="excelPreset11">Excelと同じ設定（1.45%・10円切り上げ）</button>`;
payrollSettings11.querySelector('summary').after(modes11);
$('#excelPreset11').onclick = async () => {
  const period = payPeriod();
  if (!period || period.snapshot) return;
  const preset = {eiMethod11:'custom',eiCustomRate11:1.45,eiCustomRounding11:'ceil10'};
  Object.assign(period.settings,preset);
  for (const key of Object.keys(preset)) rememberDeductionProfile10(period,key);
  renderPay07();
  try { await persistPay(); } catch (error) { payStatus(error.message); }
};
$('#pay07Deductions').addEventListener('click', event => {
  if (!event.target.closest('[data-open-deduction12]')) return;
  const parent = payrollSettings11.closest('#payrollOptions132');
  if (parent) parent.open = true;
  payrollSettings11.open = true;
  payrollSettings11.scrollIntoView({block:'start'});
});
const settingsLink11 = document.createElement('button');
settingsLink11.type = 'button';
settingsLink11.hidden = true;
settingsLink11.className = 'secondary';
settingsLink11.textContent = '税・雇用保険・住宅料金・水道光熱費を編集';
settingsLink11.onclick = () => {
  if (!payPeriod()) {
    $('#startPay07').scrollIntoView({block:'center'});
    return;
  }
  const parent = payrollSettings11.closest('#payrollOptions132');
  if (parent) parent.open = true;
  payrollSettings11.open = true;
  $('#deductionsFold08').open = true;
  $('#deductionsFold08').scrollIntoView({block:'start'});
};
$('#saveEmployee08').after(settingsLink11);

const refund12 = document.createElement('label');
refund12.innerHTML = '還付金（当月のみ・円） <input data-pay-setting="taxRefund" type="number" inputmode="numeric" min="0" max="1000000000" step="1" placeholder="0">';
const subtotal12 = document.createElement('p');
subtotal12.className = 'muted';
$('#pay07Totals').after(subtotal12,refund12);
const residencyForm16 = document.createElement('div');
residencyForm16.className = 'form-grid';
residencyForm16.innerHTML = `
  <label>所得税の居住者区分
    <select id="employeeResidency16">
      <option value="resident">居住者（月額表対象）</option>
      <option value="nonresident">非居住者・別途確認</option>
      <option value="unknown">未確認</option>
    </select>
  </label>
  <button type="button" class="secondary" id="saveResidency16">居住者区分を保存</button>
  <p id="residencyStatus16" role="status"></p>`;
$('#saveEmployee08').after(residencyForm16);
const residencySelect16 = $('#employeeResidency16');
residencySelect16.onchange = () => { $('#residencyStatus16').textContent = ''; };
$('#saveResidency16').onclick = async () => {
  const id = employee().id;
  const residency = residencySelect16.value;
  state.payrollV07 ??= {profiles:{},periods:{},taxTables:{}};
  rememberDeductionProfile10({settings:{residency}},'residency');
  try {
    await persistPay();
    if (employee().id !== id) return;
    renderPay07();
    $('#residencyStatus16').textContent = '従業員の居住者区分を保存しました。';
  } catch (error) {
    if (employee().id === id) $('#residencyStatus16').textContent = error.message;
  }
};
let residencyEmployee16;
const beforeRender11 = renderPay07;
renderPay07 = function (keepRows = false) {
  beforeRender11(keepRows);
  if (!state) return;
  const period = payPeriod();
  const id = employee().id;
  if (residencyEmployee16 !== id) $('#residencyStatus16').textContent = '';
  residencyEmployee16 = id;
  const stored = payStore().extraProfiles09?.[id]?.deductionSettings10;
  residencySelect16.value = PayrollCore.deductionSettings12(period?.settings ?? {}, stored ?? {}).residency;
  if (!period) return;
  $('#excelPreset11').disabled = !!period.snapshot;
  try {
    const result = livePay();
    for (const note of document.querySelectorAll('[data-deduction-note12]')) {
      const id = note.closest('[data-pay-id]').dataset.payId;
      const row = result.deductions.find(item => item.id === id);
      note.textContent = row?.enabled !== false && row?.calc !== 'manual' &&
        (row?.amount == null || row?.method === 'custom') ? row?.note ?? '' : '';
      note.hidden = !note.textContent;
    }
    subtotal12.hidden = result.deductionTotal !== null;
    subtotal12.textContent = '計算済みの控除小計 ' + yen(result.knownDeduction ?? 0);
    $('#pay07Reference').textContent = [
      result.tax.note, result.ei.note
    ].filter(Boolean).join('\n');
    if (period.snapshot?.settings.simplePayroll11) deductionPanel09.hidden = true;
    else deductionPanel09.hidden = !!period.snapshot;
  } catch {
    // Existing renderer reports invalid inputs.
  }
};
if (state) renderPay07();
