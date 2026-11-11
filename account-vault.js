(function (root) {
'use strict';
const fields = ['bank','bankCode','branch','branchCode','type','number','holder'];
function validate(input) {
  const account = Object.fromEntries(fields.map(key => [key, String(input[key] ?? '').normalize('NFKC').trim()]));
  if (!account.bank || !account.branch || !['普通','当座','貯蓄','その他'].includes(account.type) ||
      !/^\d{7}$/.test(account.number) || !/^[ァ-ヺー・\s]+$/u.test(account.holder) ||
      !/^(\d{4})?$/.test(account.bankCode) || !/^(\d{3})?$/.test(account.branchCode) ||
      Object.values(account).some(value => value.length > 100)) {
    throw Error('金融機関・支店・種別・7桁の口座番号・カタカナ名義を確認してください');
  }
  return account;
}

async function derive(crypto, passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:600000, hash:'SHA-256'}, material, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}

async function seal(crypto, employeeId, account, passphrase) {
  if (passphrase.length < 12) throw Error('パスフレーズは12文字以上にしてください');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(crypto, passphrase, salt);
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:new TextEncoder().encode(employeeId)}, key,
    new TextEncoder().encode(JSON.stringify(validate(account))));
  return {version:1, salt:[...salt], iv:[...iv], cipher:[...new Uint8Array(cipher)]};
}

async function open(crypto, employeeId, record, passphrase) {
  try {
    if (record?.version !== 1) throw Error();
    const key = await derive(crypto, passphrase, new Uint8Array(record.salt));
    const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:new Uint8Array(record.iv), additionalData:new TextEncoder().encode(employeeId)}, key, new Uint8Array(record.cipher));
    return validate(JSON.parse(new TextDecoder().decode(plain)));
  } catch {
    throw Error('口座を開けません。パスフレーズを確認してください');
  }
}

const mask = number => '•••••'+number.slice(-2);
root.AccountVault = {fields,validate,seal,open,mask};
if (typeof module !== 'undefined') module.exports = root.AccountVault;
})(typeof window !== 'undefined' ? window : globalThis);
