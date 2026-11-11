'use strict';
let pairFiles=[],pairContext='';
function pairKey(){return employee().id+':'+salaryMonth()}
function selectedPair(){const p=PeriodCore.period(salaryMonth()),refs=state.photoSets?.[pairKey()]||{};return ['first','second'].map(half=>{const month=half==='first'?p.month:p.previous,ref=refs[half],image=ref&&ref.month===month?state.months[employee().id+':'+month]?.images?.find(i=>i.id===ref.id):null;return {half,month,image}})}
function renderPair(){if(!state)return;try{const p=PeriodCore.period(salaryMonth());pairFiles=[];pairContext=pairKey();$('#pairPeriod').textContent=`${employee().name} / ${p.start}〜${p.end}。前月の後半＋当月の前半を合算します。印刷の区分より実際の日付を優先してください。`;for(const slot of selectedPair()){const el=$('#pair-'+slot.half),im=slot.image;el.querySelector('small').textContent=slot.month;el.querySelector('.pair-preview').innerHTML=im?`<img src="${esc(im.data)}" alt="${slot.half==='first'?'前半':'後半'}の選択写真"><p>写真を選択済み</p>`:'<p>未選択（1枚でも解析できます）</p>';const sel=el.querySelector('select'),images=state.months[employee().id+':'+slot.month]?.images||[];sel.innerHTML='<option value="">選択なし</option>'+images.map(i=>`<option value="${i.id}">${esc(i.name)}</option>`).join('');sel.value=im?.id||'';if(im)pairFiles.push(ExchangeCore.file(im.data,`TIME-LAB-${slot.month}-${slot.half}.jpg`))}$('#sharePair').disabled=!pairFiles.length;$('#pairPrompt').value=TableCore.prompt(salaryMonth());$('#pairManualImages').innerHTML=selectedPair().filter(s=>s.image).map(s=>`<div><p>${s.month} ${s.half==='first'?'前半':'後半'}</p><img alt="手動添付用の写真" src="${esc(s.image.data)}" style="max-width:100%;height:auto"><button class="secondary" data-save-pair="${s.half}">この写真を保存</button></div>`).join('')}catch(e){$('#pairStatus').textContent=e.message}}
function showPairManual(message){$('#pairManual').open=true;$('#pairStatus').textContent=message;$('#pairPrompt').value=TableCore.prompt(salaryMonth())}
$('#sharePair').onclick=async()=>{try{if(pairContext!==pairKey()||!pairFiles.length)throw Error('対象の写真を選び直してください');const payload={files:pairFiles,text:TableCore.prompt(salaryMonth()),title:'TIME LAB タイムカード解析'};if(!navigator.share||!navigator.canShare?.({files:pairFiles})){showPairManual('この環境は写真共有に対応していません。下の依頼文をコピーし、保存した写真をChatGPTの＋から添付してください。');return}await navigator.share(payload);showPairManual('共有操作が終了しました。ChatGPTに写真が'+pairFiles.length+'枚添付されたか確認してください。写真や依頼文がなければ下の手順で手動添付します。アプリから受信成功は確認できません。')}catch(e){if(e.name!=='AbortError')showPairManual('共有できません: '+e.message+'。下の手動添付を使ってください。');else $('#pairStatus').textContent='共有をキャンセルしました'}};
$('#copyPairPrompt').onclick=async()=>{const text=TableCore.prompt(salaryMonth());$('#pairPrompt').value=text;try{await navigator.clipboard.writeText(text);$('#pairStatus').textContent='依頼文をコピーしました。ChatGPTの＋から写真を添付し、写真のサムネイルを確認して依頼文を貼り付けます。'}catch{$('#pairStatus').textContent='下の依頼文を長押ししてコピーしてください'}};
$('#pairManualImages').onclick=ev=>{const half=ev.target.dataset.savePair;if(!half)return;try{const slot=selectedPair().find(s=>s.half===half),file=ExchangeCore.file(slot.image.data,`TIME-LAB-${slot.month}-${half}.jpg`);download(file.name,file,file.type);$('#pairStatus').textContent='写真の保存を開始しました。保存先を確認し、ChatGPTの＋から写真/ファイルを添付してください。'}catch(e){$('#pairStatus').textContent=e.message}};
document.querySelectorAll('[data-pair]').forEach(input => input.onchange = async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const id = employee().id, target = salaryMonth(), half = input.dataset.pair;
  const p = PeriodCore.period(target), month = half === 'first' ? p.month : p.previous;
  const context = id + ':' + target;
  try {
    $('#sharePair').disabled = true;
    const [data, originalData] = await Promise.all([readFile(file), readOriginalPhoto(file)]);
    const hash = await fingerprint(data);
    if (pairKey() !== context) throw Error('従業員または給与対象月が変わりました。写真を選び直してください');
    const md = state.months[id+':'+month] ||= {rows:{}, images:[], settings:{mode:employee().mode, rate:employee().rate}};
    let image = md.images.find(i => i.hash === hash);
    if (!image) {
      image = {id:uid(), data, hash, name:file.name, half, applied:false};
      md.images.push(image);
    }
    if (!image.originalData) {
      image.originalData = originalData;
      image.originalName = file.name;
    }
    ((state.photoSets ||= {})[context] ||= {})[half] = {month, id:image.id};
    await save();
    if (pairKey() !== context) return;
    render();
    $('#pairStatus').textContent = '写真を端末内に登録しました。氏名・年月と写真の対応を確認してください。';
  } catch (error) {
    $('#pairStatus').textContent = error.message;
    renderPair();
  } finally {
    input.value = '';
  }
});
document.querySelectorAll('[data-pair-existing]').forEach(sel=>sel.onchange=async()=>{const half=sel.dataset.pairExisting,p=PeriodCore.period(salaryMonth()),month=half==='first'?p.month:p.previous;((state.photoSets||={})[pairKey()]||={})[half]=sel.value?{month,id:sel.value}:null;await save();renderPair()});
const tableRender=render;render=function(){tableRender();renderPair()};$('#salaryMonth').addEventListener('change',renderPair);if(state)renderPair();
// All entry points now request the same Japanese table. Legacy JSON import stays available in Details.
ExchangeCore.prompt=()=>TableCore.prompt(salaryMonth());PeriodCore.prompt=()=>TableCore.prompt(salaryMonth());ImportCore.prompt=()=>TableCore.prompt(salaryMonth());
