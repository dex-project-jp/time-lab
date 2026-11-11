'use strict';

const deductionFields10 = [
  'insured','eiYear','business','eiRate','eiRounding','eiStart','eiEnd','eiSource','eiConfirmed',
  'taxYear','taxColumn','dependents','secondaryDependents','residency','taxConditions','otherSocial10','socialConfirmed'
];

function rememberDeductionProfile10(period, key) {
  if (!deductionFields10.includes(key)) return;
  const profiles = payStore().extraProfiles09 ??= {};
  const profile = profiles[employee().id] ??= {};
  const settings = profile.deductionSettings10 ??= {};
  const fields = [key,'eiConfirmed','taxConditions','socialConfirmed'];
  if (key === 'business') fields.push('eiRate');
  if (key === 'eiConfirmed' && period.settings.eiConfirmed) fields.push(...deductionFields10.slice(0,8));
  if (key === 'taxConditions' && period.settings.taxConditions) fields.push(...deductionFields10.slice(9,14));
  if (key === 'socialConfirmed' && period.settings.socialConfirmed) fields.push('otherSocial10');
  for (const field of fields) {
    if (period.settings[field] !== undefined) settings[field] = period.settings[field];
  }
}

function applyDeductionProfile10(period) {
  const saved = payStore().extraProfiles09?.[employee().id]?.deductionSettings10;
  if (!saved) return;
  for (const field of deductionFields10) {
    if (Object.prototype.hasOwnProperty.call(saved,field)) period.settings[field] = saved[field];
  }
}

const socialLabel10 = document.createElement('label');
socialLabel10.innerHTML = '社会保険料等（雇用保険以外・円） <input data-pay-setting="otherSocial10" type="number" min="0" max="1000000000" step="1" inputmode="numeric">';
const socialConfirm10 = document.querySelector('[data-pay-setting="socialConfirmed"]').closest('label');
socialConfirm10.before(socialLabel10);
const socialHint10 = document.createElement('p');
socialHint10.className = 'muted';
socialHint10.textContent = '既存の控除明細で社会保険料等を入力している場合、この欄は0円にしてください。入力値は控除と税額計算に反映します。';
socialLabel10.after(socialHint10);

const deductionSummary10 = document.createElement('div');
deductionSummary10.id = 'deductionSummary10';
deductionSummary10.setAttribute('aria-live','polite');
$('#pay07Totals').after(deductionSummary10);
const beforeRender10 = renderPay07;
renderPay07 = function (keepRows = false) {
  beforeRender10(keepRows);
  deductionSummary10.replaceChildren();
  try {
    const result = livePay();
    if (!result) return;
    const known = result.knownDeduction ?? result.deductionTotal ?? 0;
    const pending = result.deductions.filter(item => item.amount === null);
    const subtotal = document.createElement('p');
    subtotal.innerHTML = '<strong>確認済み控除小計　'+yen(known)+'</strong>';
    deductionSummary10.append(subtotal);
    if (pending.length) {
      const details = document.createElement('p');
      details.textContent = '要確認：'+pending.map(item=>item.name).join('・');
      deductionSummary10.append(details);
    }
    if (result.errors.length) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = '控除の設定・確認を開く';
      button.onclick = () => {
        $('#deductionsFold08').open = true;
        $('#pay07Settings').open = true;
        $('#deductionsFold08').scrollIntoView({block:'start'});
      };
      deductionSummary10.append(button);
    }
    const input = socialLabel10.querySelector('input');
    if (input !== document.activeElement && payPeriod()?.settings.otherSocial10 === undefined) input.value = '0';
  } catch {
    // The existing renderer displays the calculation error.
  }
};

if (state) renderPay07();
