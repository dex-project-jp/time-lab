'use strict';

const PayrollExport = (() => {
  const encoder = new TextEncoder();
  const xml = value => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/[<>&"']/g, char => ({'<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;'})[char]);
  const filePart = value => value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim().replace(/[. ]+$/, '').slice(0, 80) || '従業員';
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const packageNS = 'http://schemas.openxmlformats.org/package/2006';

  function model(name, period, result, saved, itemName, time) {
    const amount = value => Number.isFinite(value) ? value : '要確認';
    const items = rows => rows.filter(row => row.amount !== 0).map(row => [itemName(row), amount(row.amount)]);
    const {summary, dayPay} = result;
    const attendance = result.options?.mode === 'fixed' ? [] : [
      ['出勤日数', dayPay?.totalDays ?? summary.days, '日'],
      ...(dayPay ? [['通常出勤日数', dayPay.regularDays, '日'], ['土曜出勤日数', dayPay.saturdayDays, '日']] : []),
      ['実働時間', time(summary.minutes)],
      ['給与計算用時間', time(summary.payroll)],
      ['要確認の勤怠', summary.pending, '日']
    ];
    return {
      title: period.month + ' 給与明細',
      name,
      status: saved ? '確定済み' : '確認用・未確定',
      stem: '給与明細_' + filePart(name) + '_' + period.month,
      details: [
        ['従業員名', name],
        ['給与対象月', period.month],
        ['対象期間', period.start + '〜' + period.end],
        ['支払日', result.settings.payDate || '要確認'],
        ['状態', saved ? '確定済み' : '確認用・未確定']
      ],
      attendance,
      earnings: [...items(result.earnings), ['支給総額', amount(result.gross)]],
      deductions: [...items(result.deductions), ['控除総額', amount(result.deductionTotal)]],
      totals: [
        ...(result.deductionTotal == null ? [['計算済み控除小計', amount(result.knownDeduction)]] : []),
        ...(result.taxRefund > 0 ? [['還付金（当月調整）', result.taxRefund]] : []),
        ['差引支給額', amount(result.net)]
      ],
      issues: [...new Set(result.errors || [])]
    };
  }

  function relations(entries) {
    return '<Relationships xmlns="' + packageNS + '/relationships">' + entries.map(([type, target], i) =>
      '<Relationship Id="rId' + (i + 1) + '" Type="' + rel + '/' + type + '" Target="' + target + '"/>'
    ).join('') + '</Relationships>';
  }

  async function workbook(data) {
    const zip = new JSZip();
    const rows = [];
    const merges = [];
    function row(values, style, merge = false) {
      const index = rows.length + 1;
      if (merge) merges.push('A' + index + ':C' + index);
      const longest = Math.max(0, ...values.filter(value => typeof value === 'string')
        .map((value, col) => Math.ceil(Array.from(value).length / (merge ? 50 : col === 0 ? 21 : 28))));
      rows.push('<row r="' + index + '" ht="' + Math.max(20, longest * 16) + '" customHeight="1">' +
        values.map((value, i) => {
          const tag = '<c r="' + 'ABC'[i] + index + '" s="' + (i === 1 && typeof value === 'number' && style >= 3 ? style + 2 : style) + '"';
          return typeof value === 'number' && Number.isFinite(value) ? tag + '><v>' + value + '</v></c>' :
            tag + ' t="inlineStr"><is><t xml:space="preserve">' + xml(value ?? '') + '</t></is></c>';
        }).join('') + '</row>');
    }
    row([data.title], 1, true);
    data.details.forEach(values => row(values, 0));
    row(['勤怠集計'], 2, true);
    data.attendance.forEach(values => row(values, 0));
    for (const [section, items] of [['支給', data.earnings], ['控除', data.deductions]]) {
      row([section, '金額（円）'], 2);
      items.forEach((values, i) => row(values, i === items.length - 1 ? 4 : 3));
    }
    data.totals.forEach(values => row(values, 4));
    data.issues.forEach(issue => row(['要確認　' + issue], 0, true));

    const add = (path, content) => zip.file(path, declaration + content);
    add('[Content_Types].xml', '<Types xmlns="' + packageNS + '/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      [['workbook', 'sheet.main'], ['worksheets/sheet1', 'worksheet'], ['styles', 'styles']].map(([path, type]) =>
        '<Override PartName="/xl/' + path + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.' + type + '+xml"/>'
      ).join('') + '</Types>');
    add('_rels/.rels', relations([['officeDocument', 'xl/workbook.xml']]));
    add('xl/_rels/workbook.xml.rels', relations([['worksheet', 'worksheets/sheet1.xml'], ['styles', 'styles.xml']]));
    add('xl/workbook.xml', '<workbook xmlns="' + main + '" xmlns:r="' + rel + '"><sheets>' +
      '<sheet name="給与明細" sheetId="1" r:id="rId1"/></sheets><definedNames>' +
      '<definedName name="_xlnm.Print_Area" localSheetId="0">\'給与明細\'!$A$1:$C$' + rows.length +
      '</definedName></definedNames></workbook>');
    const formats = [[0,0,0], [1,0,0], [2,2,0], [0,0,0], [1,3,0], [0,0,3], [1,3,3]];
    add('xl/styles.xml', '<styleSheet xmlns="' + main + '"><fonts count="3">' +
      ['', '<b/>', '<b/><color rgb="FFFFFFFF"/>'].map(extra => '<font>' + extra + '<sz val="11"/><name val="Yu Gothic"/></font>').join('') +
      '</fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      ['26231A','F2EADB'].map(color => '<fill><patternFill patternType="solid"><fgColor rgb="FF' + color + '"/><bgColor indexed="64"/></patternFill></fill>').join('') +
      '</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="7">' + formats.map(([font, fill, num]) =>
        '<xf numFmtId="' + num + '" fontId="' + font + '" fillId="' + fill + '" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1">' +
        '<alignment vertical="center" wrapText="1"/></xf>').join('') +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    add('xl/worksheets/sheet1.xml', '<worksheet xmlns="' + main + '"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:C' + rows.length + '"/><cols><col min="1" max="1" width="42" customWidth="1"/>' +
      '<col min="2" max="2" width="44" customWidth="1"/><col min="3" max="3" width="8" customWidth="1"/></cols>' +
      '<sheetData>' + rows.join('') + '</sheetData><mergeCells count="' + merges.length + '">' +
      merges.map(range => '<mergeCell ref="' + range + '"/>').join('') + '</mergeCells>' +
      '<pageMargins left="0.3" right="0.3" top="0.35" bottom="0.35" header="0.15" footer="0.15"/>' +
      '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="1"/></worksheet>');
    const bytes = await zip.generateAsync({type:'uint8array', compression:'DEFLATE'});
    return new File([bytes], data.stem + '.xlsx', {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }

  function pdfBytes(jpeg, width, height) {
    const pageWidth = 595.276;
    const pageHeight = 841.89;
    const draw = 'q ' + pageWidth + ' 0 0 ' + pageHeight + ' 0 0 cm /PageImage Do Q\n';
    const objects = [
      ['<< /Type /Catalog /Pages 2 0 R >>'],
      ['<< /Type /Pages /Count 1 /Kids [3 0 R] >>'],
      ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight +
        '] /Resources << /XObject << /PageImage 4 0 R >> >> /Contents 5 0 R >>'],
      ['<< /Type /XObject /Subtype /Image /Width ' + width + ' /Height ' + height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.byteLength + ' >>\nstream\n', jpeg, '\nendstream'],
      ['<< /Length ' + draw.length + ' >>\nstream\n' + draw + 'endstream']
    ];
    const parts = [];
    let length = 0;
    function append(part) {
      const bytes = typeof part === 'string' ? encoder.encode(part) : part;
      parts.push(bytes);
      length += bytes.byteLength;
    }
    append('%PDF-1.4\n');
    append(new Uint8Array([37, 226, 227, 207, 211, 10]));
    const offsets = objects.map((parts, i) => {
      const offset = length;
      append((i + 1) + ' 0 obj\n');
      parts.forEach(append);
      append('\nendobj\n');
      return offset;
    });
    const xref = length;
    append('xref\n0 6\n0000000000 65535 f \n' + offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') +
      'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return parts;
  }

  async function pdf(data) {
    const canvas = document.createElement('canvas');
    canvas.width = 1654;
    canvas.height = 2339;
    const ctx = canvas.getContext('2d');
    const width = 595.276, height = 841.89, margin = 31;
    const inner = width - 2 * margin;
    const commands = [];
    const setFont = (size, bold) => {
      ctx.font = (bold ? '700 ' : '400 ') + size + 'px "Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", sans-serif';
    };
    function text(value, x, y, available, size, bold = false, color = '#24221e') {
      setFont(size, bold);
      let count = 0;
      for (const line of String(value).split(/\r?\n/)) {
        let current = '';
        for (const char of line) {
          if (current && ctx.measureText(current + char).width > available) {
            queue(current);
            current = '';
          }
          current += char;
        }
        queue(current);
      }
      function queue(line) {
        const baseline = y + size * (1 + count++ * 1.35);
        commands.push(() => {
          setFont(size, bold);
          ctx.fillStyle = color;
          ctx.fillText(line, x, baseline);
        });
      }
      return count * size * 1.35;
    }
    function rect(x, y, w, h, color) {
      commands.push(() => {ctx.fillStyle = color; ctx.fillRect(x, y, w, h);});
    }
    const yenText = value => typeof value === 'number' ? value.toLocaleString('ja-JP') + '円' : value;
    let y = 0;
    y += text(data.title, 0, y, inner, 23, true) + 9;
    y += text(data.name + '　' + data.status, 0, y, inner, 15, true) + 3;
    y += text(data.details.slice(2, 4).map(row => row.join(' ')).join('　'), 0, y, inner, 11) + 8;
    const attendance = data.attendance.map(([label, value, unit = '']) => label + ' ' + value + unit);
    const split = data.attendance.length - 3;
    y += text(attendance.slice(0, split).join('　'), 0, y, inner, 11);
    y += text(attendance.slice(split).join('　'), 0, y, inner, 11) + 14;
    function table(x, top, w, title, items) {
      rect(x, top, w, 23, '#322b20');
      text(title, x + 8, top + 4, w - 16, 11, true, '#ffffff');
      top += 23;
      items.forEach(([label, value], i) => {
        const last = i === items.length - 1;
        const size = 11;
        const amount = yenText(value);
        setFont(size, last);
        const amountWidth = ctx.measureText(amount).width;
        const commandIndex = commands.length;
        const lineHeight = text(label, x + 8, top + 4, w - 23 - amountWidth, size, last);
        if (last) {
          rect(x, top, w, lineHeight + 8, '#f2e9d6');
          commands.splice(commandIndex, 0, commands.pop());
        } else rect(x, top + lineHeight + 7, w, 0.45, '#d3cec3');
        text(amount, x + w - 8 - amountWidth, top + 4, amountWidth + 2, size, last);
        top += lineHeight + 8;
      });
      return top;
    }
    const col = (inner - 14) / 2;
    y = Math.max(table(0, y, col, '支給', data.earnings), table(col + 14, y, col, '控除', data.deductions)) + 13;
    for (const [label, value] of data.totals) {
      const size = label === '差引支給額' ? 16 : 11;
      y += text(label + '　' + yenText(value), 0, y, inner, size, true) + 3;
    }
    for (const issue of data.issues) y += text('要確認　' + issue, 0, y + 5, inner, 10) + 5;
    const fit = Math.min(1, (height - 2 * margin) / y);
    ctx.scale(canvas.width / width, canvas.height / height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.translate(margin, margin);
    ctx.scale(fit, fit);
    commands.forEach(draw => draw());
    const jpeg = await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(Error('PDF用の明細画像を作成できませんでした')), 'image/jpeg', 0.96));
    return new File(pdfBytes(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height),
      data.stem + '.pdf', {type:'application/pdf'});
  }

  async function archive(files, stem) {
    const zip = new JSZip();
    for (const file of files) zip.file(file.name, await file.arrayBuffer());
    const bytes = await zip.generateAsync({type:'uint8array'});
    return new File([bytes], stem + '.zip', {type:'application/zip'});
  }

  function photo(slot, stem) {
    const original = slot.image.originalData;
    if (!original) return ExchangeCore.file(slot.image.data, stem + '.jpg');
    const match = /^data:(image\/[a-z0-9.+-]+|application\/octet-stream)?;base64,([A-Za-z0-9+/=]+)$/i.exec(original);
    if (!match) throw Error('登録済みの原本写真を読み込めません');
    const ext = /\.([a-z0-9]{1,8})$/i.exec(slot.image.originalName || slot.image.name)?.[1];
    const mime = match[1] || 'application/octet-stream';
    const standardExt = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic','image/heif':'heif','image/avif':'avif'};
    return new File([Uint8Array.from(atob(match[2]), char => char.charCodeAt(0))],
      stem + '.' + (standardExt[mime] || ext || 'img'), {type:mime});
  }

  return {model, workbook, pdf, archive, photo, filePart};
})();
