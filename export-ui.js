'use strict';

const exportDialog = $('#payrollExport');
const exportStatus = $('#payrollExportStatus');
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

async function sharePayrollFiles(files) {
  try {
    await navigator.share({files});
    exportStatus.textContent = '共有操作を終了しました。送信や添付の結果は共有先のアプリで確認してください。';
  } catch (error) {
    exportStatus.textContent = error.name === 'AbortError' ? '共有をキャンセルしました。' :
      '共有できませんでした。ZIPの共有、または個別保存して手動添付してください。';
  }
}

function showExportFile(file, preview) {
  const item = document.createElement('li');
  const name = document.createElement('span');
  name.textContent = file.name;
  item.append(name, exportButton('保存', () => download(file.name, file, file.type)));
  if (preview) {
    const image = document.createElement('img');
    image.src = preview.data;
    image.alt = 'タイムカードの内容確認';
    item.append(image);
  }
  $('#payrollExportFiles').append(item);
}

async function openPayrollExport(forCompany) {
  if (!state || !payPeriod()) {
    $('#payrollExportNotice').textContent = '給与を作成してから出力してください。';
    return;
  }
  const run = ++exportRun;
  const key = payKey();
  const current = () => run === exportRun && exportDialog.open && payKey() === key;
  const context = $('#payrollExportContext');
  const actions = $('#payrollExportActions');
  const photoStatus = $('#payrollExportPhotos');
  $('#payrollExportTitle').textContent = forCompany ? '管理会社への添付を確認' : 'パソコン用の出力';
  $('#payrollExportNotice').textContent = '';
  $('#payrollExportFiles').replaceChildren();
  actions.replaceChildren();
  photoStatus.textContent = '';
  exportStatus.textContent = 'ファイルを作成しています…';
  context.textContent = employee().name + ' / ' + salaryMonth();
  exportDialog.showModal();

  try {
    await saveQueue;
    if (!current()) return;
    const period = PeriodCore.period(salaryMonth());
    const result = livePay();
    const model = PayrollExport.model(employee().name, period, result, Boolean(payPeriod().snapshot), earningName, hm);
    context.textContent += ' / ' + model.status;
    const pdf = await PayrollExport.pdf(model);
    if (!current()) return;
    const files = [pdf];
    const previews = [];
    if (forCompany) {
      const slots = selectedPair().reverse();
      const counts = [];
      for (const slot of slots) {
        const dates = slot.half === 'second' ? '16日〜月末' : '1〜15日';
        const label = slot.month + ' ' + dates;
        if (!slot.image) {
          counts.push(label + '　写真未登録');
          continue;
        }
        files.push(PayrollExport.photo(slot, 'タイムカード_' + PayrollExport.filePart(model.name) + '_' + slot.month +
          (slot.half === 'second' ? '_16日-月末' : '_1-15日')));
        previews.push(slot.image);
        counts.push(label + (slot.image.originalData ? '　原本を添付' : '　登録時に変換された保存画像を添付'));
      }
      photoStatus.textContent = counts.join('\n') + (previews.length < 2 ?
        '\n追加する場合は「写真を撮影・選択」でこの給与月に登録してください。' : '');
      exportStatus.textContent = '氏名・対象月・添付を確認し、共有メニューで管理会社の宛先を選んでください。';
    } else {
      files.push(await PayrollExport.workbook(model));
      exportStatus.textContent = 'PDFとExcelを共有するか、必要なファイルを個別に保存してください。';
    }
    if (!current()) return;
    const zip = forCompany ? await PayrollExport.archive(files, model.stem + '_管理会社用') : null;
    if (!current()) return;

    files.forEach((file, i) => showExportFile(file, previews[i - 1]));
    if (shareableFiles(files)) actions.append(exportButton('添付ファイルを共有', () => sharePayrollFiles(files)));
    if (zip) {
      if (shareableFiles([zip])) actions.append(exportButton('ZIPで共有', () => sharePayrollFiles([zip])));
      actions.append(exportButton('ZIPを保存', () => download(zip.name, zip, zip.type)));
    }
  } catch (error) {
    if (current()) exportStatus.textContent = '出力できませんでした。' + error.message;
  }
}

$('#exportPC12').onclick = () => openPayrollExport(false);
$('#exportCompany12').onclick = () => openPayrollExport(true);
$('#closePayrollExport').onclick = () => {
  exportRun++;
  exportDialog.close();
};
exportDialog.addEventListener('close', () => {
  if (exportDialog.open) return;
  $('#payrollExportFiles').replaceChildren();
  $('#payrollExportActions').replaceChildren();
});
