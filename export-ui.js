'use strict';

const exportDialog = $('#payrollExport');
const exportStatus = $('#payrollExportStatus');
const exportOther = $('#payrollExportOther');
const exportSend = $('#payrollExportSend');
let exportRun = 0;

function shareableFiles(files) {
  return typeof navigator.share === 'function' && navigator.canShare?.({files});
}

function exportButton(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = label;
  button.onclick = action;
  return button;
}

async function sharePayrollFiles(files, current, fallback, zipAvailable = false) {
  try {
    await navigator.share({files});
    if (current()) exportStatus.textContent = '送信結果は共有先のアプリで確認してください。' +
      (zipAvailable ? '添付が揃わない場合は「その他の操作」のZIPをお使いください。' : '');
  } catch (error) {
    if (!current()) return;
    if (error.name === 'AbortError') {
      exportStatus.textContent = '共有をキャンセルしました。';
    } else {
      exportOther.open = true;
      exportStatus.textContent = fallback;
    }
  }
}

function showExportFile(file, label, preview) {
  const item = document.createElement('li');
  if (preview) {
    const image = document.createElement('img');
    image.src = preview.data;
    image.alt = '';
    item.append(image);
  }
  const name = document.createElement('span');
  name.textContent = label;
  name.title = file.name;
  item.append(name);
  $('#payrollExportFiles').append(item);
  $('#payrollExportActions').append(exportButton(label + 'を書き出す', () => download(file.name, file, file.type)));
}

async function openPayrollExport(forCompany) {
  if (!state || !payPeriod()) {
    $('#payrollExportNotice').textContent = '給与を作成してから出力してください。';
    return;
  }
  const run = ++exportRun;
  const key = payKey();
  const current = () => run === exportRun && exportDialog.open && payKey() === key;
  const payrollState = $('#payrollExportState');
  const photoStatus = $('#payrollExportPhotos');
  const zipActions = $('#payrollExportZip');
  const fallback = forCompany ?
    'まとめて共有できない場合は「その他の操作」からZIPをお使いください。' :
    'まとめて共有できない場合は「その他の操作」からファイルを書き出し、手動で添付してください。';
  $('#payrollExportTitle').textContent = forCompany ? '管理会社へ送る' : 'パソコンへ送る';
  $('#payrollExportNotice').textContent = '';
  $('#payrollExportFiles').replaceChildren();
  $('#payrollExportActions').replaceChildren();
  zipActions.replaceChildren();
  photoStatus.textContent = '';
  payrollState.textContent = '';
  exportOther.hidden = true;
  exportOther.open = false;
  exportSend.disabled = true;
  exportSend.onclick = null;
  exportSend.textContent = forCompany ? 'この内容で送る' : 'PDFとExcelを送る';
  exportStatus.textContent = '添付ファイルを準備しています…';
  $('#payrollExportContext').textContent = employee().name + ' / ' + salaryMonth();
  exportDialog.showModal();

  try {
    await saveQueue;
    if (!current()) return;
    const period = PeriodCore.period(salaryMonth());
    const model = PayrollExport.model(employee().name, period, livePay(), Boolean(payPeriod().snapshot), earningName, hm);
    payrollState.textContent = model.status;
    const pdf = await PayrollExport.pdf(model);
    if (!current()) return;
    const attachments = [{file:pdf, label:'給与明細PDF'}];
    if (forCompany) {
      const missing = [];
      for (const slot of selectedPair().reverse()) {
        const isPrevious = slot.half === 'second';
        const date = slot.month + (isPrevious ? ' 16日〜月末' : ' 1〜15日');
        if (!slot.image) {
          missing.push(date);
          continue;
        }
        const file = PayrollExport.photo(slot, 'タイムカード_' + PayrollExport.filePart(model.name) + '_' + slot.month +
          (isPrevious ? '_16日-月末' : '_1-15日'));
        attachments.push({file, label:'タイムカード写真 ' + date, preview:slot.image});
      }
      if (missing.length) photoStatus.textContent = '写真未登録：' + missing.join('、');
    } else {
      attachments.push({file:await PayrollExport.workbook(model), label:'給与明細Excel'});
    }
    if (!current()) return;

    const files = attachments.map(({file}) => file);
    attachments.forEach(({file, label, preview}) => showExportFile(file, label, preview));
    exportOther.hidden = false;
    if (shareableFiles(files)) {
      exportSend.onclick = () => {
        if (current()) return sharePayrollFiles(files, current, fallback, forCompany);
      };
      exportSend.disabled = false;
      exportStatus.textContent = '';
    } else {
      exportOther.open = true;
      exportStatus.textContent = fallback;
    }

    if (forCompany) {
      try {
        const zip = await PayrollExport.archive(files, model.stem + '_管理会社用');
        if (!current()) return;
        if (shareableFiles([zip])) zipActions.append(exportButton('ZIPを送る', () =>
          sharePayrollFiles([zip], current, 'ZIPを共有できませんでした。書き出して手動で添付してください。')));
        zipActions.append(exportButton('ZIPを書き出す', () => download(zip.name, zip, zip.type)));
      } catch {
        if (current()) zipActions.append('ZIPを準備できませんでした。個別に書き出して添付できます。');
      }
    }
  } catch (error) {
    if (current()) exportStatus.textContent = '添付ファイルを準備できませんでした。' + error.message;
  }
}

$('#exportPC12').onclick = () => openPayrollExport(false);
$('#exportCompany12').onclick = () => openPayrollExport(true);
$('#closePayrollExport').onclick = () => exportDialog.close();
exportDialog.addEventListener('close', () => {
  if (exportDialog.open) return;
  exportRun++;
  exportSend.onclick = null;
  $('#payrollExportFiles').replaceChildren();
  $('#payrollExportActions').replaceChildren();
  $('#payrollExportZip').replaceChildren();
});
