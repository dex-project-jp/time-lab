'use strict';

const deductionFields10 = [
  'insured','eiYear','business','eiRate','eiRounding','eiStart','eiEnd','eiSource','eiConfirmed',
  'taxYear','taxColumn','dependents','secondaryDependents','residency','taxConditions','otherSocial10','socialConfirmed',
  'eiMethod11','eiCustomRate11','eiCustomRounding11'
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
