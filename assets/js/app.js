/* ===== Bundled by Splitter (local app code) ===== */
'use strict';

/* ================== إعدادات عامة وأدوات ================== */
const LS_KEY = 'math_questions_v1';
const VERSION_TAG = 'v8-final';               // تأكد من رقم الإصدار
const BASE_NAME   = 'math_questions';
const DATE_TAG = () => {
  const d = new Date(), pad = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

function dlName(ext, extra=''){ return `${BASE_NAME}_${VERSION_TAG}${extra?`_${extra}`:''}_${DATE_TAG()}.${ext}`; }
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=> URL.revokeObjectURL(url), 0);
}

function uid(){ return 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
function $(id){ return document.getElementById(id); }
function stripHtml(html){ const tmp=document.createElement('div'); tmp.innerHTML=html||''; return tmp.textContent || tmp.innerText || ''; }
function arabicDigits(n){ return String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]); }
const sanitizeConfig = {
  ALLOWED_TAGS: [
    'p','b','i','u','s','br','span','strong','em',
    'ul','ol','li','blockquote','code','sub','sup',
    'a','h1','h2','h3','h4'
  ],
  ALLOWED_ATTR: [
    'class','data-value',
    'href','target','rel',
    'style' // ← مهم للألوان والتظليل
  ]
};

const sanitizeHTML = (html)=> DOMPurify.sanitize(html||'', sanitizeConfig);

function showNotification(message, type='success'){
  const n=$('notification'), t=$('notificationText'), ic=n?.querySelector('i');
  if(!n||!t){ try{ alert(message); }catch(_){ } return; }
  t.textContent = message;
  n.className = 'notification show';
  if(type==='error'){ n.classList.add('error'); ic && (ic.className='fas fa-exclamation-circle'); }
  else if(type==='warning'){ n.classList.add('warning'); ic && (ic.className='fas fa-exclamation-triangle'); }
  else { n.classList.add('success'); ic && (ic.className='fas fa-check-circle'); }
  setTimeout(()=> n.className='notification', 3000);
  persistNow();
}

/* ================== Issue Management (canonical) ================== */
function issueKey(it){
  return `${it.qi}|${it.part}|${it.type}|${it.oi ?? -1}`;
}

function computeIssues(){
  const list = [];

  state.questions.forEach((q, qi) => {
    // صور خارجية (غير Base64) = مشكلة
    if (q?.reading?.image && QUTIL.isExternalImage(q.reading.image))
      list.push({ qi, part:'reading',  type:'external-image', message:'صورة النص غير مضمّنة' });
    if (q?.question?.image && QUTIL.isExternalImage(q.question.image))
      list.push({ qi, part:'question', type:'external-image', message:'صورة السؤال غير مضمّنة' });

    (q?.options || []).forEach((o, oi) => {
      if (o?.image && QUTIL.isExternalImage(o.image))
        list.push({ qi, part:'option', oi, type:'external-image', message:`صورة خيار ${oi+1} غير مضمّنة` });

      // كل خيار لازم (نص أو صورة)
      if (!QUTIL.hasAnyContent(o))
        list.push({ qi, part:'option', oi, type:'empty-content', message:`الخيار ${oi+1} بلا نص أو صورة` });
    });

    // السؤال إلزامي: (نص أو صورة)
    if (!QUTIL.hasAnyContent(q?.question))
      list.push({ qi, part:'question', type:'empty-content', message:'السؤال يحتاج نصًا أو صورة' });

    // يجب وجود خيارين على الأقل
    if (!Array.isArray(q?.options) || q.options.length < 2)
      list.push({ qi, part:'options', type:'too-few', message:'ينبغي وجود خيارين على الأقل' });
  });

  // احترم التجاوزات
  issues = list.filter(it => !dismissedIssues.has(issueKey(it)));
}

function applyIssueToolbar(){
  const toolbar = $('issueToolbar');
  const count = $('issueCount');
  if (!toolbar || !count) return;
  if (issues.length > 0) {
    toolbar.style.display = 'flex';
    count.textContent = `${issues.length} مشاكل`;
  } else {
    toolbar.style.display = 'none';
  }
}

function highlightIssuesInEditors(){
  // امسح تظليلات سابقة
  document.querySelectorAll('.issue-highlight').forEach(el=>{
    el.classList.remove('issue-highlight');
    el.removeAttribute('data-issue');
  });

  const qi = state.currentQuestionIndex;
  issues.filter(it => it.qi === qi).forEach(it => {
    let target = null;

    if (it.type === 'external-image'){
      if (it.part === 'reading')      target = $('readingDropZone');
      else if (it.part === 'question') target = $('questionDropZone');
      else if (it.part === 'option')   target = $(`optionDropZone${it.oi}`);
    } else if (it.type === 'empty-content'){
      if (it.part === 'question')      target = questionEditor?.root;
      else if (it.part === 'option')   target = optionEditors[it.oi]?.root;
    } else if (it.type === 'too-few'){
      target = $('optionsContainer');
    }

    if (target){
      target.classList.add('issue-highlight');
      target.setAttribute('data-issue', it.message);
      setTimeout(()=>{
        target.classList.add('issue-pulse');
        setTimeout(()=> target.classList.remove('issue-pulse'), 1200);
      }, 100);
    }
  });
}

function gotoIssue(idx){
  if (!issues.length) return;
  issueCursor = ((idx % issues.length) + issues.length) % issues.length;
  const it = issues[issueCursor];

  // انتقل للسؤال المعني
  if (state.currentQuestionIndex !== it.qi){
    state.currentQuestionIndex = it.qi;
    renderSidebar();
    renderQuestion();
    scrollToQuestionStart();
  }

  // مرّر إلى الهدف بعد الرندر
  setTimeout(()=>{
    highlightIssuesInEditors();
    let el = null;
    if (it.type === 'external-image'){
      if (it.part === 'reading')      el = $('readingDropZone');
      else if (it.part === 'question') el = $('questionDropZone');
      else if (it.part === 'option')   el = $(`optionDropZone${it.oi}`);
    } else if (it.type === 'empty-content'){
      if (it.part === 'question'){ el = questionEditor?.root; questionEditor?.focus(); }
      else if (it.part === 'option'){ el = optionEditors[it.oi]?.root; optionEditors[it.oi]?.focus(); }
    } else if (it.type === 'too-few'){
      el = $('optionsContainer');
    }
    if (el) el.scrollIntoView({ behavior:'smooth', block:'center' });
  }, 80);
}

function dismissCurrentIssue(){
  if (!issues.length){ showNotification('لا مشاكل حالياً 🎉','success'); return; }
  const it = issues[issueCursor];
  dismissedIssues.add( issueKey(it) );
  refreshIssuesUI();
  if (issues.length) gotoIssue(issueCursor);
  else { applyIssueToolbar(); showNotification('تم تجاوز كل المشاكل الحالية','success'); }
}

function clearDismissedIssues(){
  dismissedIssues.clear();
  refreshIssuesUI();
  showNotification('تم إظهار جميع المشاكل المُتجاوَزة','success');
}

function refreshIssuesUI(){
  computeIssues();
  applyIssueToolbar();
  highlightIssuesInEditors();
  renderSidebar();
}
// === [واحد فقط] أدوات فحص المحتوى والصور ===
window.QUTIL = window.QUTIL || (() => {
  // يعتبر الـ HTML "فارغًا" إلا إذا احتوى معادلة Quill (ql-formula)
  function isBlankHtml(html){
    const s = String(html || '');
    if (/<span[^>]+class=["'][^"']*ql-formula[^"']*["'][^>]*>/i.test(s)) return false;
    return stripHtml(s).trim() === '';
  }

  // جزء السؤال/الخيار يعتبر فيه محتوى إذا كان فيه نص (غير فارغ) أو صورة
  function hasAnyContent(part){
    if (!part) return false;
    const hasText = !isBlankHtml(part.text);
    const hasImg  = !!part.image;
    return hasText || hasImg;
  }

  // هل الصورة data:image (مضمّنة)
  function isDataImage(src){
    return typeof src === 'string' && /^data:image\//i.test(src || '');
  }

  // أي صورة ليست base64
  function isExternalImage(src){
    return typeof src === 'string' && !!src && !/^data:image\//i.test(src);
  }

  // أعِد كائن الأدوات
  return { isBlankHtml, hasAnyContent, isDataImage, isExternalImage };
})();

// جسور اختيارية لأسماء عالمية (خارج QUTIL)
if (typeof window.isDataImage     !== 'function') window.isDataImage     = window.QUTIL.isDataImage;
if (typeof window.isExternalImage !== 'function') window.isExternalImage = window.QUTIL.isExternalImage;

// هذه الدوال عامّة ويجب أن تكون خارج QUTIL
function showBusy(text='جارٍ المعالجة...'){ const o=$('busyOverlay'), t=$('busyText'); if(!o) return; if(t) t.textContent=text; o.classList.add('show'); document.body.classList.add('modal-open'); }
function hideBusy(){ const o=$('busyOverlay'); if(!o) return; o.classList.remove('show'); document.body.classList.remove('modal-open'); }
function setBtnBusy(btn, text='جارٍ التنفيذ...'){
  if(!btn) return ()=>{};
  const prevHTML=btn.innerHTML, prevDisabled=btn.disabled;
  btn.disabled=true; btn.setAttribute('aria-busy','true');
  btn.innerHTML=`<span class="btn-spin" aria-hidden="true"></span>${text}`;
  return ()=>{ btn.disabled=prevDisabled; btn.removeAttribute('aria-busy'); btn.innerHTML=prevHTML; };
}
async function runAction(btnId, busyLabel, overlayText, fn){
  const btn=$(btnId); if(btn?.getAttribute('aria-busy')==='true') return;
  const restore=setBtnBusy(btn, busyLabel); const timer=setTimeout(()=> showBusy(overlayText), 250);
  try{ await fn(); }catch(err){ console.error(err); showNotification(String(err?.message||err),'error'); }
  finally{ clearTimeout(timer); hideBusy(); restore(); }
}
function setLastSaved(note=''){
  const stamp = new Date().toISOString();
  localStorage.setItem('last_saved_stamp', stamp);
  localStorage.setItem('last_saved_note', note);
  const pill=$('lastSavedPill');
  if(pill){
    const t = new Date(stamp).toLocaleString('ar-SA',{hour12:false});
    pill.textContent = `آخر حفظ: ${t}${note?` — ${note}`:''}`;
  }
}
function restoreLastSaved(){
  const stamp = localStorage.getItem('last_saved_stamp');
  const note  = localStorage.getItem('last_saved_note') || '';
  const pill  = $('lastSavedPill');
  if(pill){
    if(stamp){
      const t = new Date(stamp).toLocaleString('ar-SA',{hour12:false});
      pill.textContent = `آخر حفظ: ${t}${note?` — ${note}`:''}`;
    }else{
      pill.textContent = 'آخر حفظ: —';
    }
  }
}
// ===== نهاية التصحيح للكتلة =====

const state = {
  questions:[{
    reading:{ text:"<p>اقرأ ثم أجب: مساحة المربع <span class='ql-formula' data-value='A=a^2'></span>.</p>", image:null },
    question:{ text:"<p>إذا كان طول الضلع <span class='ql-formula' data-value='5'></span> سم، فما المساحة؟</p>", image:null },
    options:[
      {id:uid(), text:"<p><span class='ql-formula' data-value='10'></span> سم<sup>2</sup></p>", image:null},
      {id:uid(), text:"<p><span class='ql-formula' data-value='20'></span> سم<sup>2</sup></p>", image:null},
      {id:uid(), text:"<p><span class='ql-formula' data-value='25'></span> سم<sup>2</sup></p>", image:null},
      {id:uid(), text:"<p><span class='ql-formula' data-value='30'></span> سم<sup>2</sup></p>", image:null}
    ],
    correct:2
  }],
  currentQuestionIndex:0
};
let dirty=false;

// ===== حراس التحديث/الاستيراد =====
let muteSaves   = 0;       // عدّاد إسكات الحفظ أثناء التحديثات البرمجية

function mute(fn){
  muteSaves++;
  try { return fn(); }
  finally { muteSaves--; }
}
async function muteAsync(fn){
  muteSaves++;
  try { return await fn(); }
  finally { muteSaves--; }
}

// إضافة متغيرات لإدارة المشاكل
let issues = [];
let issueCursor = 0;
let dismissedIssues = new Set();
let issuesFirstFlag = false;
let pendingImport = null;

function readAndCompressImage(fileOrBlob, maxW=1400, maxH=1400, quality=0.85){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const ratio=Math.min(maxW/img.width, maxH/img.height, 1);
        const canvas=document.createElement('canvas');
        canvas.width=Math.round(img.width*ratio); canvas.height=Math.round(img.height*ratio);
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        const isPNG=(fileOrBlob.type||'').toLowerCase().includes('png');
        const outType=isPNG?'image/png':'image/jpeg';
        resolve(canvas.toDataURL(outType, isPNG?undefined:quality));
      };
      img.onerror=reject; img.src=reader.result;
    };
    reader.onerror=reject; reader.readAsDataURL(fileOrBlob);
  });
}

// فقط data:image تُعاد تحجيمها. الروابط الخارجية تُتجاهل (null) لتفادي Tainted canvas
function scaleDataUrlToBox(dataUrl, maxW, maxH, quality=0.9){
  return new Promise((resolve)=>{
    if(!dataUrl) return resolve(null);
    if(!isDataImage(dataUrl)) return resolve(null);
    const img=new Image();
    img.onload=()=>{
      const ratio=Math.min(maxW/img.width,maxH/img.height,1);
      const w=Math.round(img.width*ratio), h=Math.round(img.height*ratio);
      const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,w,h);
      const outType = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(outType, outType==='image/png'?undefined:quality));
    };
    img.onerror=()=> resolve(null);
    img.src=dataUrl;
  });
}

const SIZING = {
  json:   { reading:{w:1000,h:700}, question:{w:1000,h:700}, option:{w:500,h:360} },
  word:   { reading:{w:500,h:350},  question:{w:500,h:350},  option:{w:250,h:180} }
};
async function processImagesForExport(questions, profileKey){
  const prof=SIZING[profileKey] || SIZING.json;
  const clone=JSON.parse(JSON.stringify(questions));
  for(const q of clone){
    if(q.reading?.image)  q.reading.image  = await scaleDataUrlToBox(q.reading.image,  prof.reading.w,  prof.reading.h);
    if(q.question?.image) q.question.image = await scaleDataUrlToBox(q.question.image, prof.question.w, prof.question.h);
    if(Array.isArray(q.options)){
      for(const o of q.options){ if(o.image) o.image = await scaleDataUrlToBox(o.image, prof.option.w, prof.option.h); }
    }
  }
  return clone;
}

/* ================== معاينات الصور ================== */
function updateImagePreview(previewId, removeBtnSelector, imageData){
  const preview=$(previewId), removeBtn=document.querySelector(removeBtnSelector);
  if(imageData){ preview.src=imageData; preview.style.display='block'; removeBtn && (removeBtn.style.display='block'); }
  else{ preview.style.display='none'; preview.removeAttribute('src'); removeBtn && (removeBtn.style.display='none'); }
}
function updateImageInState(previewId, removeBtnSelector, imageData, property, index=null){
  const q=state.questions[state.currentQuestionIndex];
  if(property==='reading') q.reading.image=imageData;
  else if(property==='question') q.question.image=imageData;
  else if(property==='option' && index!==null) q.options[index].image=imageData;
  updateImagePreview(previewId, removeBtnSelector, imageData);
  dirty=true; showNotification('تم إضافة/تحديث الصورة','success');
  refreshIssuesUI();
  persistNow();
}
async function uploadImage(inputId, previewId, removeBtnSelector, property, index=null){
  const input=$(inputId); const file=input.files[0];
  if(!file || !file.type.match('image.*')){ showNotification('الرجاء اختيار ملف صورة صالح','error'); return; }
  try{ const imageData=await readAndCompressImage(file); updateImageInState(previewId, removeBtnSelector, imageData, property, index); }
  catch{ showNotification('تعذر قراءة الصورة','error'); }
}
async function pasteImage(previewId, removeBtnSelector, index, property){
  if(navigator.clipboard && navigator.clipboard.read){
    try{
      const items=await navigator.clipboard.read();
      for(const it of items){ for(const type of it.types){
        if(type.startsWith('image/')){ const blob=await it.getType(type); const data=await readAndCompressImage(blob);
          updateImageInState(previewId, removeBtnSelector, data, property, index); return; }
      }}
      showNotification('لم يتم العثور على صورة في الحافظة','error'); return;
    }catch{}
  }
  showNotification('اضغط الآن Ctrl+V للصق الصورة...','warning');
  const handler=async(e)=>{
    const items=(e.clipboardData&&e.clipboardData.items)?e.clipboardData.items:[];
    for(const it of items){ if(it.type && it.type.startsWith('image/')){ const blob=it.getAsFile(); if(blob){
      const data=await readAndCompressImage(blob); updateImageInState(previewId, removeBtnSelector, data, property, index); e.preventDefault(); return; } } }
    showNotification('لم يتم العثور على صورة في الحافظة','error');
  };
  document.addEventListener('paste', handler, { once:true });
}
function bindDropZone(zoneEl, onFile){
  zoneEl.addEventListener('dragover',(e)=>{ e.preventDefault(); zoneEl.classList.add('drop-over'); });
  zoneEl.addEventListener('dragleave',()=> zoneEl.classList.remove('drop-over'));
  zoneEl.addEventListener('drop',async(e)=>{ e.preventDefault(); zoneEl.classList.remove('drop-over');
    const file=e.dataTransfer?.files?.[0]; if(!file || !file.type.match('image.*')){ showNotification('أسقط صورة فقط من فضلك','error'); return; } await onFile(file);
  });
}

/* ================== Quill ================== */
const quillOptions = {
  theme: 'snow',
  modules: {
    formula: true,
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      [{ font: [] }],
      [{ size: ['small', false, 'large', 'huge'] }],

      // تنسيقات أساسية
      ['bold', 'italic', 'underline', 'strike'],

      // لون الخط + لون الخلفية (هايلايت)
      [{ color: [] }, { background: [] }],

      // أسفُل/أعلَى
      [{ script: 'sub' }, { script: 'super' }],

      // قوائم وتهميش (مسافة بادئة)
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ indent: '-1' }, { indent: '+1' }],

      // محاذاة + كوت/كود + رابط
      [{ align: [] }],
      ['blockquote', 'code-block'],
      ['link'],

      // تنظيف + معادلة
      ['clean', 'formula']
    ]
  }
};

// نفس quillOptions لكن مع Placeholder مخصص
const withPlaceholder = (ph) => Object.assign({}, quillOptions, { placeholder: ph });

// كان: new Quill("#readingTextEditor", quillOptions)
const readingEditor  = new Quill("#readingTextEditor",  withPlaceholder("اكتب النص القرائي هنا…"));
// كان: new Quill("#questionTextEditor", quillOptions)
const questionEditor = new Quill("#questionTextEditor", withPlaceholder("اكتب نص السؤال هنا…"));

const optionEditors=[];

function centerFormulaTooltipOf(container){
  const tip=container?.querySelector('.ql-tooltip'); if(!tip) return;
  tip.style.left='50%'; tip.style.right='auto'; tip.style.transform='translateX(-50%)'; tip.style.top='16px'; tip.style.zIndex='10000';
}
function openFormulaTooltip(quill){
  if(!quill || !document.body.contains(quill.root)) return;
  if(!quill.getSelection()){ quill.focus(); quill.setSelection(quill.getLength(),0,'silent'); } else quill.focus();
  requestAnimationFrame(()=>{
    const toolbar=quill.getModule('toolbar'); const btn=toolbar?.container?.querySelector('button.ql-formula'); if(!btn) return;
    btn.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    const host=quill.root.closest('.text-editor'); (function waitOpen(){
      const tip=host?.querySelector('.ql-tooltip'); if(tip && tip.classList.contains('ql-editing')){ centerFormulaTooltipOf(host); }
      else { requestAnimationFrame(waitOpen); }
    })();
  });
}
function insertBlockFormulaViaTooltip(quill){
  if(!quill || !document.body.contains(quill.root)) return;
  let sel=quill.getSelection(); if(!sel){ quill.focus(); sel=quill.getSelection(true); }
  const index=(sel?.index ?? quill.getLength());
  quill.insertText(index,'\n','user'); quill.setSelection(index+1,0,'silent');
  openFormulaTooltip(quill);
  setTimeout(()=>{
    const host=quill.root.closest('.text-editor'); const tip=host?.querySelector('.ql-tooltip'); const save=tip?.querySelector('.ql-action');
    if(!save) return;
    const once=()=>{ requestAnimationFrame(()=>{
      if(!document.body.contains(quill.root)) return;
      const cur=quill.getSelection() || { index:index+1, length:0 };
      quill.insertText(cur.index+1,'\n','user');
    }); save.removeEventListener('click', once); };
    save.addEventListener('click', once);
  },0);
}
let activeEditor=null;
function watchFocus(ed){ if(!ed) return; ed.on('selection-change', r=>{ if(r) activeEditor=ed; }); }
watchFocus(readingEditor); watchFocus(questionEditor);

/* ================== UI أساسية ================== */
function pasteHTML(editor, html){
  try{
    editor.setSelection(0,0,'silent');
    editor.deleteText(0, editor.getLength(), 'silent');
    editor.clipboard.dangerouslyPasteHTML(0, sanitizeHTML(html||''));
  }catch(_){
    editor.root.innerHTML = sanitizeHTML(html||'');
  }
}
function ensureOptionIds(){ state.questions.forEach(q=> q.options.forEach(o=>{ if(!o.id) o.id=uid(); })); }

function scrollToQuestionStart(){
  const anchor = document.querySelector('.editor-container .section');
  if(!anchor) return;
  const headerH = (document.querySelector('header')?.offsetHeight || 0) + 12;
  const top = anchor.getBoundingClientRect().top + window.pageYOffset - headerH;
  window.scrollTo({ top, behavior: 'smooth' });
  try { if (window.readingEditor) { readingEditor.focus(); readingEditor.setSelection(0, 0); } } catch(_) {}
}

function renderSidebar(){
  const list=$('qList'); list.innerHTML='';
  
  const n = state.questions.length;
  const order = Array.from({length:n}, (_,i)=> i);
  
  const qsWithIssues = new Set(issues.map(x=> x.qi));
  if (issuesFirstFlag && qsWithIssues.size){
    order.sort((a,b)=>{
      const A = qsWithIssues.has(a) ? 0 : 1;
      const B = qsWithIssues.has(b) ? 0 : 1;
      return (A - B) || (a - b);
    });
  }

  order.forEach(i=>{
    const q=state.questions[i];
    const li=document.createElement('div');
    const isActive = i===state.currentQuestionIndex;
    const hasIssue = qsWithIssues.has(i);
    li.className='q-item'+(isActive?' active':'')+(hasIssue?' has-issue':'');
    li.dataset.index=i;
    
    const titleTxt='س'+(i+1);
    const subTxt=(stripHtml(q.question.text)||stripHtml(q.reading.text)||'').slice(0,45);
    
    li.innerHTML=`
      <span class="drag-handle">☰</span>
      <div class="q-item-info">
        <div class="q-item-title">${titleTxt}${hasIssue?'<span class="issue-sidebar-dot" title="يوجد مشكلة"></span>':''}</div>
        <div class="q-item-sub" title="${stripHtml(q.question.text)}">${subTxt || 'بدون عنوان'}</div>
      </div>
      <div class="q-item-actions">
        <button class="btn btn-danger btn-sm del-q" title="حذف"><i class="fas fa-trash"></i></button>
      </div>`;
    
    li.addEventListener('click',(e)=>{ if(e.target.closest('.del-q')) return;
      saveCurrentQuestion(); state.currentQuestionIndex=i; renderSidebar(); renderQuestion();
      scrollToQuestionStart();
      highlightIssuesInEditors();
      applyIssueToolbar();
    });
    
    li.querySelector('.del-q').addEventListener('click',(e)=>{ e.stopPropagation(); deleteCurrentQuestion(i); });

    // سحب/إفلات
    li.draggable=false;
    const handle=li.querySelector('.drag-handle');
    const enableDrag=()=> li.draggable=true;
    const disableDrag=()=> li.draggable=false;
    if(handle){
      handle.addEventListener('mousedown',enableDrag);
      handle.addEventListener('mouseup',disableDrag);
      handle.addEventListener('mouseleave',disableDrag);
      handle.addEventListener('touchstart',enableDrag,{passive:true});
      handle.addEventListener('touchend',disableDrag,{passive:true});
      handle.addEventListener('touchcancel',disableDrag,{passive:true});
    }
    
    let draggedQIndex=null;
    li.addEventListener('dragstart',(e)=>{ if(!li.draggable){ e.preventDefault(); return; } draggedQIndex=i; li.classList.add('dragging'); if(e.dataTransfer){ e.dataTransfer.effectAllowed='move'; try{ e.dataTransfer.setData('text/plain', String(i)); }catch(_){ } }});
    li.addEventListener('dragend',()=>{ li.classList.remove('dragging'); disableDrag(); });
    li.addEventListener('dragover',(e)=>{ e.preventDefault(); li.classList.add('drag-over'); if(e.dataTransfer) e.dataTransfer.dropEffect='move'; });
    li.addEventListener('dragleave',()=> li.classList.remove('drag-over'));
    li.addEventListener('drop',(e)=>{ e.preventDefault(); li.classList.remove('drag-over'); const from=parseInt(e.dataTransfer.getData('text/plain'),10); const to=i; if(!Number.isFinite(from)||from===to) return; reorderQuestions(from,to); });
    
    list.appendChild(li);
  });

  ['mouseup','touchend','touchcancel'].forEach(evt=>{
    document.addEventListener(evt,()=>{ document.querySelectorAll('.q-item').forEach(el=> el.draggable=false); }, {passive:true});
  });
}

function renderQuestion() {
  // تحقق من وجود السؤال الحالي
  if (!state.questions[state.currentQuestionIndex]) {
    // إذا لم يكن هناك سؤال، استخدم سؤال افتراضي
    state.questions[state.currentQuestionIndex] = makeDefaultQuestion();
  }
  
  const q = state.questions[state.currentQuestionIndex];

  // كل ما يغيّر المحررات اجعله داخل mute حتى لا يطلق حفظًا
  mute(() => {
    pasteHTML(readingEditor,  q.reading?.text  || '');
    pasteHTML(questionEditor, q.question?.text || '');

    updateImagePreview('readingImagePreview',  '#readingRemoveBtn',  q.reading?.image  || null);
    updateImagePreview('questionImagePreview', '#questionRemoveBtn', q.question?.image || null);
  });

  renderOptions();      // ستُسكت داخليًا عند إنشاء محررات الخيارات
  updateCorrectOptions();
}

function reorderQuestions(from,to){
  const moving=state.questions.splice(from,1)[0];
  state.questions.splice(to,0,moving);
  if(state.currentQuestionIndex===from) state.currentQuestionIndex=to;
  else if(state.currentQuestionIndex>from && state.currentQuestionIndex<=to) state.currentQuestionIndex--;
  else if(state.currentQuestionIndex<from && state.currentQuestionIndex>=to) state.currentQuestionIndex++;
  renderSidebar(); renderQuestion();
  refreshIssuesUI();
  dirty=true; showNotification('تم إعادة ترتيب الأسئلة','success');
  persistNow();
}

let dragAllowed=false;
function renderOptions(){
  const wrap = $('optionsContainer');
  wrap.innerHTML = '';
  optionEditors.length = 0;

  const q = state.questions[state.currentQuestionIndex];

  q.options.forEach((opt, index) => {
    const isCorrect = index === q.correct;

    const el = document.createElement('div');
    el.className = 'option-item ' + (isCorrect ? 'correct' : '');
    el.setAttribute('draggable','true');
    el.dataset.id = opt.id;

    el.innerHTML = `
      <div class="option-header">
        <div class="option-title">
          <span class="opt-drag-handle">☰</span>
          الخيار ${index+1} ${isCorrect?'<span style="color:#28a745">(إجابة صحيحة)</span>':''}
        </div>
        <button class="btn btn-danger del-opt" data-index="${index}">
          <i class="fas fa-trash"></i> حذف
        </button>
      </div>

      <div class="math-toolbar" style="margin-top:-4px">
        <button class="math-chip" data-math-inline="${index}">معادلة سطرية</button>
        <button class="math-chip" data-math-block="${index}">معادلة عرضية</button>
      </div>

      <div class="editor-row">
        <div class="editor-col">
          <label class="editor-label">النص:</label>
          <div id="optionEditor${index}" class="text-editor"></div>
        </div>
        <div class="editor-col">
          <label class="editor-label">الصورة:</label>
          <div class="image-upload">
            <div class="image-preview-container" id="optionDropZone${index}">
              <img id="optionImagePreview${index}" class="image-preview" alt="معاينة الصورة">
              <button class="delete-image-btn option-remove" data-index="${index}" style="display:none">
                <i class="fas fa-trash"></i> حذف الصورة
              </button>
            </div>
            <div class="image-actions">
              <button class="btn opt-upload" data-index="${index}"><i class="fas fa-upload"></i> تحميل صورة</button>
              <button class="btn opt-paste"  data-index="${index}"><i class="fas fa-paste"></i> لصق صورة</button>
            </div>
          </div>
        </div>
      </div>`;

    wrap.appendChild(el);

    // إنشاء محرر الخيار + تعبئته داخل mute
const editor = new Quill(
  `#optionEditor${index}`,
  withPlaceholder(`نص الخيار ${index + 1}…`)
);
    mute(() => pasteHTML(editor, opt.text || ''));
    optionEditors[index] = editor;
    watchFocus(editor);
    editor.on('text-change', saveCurrentQuestion);

    // الصور + السحب… (لا تحتاج mute)
    updateImagePreview(`optionImagePreview${index}`, `button.option-remove[data-index="${index}"]`, opt.image || null);
    bindDropZone($(`optionDropZone${index}`), async (file) => {
      const data = await readAndCompressImage(file);
      updateImageInState(`optionImagePreview${index}`, `button.option-remove[data-index="${index}"]`, data, 'option', index);
    });

    el.querySelector(`[data-math-inline="${index}"]`).addEventListener('click', () => openFormulaTooltip(editor));
    el.querySelector(`[data-math-block="${index}"]`).addEventListener('click',  () => insertBlockFormulaViaTooltip(editor));
  });

  // أزرار حذف/رفع/لصق الخيارات كما هي (لا تغييرات)
  document.querySelectorAll('.del-opt').forEach((btn) => {
    btn.addEventListener('click', () => deleteOption(parseInt(btn.dataset.index)));
  });
  document.querySelectorAll('.opt-upload').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      let input = document.getElementById(`optionImageUpload${idx}`);
      if (!input){
        input = document.createElement('input');
        input.type = 'file';
        input.id   = `optionImageUpload${idx}`;
        input.accept = 'image/*';
        input.style.display = 'none';
        input.addEventListener('change', () =>
          uploadImage(`optionImageUpload${idx}`, `optionImagePreview${idx}`, `button.option-remove[data-index="${idx}"]`, 'option', idx)
        );
        document.body.appendChild(input);
      }
      input.click();
    });
  });
  document.querySelectorAll('.opt-paste').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      pasteImage(`optionImagePreview${idx}`, `button.option-remove[data-index="${idx}"]`, idx, 'option');
    });
  });
  document.querySelectorAll('.option-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      state.questions[state.currentQuestionIndex].options[idx].image = null;
      updateImagePreview(`optionImagePreview${idx}`, `button.option-remove[data-index="${idx}"]`, null);
      dirty = true;
      showNotification('تم حذف صورة الخيار','success');
      try { if (typeof refreshIssuesUI === 'function') refreshIssuesUI(); } catch(_){}
    });
  });
}


function reorderOptionsById(srcId,tgtId){
  const q=state.questions[state.currentQuestionIndex];
  const si=q.options.findIndex(o=>o.id===srcId), ti=q.options.findIndex(o=>o.id===tgtId);
  if(si<0||ti<0) return;
  const correctId=q.options[q.correct]?.id;
  const [moved]=q.options.splice(si,1); q.options.splice(ti,0,moved);
  q.correct=q.options.findIndex(o=>o.id===correctId); if(q.correct<0) q.correct=0;
  renderOptions(); updateCorrectOptions();
  dirty=true; showNotification('تم إعادة ترتيب الخيارات','success');
  refreshIssuesUI();
  persistNow();
}

function updateCorrectOptions(){
  const sel=$('correctOptionSelect'); sel.innerHTML='';
  const q=state.questions[state.currentQuestionIndex];
  q.options.forEach((_,i)=>{ const op=document.createElement('option'); op.value=i; op.textContent=`الخيار ${i+1}`; if(i===q.correct) op.selected=true; sel.appendChild(op); });
  sel.onchange=(e)=>{ q.correct=parseInt(e.target.value,10)||0; renderOptions(); dirty=true; showNotification('تم تحديث الإجابة الصحيحة','success'); refreshIssuesUI(); persistNow();
 };
  persistNow();
}

/* ================== CRUD أسئلة/خيارات ================== */
function makeDefaultQuestion() {
  return {
    reading:  { text: "", image: null },
    question: { text: "", image: null },
    options: [
      { id: uid(), text: "", image: null },
      { id: uid(), text: "", image: null },
      { id: uid(), text: "", image: null },
      { id: uid(), text: "", image: null },
    ],
    correct: 0,
  };
}

function duplicateCurrentQuestion() {
  // احفظ الحالية أولًا
  saveCurrentQuestion();

  const src = state.questions[state.currentQuestionIndex];
  const copy = JSON.parse(JSON.stringify(src));

  // IDs جديدة للخيارات حتى لا تتصادم عمليات السحب/الترتيب
  copy.options = copy.options.map(o => ({ ...o, id: uid() }));

  // تأمين correct ضمن المدى
  if (!Number.isFinite(copy.correct) || copy.correct < 0 || copy.correct >= copy.options.length) {
    copy.correct = 0;
  }

  // أدخل النسخة بعد السؤال الحالي
  state.questions.splice(state.currentQuestionIndex + 1, 0, copy);
  state.currentQuestionIndex++;

  // أعِد الرسم واحفظ
  renderSidebar();
  renderQuestion();
  refreshIssuesUI();
  dirty = true;
  persistNow("Duplicate");

  showNotification("تم تكرار السؤال الحالي", "success");
}

function addNewQuestion(){
  state.questions.splice(state.currentQuestionIndex+1,0, makeDefaultQuestion());
  state.currentQuestionIndex++;
  renderSidebar(); renderQuestion();
  refreshIssuesUI();
  dirty=true; showNotification('تم إضافة سؤال جديد','success');
  persistNow();
}

function deleteCurrentQuestion(atIndex=null){
  const idx=(atIndex===null)?state.currentQuestionIndex:atIndex;
  if(state.questions.length<=1){ showNotification('يجب أن يبقى سؤال واحد على الأقل','error'); return; }
  state.questions.splice(idx,1);
  if(state.currentQuestionIndex>=state.questions.length) state.currentQuestionIndex=state.questions.length-1;
  renderSidebar(); renderQuestion();
  refreshIssuesUI();
  dirty=true; showNotification('تم حذف السؤال','success');
  persistNow();
}

function addNewOption() {
  const q = state.questions[state.currentQuestionIndex];
  q.options.push({ id: uid(), text: "", image: null }); // كان "الخيار الجديد"
  renderOptions();
  updateCorrectOptions();
  dirty = true;
  showNotification("تم إضافة خيار جديد", "success");
  refreshIssuesUI();
  persistNow();
}


function deleteOption(index){
  const q=state.questions[state.currentQuestionIndex];
  if(q.options.length<=2){ showNotification('يجب أن يحتوي السؤال على خيارين على الأقل','error'); return; }
  const wasCorrectId=q.options[q.correct]?.id;
  q.options.splice(index,1);
  const newCorrectIndex=q.options.findIndex(o=>o.id===wasCorrectId);
  q.correct=newCorrectIndex>=0?newCorrectIndex:0;
  renderOptions(); updateCorrectOptions(); dirty=true; showNotification('تم حذف الخيار','success');
  refreshIssuesUI();
  persistNow();
}

function newProject(){
  state.questions=[ makeDefaultQuestion() ];
  state.currentQuestionIndex=0;
  renderSidebar(); renderQuestion();
  refreshIssuesUI();
  dirty=false; showNotification('تم بدء مشروع جديد','success');
  try{ localStorage.removeItem(LS_KEY); }catch(_){}
  persistNow("NewProject");
}

// إزالة أي نظام تأخير أو إرجاء
// وحفظ البيانات فوراً عند أي تغيير
function saveCurrentQuestion(){
  // لا تحفظ أثناء التعبئة/الاستيراد البرمجية
  if (muteSaves > 0) return;

  const q = state.questions?.[state.currentQuestionIndex];
  if (!q) return;

  try {
    // احفظ نصوص المحررات مع التعقيم
    q.reading.text  = sanitizeHTML(readingEditor?.root?.innerHTML || '');
    q.question.text = sanitizeHTML(questionEditor?.root?.innerHTML || '');

    q.options.forEach((o, i) => {
      const ed = optionEditors?.[i];
      if (ed?.root) o.text = sanitizeHTML(ed.root.innerHTML || '');
    });

    dirty = true;
    persistNow();   // حفظ فوري بدون تأخير
  } finally {
    // تحديث واجهة المشاكل إن وُجدت
    try { if (typeof refreshIssuesUI === 'function') refreshIssuesUI(); } catch (_){}
  }
}

// إزالة أي استدعاءات لـ persistDebounced من الأماكن الأخرى في الكود
// واستبدالها باستدعاء مباشر لـ persistNow عند الحاجة


/* ================== تحويلات المعادلات ================ */
function isBlockFormulaEl(el){
  const p=el.closest('p, div'); if(!p) return false;
  for(const n of [...p.childNodes]){
    if(n===el) continue;
    if(n.nodeName==='BR') continue;
    if(n.nodeType===3 && n.textContent.trim()==='') continue;
    return false;
  }
  return true;
}

function htmlFormulasToTeX(html){
  const box = document.createElement('div'); 
  box.innerHTML = html || '';
  box.querySelectorAll('span.ql-formula').forEach(el => {
    const texStr = (el.getAttribute('data-value') || '').trim();
    const wrap = isBlockFormulaEl(el) ? `\\[${texStr}\\]` : `\\(${texStr}\\)`;
    el.replaceWith(document.createTextNode(wrap));
  });
  return box.innerHTML;
}

function htmlToSafeHTMLWithTeX(html){
  const box = document.createElement('div'); 
  box.innerHTML = sanitizeHTML(html || '');
  box.querySelectorAll('span.ql-formula').forEach(el => {
    const texStr = (el.getAttribute('data-value') || '').trim();
    const wrap = isBlockFormulaEl(el) ? `\\[${texStr}\\]` : `\\(${texStr}\\)`;
    el.replaceWith(document.createTextNode(wrap));
  });
  return box.innerHTML;
}

function texWrappersToQuillHTML(s){
  if(!s || typeof s!=='string') return s;
  const esc=t=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
  s=s.replace(/\\\[([\s\S]*?)\\\]/g,(_,tex)=> `<p><span class="ql-formula" data-value="${esc(tex)}"></span></p>`);
  s=s.replace(/\\\(([\s\S]*?)\\\)/g,(_,tex)=> `<span class="ql-formula" data-value="${esc(tex)}"></span>`);
  return s;
}
function textWithTeX(html){ return stripHtml(htmlToSafeHTMLWithTeX(html)); }

/* ================== تصدير JSON ================== */
async function exportData(format='plain', includeImages=true){
  saveCurrentQuestion();
  const fmt = (format==='html') ? 'html' : 'plain';
  let exportQs = JSON.parse(JSON.stringify(state.questions));
  if(includeImages){
    exportQs = await processImagesForExport(exportQs, 'json');
  }else{
    exportQs = exportQs.map(q=>{ q.reading.image=null; q.question.image=null; q.options=q.options.map(o=>({id:o.id,text:o.text,image:null})); return q; });
  }
  const out = exportQs.map(q=>{
    const r=JSON.parse(JSON.stringify(q));
    r.reading.text  = htmlFormulasToTeX(r.reading.text||'');
    r.question.text = htmlFormulasToTeX(r.question.text||'');
    r.options = r.options.map(o=>({ id:o.id, text: htmlFormulasToTeX(o.text||''), image:o.image }));
    if(fmt==='plain'){
      r.reading.text  = stripHtml(r.reading.text);
      r.question.text = stripHtml(r.question.text);
      r.options = r.options.map(o=>({ id:o.id, text: stripHtml(o.text), image:o.image }));
    }else{
      r.reading.text  = sanitizeHTML(r.reading.text);
      r.question.text = sanitizeHTML(r.question.text);
      r.options = r.options.map(o=>({ id:o.id, text: sanitizeHTML(o.text), image:o.image }));
    }
    return r;
  });
  const jsonStr=JSON.stringify(out,null,2);
  const blob=new Blob([jsonStr],{type:'application/json'});
  const profile=`${fmt}_${includeImages?'with-images':'no-images'}`;
  downloadBlob(blob, dlName('json', profile));
  dirty=false; showNotification(`تم تصدير JSON (${fmt==='html'?'HTML':'نص عادي'} - ${includeImages?'مع صور':'بدون صور'})`,'success');
  setLastSaved('JSON');
}

/* ================== Word (HTML بسيط .doc) ================== */
function labelForIndex(i, mode){ if(mode==='digits') return arabicDigits(i+1); if(mode==='letters') return ['أ','ب','ج','د'][i]||''; return ''; }
function buildCoverHTML(title, desc){
  const dateStr=new Date().toLocaleDateString('ar-SA');
  const t=sanitizeHTML(title||'بنك أسئلة'); const d=sanitizeHTML(desc||'');
  return `<div style="text-align:center;border:2px solid #e5e7eb;border-radius:16px;padding:24px;margin:0 0 24px 0" dir="rtl">
            <h1 style="margin:0 0 8px 0;font-size:28px">${t}</h1>
            <p style="margin:0;color:#555">${d}</p>
            <p style="margin:8px 0 0 0;color:#555">التاريخ: ${dateStr}</p>
          </div>`;
}
function rightAlignMargins(align){
  if(align==='right')  return 'margin-right:0;margin-left:auto;';
  if(align==='center') return 'margin-right:auto;margin-left:auto;';
  return 'margin-right:auto;margin-left:0;';
}
function buildTablesHTML(opts, qs){
  const parts=[]; if(opts.includeCover) parts.push( buildCoverHTML(opts.coverTitle, opts.coverDesc) );
  const gap=Math.max(0, parseInt(opts.tableGap||0));
  const alignCSS=rightAlignMargins(opts.tableAlign);
  qs.forEach((q,idx)=>{
    const qNum=arabicDigits(idx+1);
    const readingText    = htmlToSafeHTMLWithTeX(q.reading?.text || '');
    const readingImgHtml = (opts.includeImages && q.reading?.image)  ? `<img src="${q.reading.image}" alt="صورة النص" style="width:auto;max-width:100%;height:auto;display:block;margin:4px auto"/>` : '';
    const questionText   = htmlToSafeHTMLWithTeX(q.question?.text || '');
    const questionImgHtml= (opts.includeImages && q.question?.image) ? `<img src="${q.question.image}" alt="صورة السؤال" style="width:auto;max-width:100%;height:auto;display:block;margin:4px auto"/>` : '';
    const options=(q.options||[]).slice(0,4); while(options.length<4) options.push({text:'',image:null});
    const colgroup = opts.equalCols ? `<colgroup><col style="width:25%"><col style="width:25%"><col style="width:25%"><col style="width:25%"></colgroup>` : '';
    const tableOpen = `
      <div style="font-weight:800;margin:${gap}px 0 6px;color:#111;text-align:right" dir="rtl">السؤال ${qNum}</div>
      <table dir="rtl" style="direction:rtl;width:100%;border-collapse:collapse;table-layout:fixed;${alignCSS}">
        ${colgroup}<tbody>`;
    const rowReading = `
        <tr>
          <td colspan="2" style="text-align:right;border:1px solid #444;padding:8px;vertical-align:top;word-break:break-word">${readingText || '&nbsp;'}</td>
          <td colspan="2" style="text-align:center;border:1px solid #444;padding:8px;vertical-align:top">${readingImgHtml || '&nbsp;'}</td>
        </tr>`;
    const rowQuestion = `
        <tr>
          <td colspan="2" style="text-align:right;border:1px solid #444;padding:8px;vertical-align:top;word-break:break-word">${questionText || '&nbsp;'}</td>
          <td colspan="2" style="text-align:center;border:1px solid #444;padding:8px;vertical-align:top">${questionImgHtml || '&nbsp;'}</td>
        </tr>`;
    const rowOptText = `
        <tr>
          ${options.map((o,i)=>{ const label=labelForIndex(i, opts.optionLabels); const labelSpan=label?`<strong>(${label})</strong> `:''; const txt=htmlToSafeHTMLWithTeX(o.text||'') || '<span style="color:#9ca3af">—</span>'; return `<td style="width:25%;text-align:right;border:1px solid #444;padding:8px;vertical-align:top;word-break:break-word">${labelSpan}${txt}</td>`; }).join('')}
        </tr>`;
    const rowOptImg = `
        <tr>
          ${options.map((o)=>{ const img=(opts.includeImages && o.image) ? `<img src="${o.image}" alt="صورة خيار" style="width:auto;max-width:100%;height:auto;display:block;margin:4px auto"/>` : ''; return `<td style="width:25%;text-align:center;border:1px solid #444;padding:8px;vertical-align:top">${img||'&nbsp;'}</td>`; }).join('')}
        </tr>`;
    const rowStars = `
        <tr>
          ${options.map((_,i)=> `<td style="width:25%;text-align:center;border:1px solid #444;padding:8px;vertical-align:top">${opts.showStar && i===q.correct ? '⭐' : ''}</td>`).join('')}
        </tr>`;
    const tableClose = `</tbody></table>`;
    parts.push(tableOpen + rowReading + rowQuestion + rowOptText + rowOptImg + rowStars + tableClose);
    if(opts.pageBreak && idx<qs.length-1) parts.push('<div style="page-break-before:always"></div>');
  });
  return `<div style="direction:rtl;width:100%;max-width:none;margin:0">${parts.join('\n')}</div>`;
}
async function exportWordSimple(opts){
  saveCurrentQuestion();
  const qs=await processImagesForExport(state.questions,'word');
  const exportCss=`body{direction:rtl;margin:0;padding:0}@page{size:A4;margin:2cm} sup,sub{unicode-bidi:isolate;direction:rtl}`;
  const contentHTML=buildTablesHTML(opts, qs);
  const html=`<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>أسئلة</title><style>${exportCss}</style></head><body>${contentHTML}</body></html>`;
  const blob=new Blob(['\ufeff', html], {type:'application/msword'});
  downloadBlob(blob, dlName('doc'));
  dirty=false; showNotification('تم تصدير Word (بسيط .doc)','success'); setLastSaved('DOC');
}

/* ================== DOCX متقدم ================== */
const DX = window.docx;
function paraRTL(children){ return new DX.Paragraph({ bidirectional:true, alignment:DX.AlignmentType.RIGHT, children:Array.isArray(children)?children:[children] }); }
function getImageNaturalSize(dataUrl){ return new Promise((resolve)=>{ const i=new Image(); i.onload=()=>resolve({w:i.width,h:i.height}); i.src=dataUrl; }); }
async function imageParagraphDOCX(dataUrl, maxW, maxH){
  if(!dataUrl || !/^data:image\//i.test(dataUrl)) return new DX.Paragraph({});
  const {w,h}=await getImageNaturalSize(dataUrl);
  const r=Math.min(maxW/w, maxH/h, 1), W=Math.max(1,Math.round(w*r)), H=Math.max(1,Math.round(h*r));
  const imgRun=new DX.ImageRun({ data:dataURLToUint8Array(dataUrl), transformation:{ width:W, height:H }});
  return new DX.Paragraph({ alignment:DX.AlignmentType.CENTER, children:[imgRun] });
}
const BORDER={ style: DX.BorderStyle.SINGLE, size:1, color:"444444" };
function cellDOCX(children, widthPct, columnSpan=1){
  return new DX.TableCell({
    width:{ size:widthPct, type:DX.WidthType.PERCENTAGE },
    margins:{ top:120, bottom:120, left:120, right:120 },
    borders:{ top:BORDER, bottom:BORDER, left:BORDER, right:BORDER },
    columnSpan,
    children:Array.isArray(children)?children:[children],
  });
}
const WORD_BOX_DOCX={ reading:{w:500,h:350}, question:{w:500,h:350}, option:{w:250,h:180} };
function dataURLToUint8Array(dataURL){
  const base64=(dataURL.split(',')[1]||''); const binary=atob(base64);
  const len=binary.length; const bytes=new Uint8Array(len); for(let i=0;i<len;i++) bytes[i]=binary.charCodeAt(i); return bytes;
}
async function buildDocxSections(qs, opts){
  const children=[]; const tableAlignMap={ right:DX.AlignmentType.RIGHT, center:DX.AlignmentType.CENTER, left:DX.AlignmentType.LEFT };
  const align=tableAlignMap[opts.tableAlign] || DX.AlignmentType.RIGHT; const rtl=!!opts.rtlTables;
  const colW = opts.equalCols ? [2400,2400,2400,2400] : undefined;
  for(let idx=0; idx<qs.length; idx++){
    const q=qs[idx], qNum=arabicDigits(idx+1);
    children.push( new DX.Paragraph({ bidirectional:true, alignment:DX.AlignmentType.RIGHT, children:[ new DX.TextRun({ text:`السؤال ${qNum}`, bold:true }) ] }) );
    const readingTextCell=cellDOCX( paraRTL(new DX.TextRun(textWithTeX(q.reading?.text||''))), 50, 2 );
    const readingImgCell =cellDOCX( await imageParagraphDOCX((opts.includeImages? q.reading?.image:null)||null, WORD_BOX_DOCX.reading.w, WORD_BOX_DOCX.reading.h), 50, 2 );
    const rowReading=new DX.TableRow({ children: rtl ? [readingImgCell, readingTextCell] : [readingTextCell, readingImgCell] });

    const questionTextCell=cellDOCX( paraRTL(new DX.TextRun(textWithTeX(q.question?.text||''))), 50, 2 );
    const questionImgCell =cellDOCX( await imageParagraphDOCX((opts.includeImages? q.question?.image:null)||null, WORD_BOX_DOCX.question.w, WORD_BOX_DOCX.question.h), 50, 2 );
    const rowQuestion=new DX.TableRow({ children: rtl ? [questionImgCell, questionTextCell] : [questionTextCell, questionImgCell] });

    const opts4=(q.options||[]).slice(0,4); while(opts4.length<4) opts4.push({text:'',image:null});
    const order= rtl ? [3,2,1,0] : [0,1,2,3];

    const rowOptText=new DX.TableRow({ children: order.map(i=>{
      const lab=['digits','letters'].includes(opts.optionLabels) ? (opts.optionLabels==='digits' ? arabicDigits(i+1) : (['أ','ب','ج','د'][i]||'')) : '';
      const txt=(lab?`(${lab}) `:'') + (textWithTeX(opts4[i].text||'')||'');
      return cellDOCX( paraRTL(new DX.TextRun(txt)), 25 );
    })});

    const rowOptImg=new DX.TableRow({ children: await Promise.all(order.map(async i=> cellDOCX( await imageParagraphDOCX((opts.includeImages?opts4[i].image:null)||null, WORD_BOX_DOCX.option.w, WORD_BOX_DOCX.option.h), 25 ))) });
    const rowStars=new DX.TableRow({ children: order.map(i=> cellDOCX( new DX.Paragraph({ alignment:DX.AlignmentType.CENTER, children:[ new DX.TextRun((opts.showStar && i===q.correct)?'⭐':'') ] }), 25 )) });

    const tbl=new DX.Table({
      width:{ size:100, type:DX.WidthType.PERCENTAGE },
      layout:DX.TableLayoutType.FIXED,
      alignment:align,
      columnWidths:colW,
      rows:[rowReading, rowQuestion, rowOptText, rowOptImg, rowStars],
    });
    children.push(tbl);

    if(opts.pageBreak && idx<qs.length-1){ children.push(new DX.Paragraph({ children:[ new DX.PageBreak() ] })); }
    else if(!opts.pageBreak && opts.tableGap>0){ children.push(new DX.Paragraph({ spacing:{ after: Math.round((opts.tableGap||0)*15) } })); }
  }
  const sections=[];
  if(opts.includeCover){
    const dateStr=new Date().toLocaleDateString('ar-SA');
    sections.push({ properties:{}, children:[
      paraRTL(new DX.TextRun({ text:(opts.coverTitle||'بنك أسئلة'), bold:true, size:56 })),
      paraRTL(new DX.TextRun(opts.coverDesc||'')),
      paraRTL(new DX.TextRun(`التاريخ: ${dateStr}`)),
      new DX.Paragraph({ children:[ new DX.PageBreak() ] }),
    ]});
  }
  sections.push({ properties:{}, children });
  return sections;
}
async function exportWordAdvancedDOCX(opts){
  if(!window.docx){ showNotification('تعذر تحميل مكتبة docx','error'); return; }
  saveCurrentQuestion();
  const qs=await processImagesForExport(state.questions,'word');
  const sections=await buildDocxSections(qs, opts);
  const doc=new DX.Document({ sections, styles:{ default:{ document:{ rightToLeft:true } } } });
  const blob=await DX.Packer.toBlob(doc);
  downloadBlob(blob, dlName('docx'));
  dirty=false; showNotification('تم تصدير Word (DOCX)','success'); setLastSaved('DOCX');
}

// مساعدين: فراغ النص بعد نزع الـHTML
const _blank = h => (stripHtml(h||'').trim()==='');
const _readingEmpty  = q => _blank(q?.reading?.text)  && !q?.reading?.image;     // اختياري: لن نعدّه مشكلة
const _questionEmpty = q => _blank(q?.question?.text) && !q?.question?.image;    // إجباري: مشكلة
const _optionEmpty   = o => _blank(o?.text) && !o?.image;  

function hasText(html){ return !!stripHtml(html||'').trim(); }
function hasContentTXTorIMG(x){ return hasText(x?.text) || !!x?.image; }

function stripExternalImagesInPlace(items){
  for(const q of items){
    if (q?.reading && isExternalImage(q.reading.image))  q.reading.image = null;
    if (q?.question && isExternalImage(q.question.image)) q.question.image = null;
    if (Array.isArray(q?.options)){
      for(const o of q.options){
        if (o && isExternalImage(o.image)) o.image = null;
      }
    }
  }
  return items;
}

async function finalizeImportApply(items, mode, stripExternal){
  // (1) شطب الصور الخارجية إذا طُلب
  if (stripExternal) stripExternalImagesInPlace(items);

  // (2) تطبيع الخيارات والـ correct
  for (const q of items){
    if (!Array.isArray(q.options)) q.options = [];
    q.options = q.options.filter(o => hasContentTXTorIMG(o));
    while (q.options.length > 4) q.options.pop();
    while (q.options.length < 2) q.options.push({ id: uid(), text:'', image:null });

    const len = q.options.length;
    let c = Number.isFinite(q.correct) ? q.correct : 0;
    if (c < 0 || c >= len) c = 0;
    q.correct = c;
  }

  // (3) طبّق الدمج مع كتم الحفظ بطريقة العداد
  await muteAsync(async () => {
    if (mode === 'append'){
      state.questions = [...state.questions, ...items];
    } else {
      state.questions = items;
    }
    state.currentQuestionIndex = 0;
    renderSidebar();
    renderQuestion();
    refreshIssuesUI(); // مهم بعد الرندر
    persistNow("Import");

    // تنظيف واجهة الاستيراد
    $('importTextArea').value = '';
    $('importFiles').value = '';
    $('importFilesList').innerHTML = '';
  });
}

async function finalizeImportFromReview(){
  if (!pendingImport) return;
  const strip = $('revStripExternal')?.checked ?? true;

  try{
    await finalizeImportApply(pendingImport.items, pendingImport.mode, strip);

    // أغلق شاشة المراجعة
    closeModal($('importReviewModal'));

    // نظّف مدخلات كلا المسارين (JSON و Word)
    cleanupImportInputs();
    cleanupWordInputs();

    pendingImport = null;
    showNotification('تم الاستيراد بعد المراجعة بنجاح','success');
    refreshIssuesUI();
  }catch(err){
    console.error(err);
    showNotification('فشل الاستيراد بعد المراجعة','error');
  }
}

/* ================== الاستيراد ================== */
function normalizeQuestion(qRaw){
  const safe = (s) => sanitizeHTML( texWrappersToQuillHTML( typeof s === 'string' ? s : '' ) );

  const rawOpts = Array.isArray(qRaw?.options) ? qRaw.options : [];
  const normOptions = rawOpts.length
    ? rawOpts.map(o => ({ id: uid(), text: safe(o?.text), image: o?.image ?? null }))
    : [{ id: uid(), text: '', image: null }, { id: uid(), text: '', image: null }];

  const corr = Number.isFinite(qRaw?.correct)
    ? Math.max(0, Math.min(normOptions.length - 1, (qRaw.correct|0)))
    : 0;

  return {
    reading : { text: safe(qRaw?.reading?.text),  image: qRaw?.reading?.image  ?? null },
    question: { text: safe(qRaw?.question?.text), image: qRaw?.question?.image ?? null },
    options : normOptions,
    correct : corr
  };
}

function normalizeQuestions(arr){
  return (Array.isArray(arr) ? arr : []).map(q => normalizeQuestion(q));
}

function readFileAsText(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result||'')); r.onerror=reject; r.readAsText(file); }); }

// عدّ الصور المضمّنة/الخارجية لكل سؤال
function countImages(q){
  let r = { reading:0, question:0, options:0, external:0 };
  if (q?.reading?.image){
    QUTIL.isDataImage(q.reading.image) ? r.reading++ : r.external++;
  }
  if (q?.question?.image){
    QUTIL.isDataImage(q.question.image) ? r.question++ : r.external++;
  }
  if (Array.isArray(q?.options)){
    for(const o of q.options){
      if (o?.image){
        QUTIL.isDataImage(o.image) ? r.options++ : r.external++;
      }
    }
  }
  return r;
}

// القواعد: القراءة اختيارية — السؤال إلزامي (نص أو صورة) — كل خيار (نص أو صورة) — أقل من خيارين مشكلة
function summarizeQuestions(items){
  const sum = {
    total: items.length,
    questionEmpty:0,
    optionEmpty:0,
    lessThanTwoOptions:0,
    imagesExternal:0,
    imagesReading:0,
    imagesQuestion:0,
    imagesOptions:0,
  };

  for(const q of items){
    if (!QUTIL.hasAnyContent(q?.question)) sum.questionEmpty++;

    const opts = Array.isArray(q?.options) ? q.options : [];
    if (opts.length < 2) sum.lessThanTwoOptions++;
    for (const o of opts){
      if (!QUTIL.hasAnyContent(o)) sum.optionEmpty++;
    }

    const ic = countImages(q);
    sum.imagesReading  += ic.reading;
    sum.imagesQuestion += ic.question;
    sum.imagesOptions  += ic.options;
    sum.imagesExternal += ic.external;
  }
  return sum;
}

function buildImportIssuesList(items, sum){
  const issues = [];
  if (sum.imagesExternal > 0)     issues.push(`يوجد ${sum.imagesExternal} صورة غير مضمّنة (روابط خارجية).`);
  if (sum.lessThanTwoOptions > 0) issues.push(`هناك ${sum.lessThanTwoOptions} سؤالًا بأقل من خيارين.`);
  if (sum.questionEmpty > 0)      issues.push(`عدد ${sum.questionEmpty} سؤال بلا نص أو صورة.`);
  if (sum.optionEmpty > 0)        issues.push(`مجموع ${sum.optionEmpty} خيار بلا نص أو صورة.`);
  if (!issues.length)             issues.push('لا توجد مشاكل ملحوظة. جاهز للدمج. ✅');
  return issues;
}

function renderImportReview(items, mode){
  const stats  = summarizeQuestions(items);
  const issues = buildImportIssuesList(items, stats);

  const statsBox  = $('revStatsBox');
  const issuesBox = $('revIssuesBox');

  if (statsBox){
    statsBox.innerHTML = `
      <div>إجمالي الأسئلة: <strong>${stats.total}</strong></div>
      <div>صور مضمنة: قراءة ${stats.imagesReading} • سؤال ${stats.imagesQuestion} • خيارات ${stats.imagesOptions}</div>
      <div>صور خارجية (غير Base64): <strong style="color:#b91c1c">${stats.imagesExternal}</strong></div>
      <div>أسئلة بلا سؤال (نص/صورة): <strong>${stats.questionEmpty}</strong></div>
      <div>خيارات فارغة تماماً (مجمّع): <strong>${stats.optionEmpty}</strong></div>
      <div>أسئلة بأقل من خيارين: <strong>${stats.lessThanTwoOptions}</strong></div>
      <div class="hint">وضع الاستيراد: ${mode==='append' ? 'دمج مع الحالية' : 'استبدال الكل'}</div>
    `;
  }

  if (issuesBox){
    issuesBox.innerHTML = `<ul style="margin:6px 0;padding-inline-start:22px">
      ${issues.map(m=>`<li>${sanitizeHTML(m)}</li>`).join('')}
    </ul>`;
  }
}

function openImportReviewModal(items, mode){
  pendingImport = { mode, items };
  renderImportReview(items, mode);
  closeModal($('importModal'));
  openModal($('importReviewModal'), $('importBtn'));
}

function cleanupImportInputs(){
  try{
    const fileInput = $('importFiles');  if (fileInput) fileInput.value = '';
    const list = $('importFilesList');   if (list) list.innerHTML = '';
    const ta   = $('importTextArea');    if (ta)   ta.value = '';
    const ed   = $('jsonEditor');        if (ed)   ed.value = '';
  }catch(_){}
}

function cleanupWordInputs(){
  try{
    const inp  = $('wordFiles');     if (inp)  inp.value = '';
    const list = $('wordFilesList'); if (list) list.innerHTML = '';
  }catch(_){}
}

// بدّل جسم الدالة كلها بهذه النسخة
async function handleAdvancedImport(){
  const importModeRadios = document.querySelector('input[name="importMode"]:checked');
  const importMode = (importModeRadios?.value === 'replace') ? 'replace' : 'append';

  const fileInput = $('importFiles');

  // اقرأ الملفات
  const files = Array.from(fileInput.files || []);
  const texts = await Promise.all(files.map(readFileAsText));

  // من الملفات (مطبَّعة)
  let fromFiles = [];
  for (const txt of texts){
    const parsed = JSON.parse(txt);
    if (!Array.isArray(parsed)) throw new Error('كل ملف يجب أن يحتوي مصفوفة أسئلة');
    fromFiles.push(...normalizeQuestions(parsed));
  }

  // من اللصق + محرر JSON (مطبَّعة)
  let fromText = [];
  const pasted = $('importTextArea').value.trim();
  if (pasted){
    const arr = JSON.parse(pasted);
    if(!Array.isArray(arr)) throw new Error('النص الملصوق يجب أن يكون مصفوفة أسئلة');
    fromText = normalizeQuestions(arr);
  }
  const editorBox = $('jsonEditor').value.trim();
  if (editorBox){
    const arr = JSON.parse(editorBox);
    if(!Array.isArray(arr)) throw new Error('محرر JSON يجب أن يحتوي مصفوفة أسئلة');
    fromText.push(...normalizeQuestions(arr));
  }

  const all = [...fromFiles, ...fromText];
  if (all.length === 0){
    showNotification('لم تُحدِّد ملفات أو نصًا للاستيراد','error');
    return;
  }

  const review = $('reviewBeforeImport')?.checked ?? true;
  if (review){
    // لا ننظف هنا — ننتظر حتى يؤكد بالمراجعة
    openImportReviewModal(all, importMode);
    return;
  }

  // تنفيذ فوري بدون مراجعة
  await finalizeImportApply(all, importMode, /*stripExternal=*/true);
  showNotification(`تم استيراد ${all.length} سؤالاً (${importMode==='append'?'دمج':'استبدال'})`,'success');

  // نظّف بعد النجاح
  cleanupImportInputs();
}


function mountIssueToolbarAtTop(){
  const bar = document.getElementById('issueToolbar');
  const container = document.querySelector('.editor-container');
  if (bar && container){
    container.insertBefore(bar, container.firstChild); // انقله لأعلى الـmain
  }
}

function hideKeyboardHints(){ // لإخفاء سطر اختصارات الكيبورد نهائيًا
  document.querySelectorAll('.hint').forEach(d => {
    if (d.querySelector('kbd')) d.remove();
  });
}

// حفظ سريع عند إغلاق/تحديث الصفحة
window.addEventListener("beforeunload", () => {
  if (dirty && muteSaves === 0) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state.questions));
      setLastSaved("Auto");
    } catch (_) {}
  }
});

/* ================== مودالات وربط الأحداث ================== */
function openModal(modalEl, returnFocusEl){ if(!modalEl) return;
  modalEl.classList.add('show'); modalEl.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
  if(returnFocusEl) modalEl._returnFocus=returnFocusEl;
  const focusable=modalEl.querySelector('input,select,textarea,button,[tabindex]:not([tabindex="-1"])'); if(focusable) focusable.focus();
}
function closeModal(modalEl){ if(!modalEl) return; modalEl.classList.remove('show'); modalEl.setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); if(modalEl._returnFocus && modalEl._returnFocus.focus) modalEl._returnFocus.focus(); }
function collectExportOptions(){
  return {
    includeCover:   $('optIncludeCover')?.checked ?? false,
    coverTitle:     $('optCoverTitle')?.value?.trim() ?? '',
    coverDesc:      $('optCoverDesc')?.value?.trim() ?? '',
    pageBreak:      $('optPageBreak')?.checked ?? false,
    showStar:       $('optShowStar')?.checked ?? true,
    includeImages:  $('optIncludeImages')?.checked ?? true,
    equalCols:      $('optEqualCols')?.checked ?? true,
    tableAlign:     $('optTableAlign')?.value ?? 'right',
    tableGap:       parseInt($('optTableGap')?.value||'16') || 0,
    optionLabels:   $('optOptionLabels')?.value ?? 'none',
    rtlTables:      $('optRtlTables')?.checked ?? true
  };
}
function bind(id, evt, handler){ const el=$(id); if(!el){ console.warn('عنصر مفقود:',id); return null; } el.addEventListener(evt, handler); return el; }

function setupEventListeners(){
  // محررات النص
  readingEditor.on('text-change', saveCurrentQuestion);
  questionEditor.on('text-change', saveCurrentQuestion);

  // أزرار معادلات
  bind('btnInlineFormula','click', ()=> openFormulaTooltip(readingEditor));
  bind('btnBlockFormula','click',  ()=> insertBlockFormulaViaTooltip(readingEditor));
  bind('qMathInline',  'click', ()=> openFormulaTooltip(questionEditor));
  bind('qMathDisplay', 'click', ()=> insertBlockFormulaViaTooltip(questionEditor));

  /* ===== Helper: سحب/إفلات data:image كرابط نصي ===== */
  function enableDataUrlDrop(zoneId, previewId, removeBtnSel, part, idx=null){
    const zone = $(zoneId);
    if (!zone) return;

    zone.addEventListener('dragover', (e) => {
      if (!e.dataTransfer) return;
      const hasText = (e.dataTransfer.types || []).includes('text/plain') ||
                      (e.dataTransfer.types || []).includes('text/uri-list');
      if (hasText) { e.preventDefault(); zone.classList.add('drop-over'); }
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drop-over'));

    zone.addEventListener('drop', (e) => {
      const dataUrl = e.dataTransfer?.getData('text/plain') ||
                      e.dataTransfer?.getData('text/uri-list') || '';
      if (dataUrl && /^data:image\//i.test(dataUrl)) {
        e.preventDefault();
        e.stopPropagation();  // لا تدع bindDropZone يتعامل معها
        zone.classList.remove('drop-over');
        updateImageInState(previewId, removeBtnSel, dataUrl, part, idx);
      }
    });
  }

  // صور: النص القرائي
  bind('readingUploadBtn','click',()=> $('readingImageUpload')?.click());
  bind('readingImageUpload','change',()=> 
    uploadImage('readingImageUpload','readingImagePreview','#readingRemoveBtn','reading')
  );
  bind('readingPasteBtn','click',()=> 
    pasteImage('readingImagePreview','#readingRemoveBtn',null,'reading')
  );
  bind('readingRemoveBtn','click',()=>{
    const q=state.questions[state.currentQuestionIndex];
    q.reading.image=null;
    updateImagePreview('readingImagePreview','#readingRemoveBtn',null);
    dirty=true; showNotification('تم حذف صورة النص القرائي','success'); 
    refreshIssuesUI();
  });

  // سحب/إفلات ملف صورة (PNG/JPG) للقرائي
  const readingZone  = $('readingDropZone');
  if (readingZone) {
    bindDropZone(readingZone, async (file) => {
      const data = await readAndCompressImage(file);
      updateImageInState('readingImagePreview', '#readingRemoveBtn', data, 'reading');
    });
  }
  // سحب/إفلات data:image (من معاينة أخرى)
  enableDataUrlDrop('readingDropZone',  'readingImagePreview',  '#readingRemoveBtn',  'reading');

  // صور: السؤال
  bind('questionUploadBtn','click',()=> $('questionImageUpload')?.click());
  bind('questionImageUpload','change',()=> 
    uploadImage('questionImageUpload','questionImagePreview','#questionRemoveBtn','question')
  );
  bind('questionPasteBtn','click',()=> 
    pasteImage('questionImagePreview','#questionRemoveBtn',null,'question')
  );
  bind('questionRemoveBtn','click',()=>{
    const q=state.questions[state.currentQuestionIndex];
    q.question.image=null;
    updateImagePreview('questionImagePreview','#questionRemoveBtn',null);
    dirty=true; showNotification('تم حذف صورة السؤال','success'); 
    refreshIssuesUI();
  });

  // سحب/إفلات ملف صورة (PNG/JPG) للسؤال
  const questionZone = $('questionDropZone');
  if (questionZone) {
    bindDropZone(questionZone, async (file) => {
      const data = await readAndCompressImage(file);
      updateImageInState('questionImagePreview', '#questionRemoveBtn', data, 'question');
    });
  }
  // سحب/إفلات data:image (من معاينة أخرى)
  enableDataUrlDrop('questionDropZone', 'questionImagePreview', '#questionRemoveBtn', 'question');

  // تفويض عام: اجعل أي معاينة صورة قابلة للسحب كمصدر data:image
  document.addEventListener('dragstart', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (!img.classList.contains('image-preview')) return;
    const src = img.getAttribute('src') || '';
    if (/^data:image\//i.test(src) && e.dataTransfer) {
      e.dataTransfer.setData('text/plain', src);
    }
  });

  // خيارات
  bind('addOptionBtn','click', addNewOption);

  // أسئلة
  bind('addQuestionBtn','click', addNewQuestion);
  bind('newProjectBtn','click', newProject);
  bind('dupQuestionBtn','click', duplicateCurrentQuestion);

  // Issue toolbar
  bind('prevIssueBtn','click', ()=> gotoIssue(issueCursor - 1));
  bind('nextIssueBtn','click', ()=> gotoIssue(issueCursor + 1));
  bind('dismissIssueBtn','click', dismissCurrentIssue);
  bind('showAllIssuesBtn','click', clearDismissedIssues);

  // مودال الاستيراد
  const importModal=$('importModal');
  bind('importBtn','click', (e)=> openModal(importModal, e.currentTarget));
  bind('closeImportModal','click', ()=> closeModal(importModal));
  importModal?.addEventListener('click', (e)=>{ if(e.target===importModal) closeModal(importModal); });
  bind('chooseImportFiles','click',()=> $('importFiles')?.click());
  bind('importFiles','change',()=>{ 
    const list=$('importFilesList'); 
    const files=Array.from($('importFiles').files||[]); 
    list.innerHTML = files.map(f=>`<span class="file-pill">${f.name}</span>`).join(''); 
  });
  bind('doImportBtn','click', ()=> 
    runAction('doImportBtn','جارٍ الاستيراد...','جاري الاستيراد...', handleAdvancedImport)
  );

  // مودال مراجعة الاستيراد
  const importReviewModal=$('importReviewModal');
  bind('closeImportReview','click', ()=> closeModal(importReviewModal));
  importReviewModal?.addEventListener('click',(e)=>{ if(e.target===importReviewModal) closeModal(importReviewModal); });
  bind('cancelImportBtn','click', ()=> closeModal(importReviewModal));
  bind('confirmImportBtn','click', finalizeImportFromReview);

  // تبديل التبويبات في مودال الاستيراد
  document.querySelectorAll('.imp-tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.imp-tab-btn').forEach(b=> b.classList.remove('active'));
      document.querySelectorAll('.imp-tab').forEach(p=> p.style.display='none');
      btn.classList.add('active');
      const target = document.querySelector(btn.dataset.target);
      if (target) target.style.display='block';
    });
  });

  // ربط تبويب Word
try { WORDIMP.bindUI(); } catch(_){}

  // مودال تصدير Word
  const exportModal=$('exportModal');
  bind('exportWordOpen','click', (e)=> openModal(exportModal, e.currentTarget));
  bind('closeExportModal','click', ()=> closeModal(exportModal));
  exportModal?.addEventListener('click',(e)=>{ if(e.target===exportModal) closeModal(exportModal); });
  bind('exportWordBtn','click', async ()=>{ const opts=collectExportOptions(); closeModal(exportModal); await runAction('exportWordBtn','جارٍ التصدير...','يتم تجهيز ملف Word (بسيط)...', ()=> exportWordSimple(opts)); });
  bind('exportDocxBtn','click', async ()=>{ const opts=collectExportOptions(); closeModal(exportModal); await runAction('exportDocxBtn','جارٍ التصدير...','يتم تجهيز ملف DOCX...', ()=> exportWordAdvancedDOCX(opts)); });

  // مودال تصدير JSON
  const jsonModal=$('jsonModal');
  bind('exportJsonOpen','click', (e)=> openModal(jsonModal, e.currentTarget));
  bind('closeJsonModal','click', ()=> closeModal(jsonModal));
  jsonModal?.addEventListener('click',(e)=>{ if(e.target===jsonModal) closeModal(jsonModal); });
  bind('exportJsonBtn','click', async ()=>{ const format=$('jsonFormat')?.value ?? 'plain'; const includeImages=$('jsonIncludeImages')?.checked ?? true; closeModal(jsonModal); await runAction('exportJsonBtn','جارٍ التصدير...','يتم تجهيز ملف JSON...', ()=> exportData(format, includeImages)); });

  // أزرار أسفل صندوق JSON اليدوي
  bind('clearJsonBtn','click', ()=> { $('jsonEditor').value=''; showNotification('تم مسح النص','success'); });
  bind('importJsonBtn','click', ()=> openModal(importModal, $('importJsonBtn')) );

  // إغلاق المودالات بـ Escape
  document.addEventListener('keydown',(e)=>{ if(e.key==='Escape'){ [importModal, exportModal, jsonModal, importReviewModal].forEach(m=>{ if(m?.classList.contains('show')) closeModal(m); }); } });

   // اختصارات لوحة المفاتيح للتنقل بين المشاكل
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.closest('.ql-tooltip')) return;
    if (e.altKey && e.key === 'ArrowRight')  { e.preventDefault(); gotoIssue(issueCursor - 1); }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); gotoIssue(issueCursor + 1); }
  });
}

window.WORDIMP = (()=> {
  const STAR = /[\*★✱∗⭐٭☆]/;

  // ========= IO =========
  async function readDocxAsHtml(file){
    const ab = await file.arrayBuffer();
    const res = await window.mammoth.convertToHtml(
      { arrayBuffer: ab },
      {
        convertImage: window.mammoth.images.inline(async el=>{
          const b64 = await el.read('base64');
          return { src:`data:${el.contentType};base64,${b64}` };
        })
      }
    );
    return res.value || '';
  }
  async function readDocAsHtml(file){
    // .doc المُصدَّر من أداتك القديمة هو HTML
    return String(await file.text() || '');
  }

  // ========= Helpers =========
  function isRowEmpty(row){
    const cells = row?.querySelectorAll?.('td,th') || [];
    return Array.from(cells).every(td=>{
      const t = (td.textContent||'').replace(/[\u200f\u200e]/g,'').trim();
      const img= td.querySelector('img');
      return !t && !img;
    });
  }
  function getNum(id, def=1){ const v = parseInt(document.getElementById(id)?.value,10); return Number.isFinite(v)?v:def; }
  function coordsFromUI(){
    return {
      readingText:   [ getNum('wp_r_reading'),      getNum('wp_c_reading') ],
      readingImage:  [ getNum('wp_r_reading_img'),  getNum('wp_c_reading_img') ],
      questionText:  [ getNum('wp_r_question'),     getNum('wp_c_question') ],
      questionImage: [ getNum('wp_r_question_img'), getNum('wp_c_question_img') ],
      options: [
        { text:[getNum('wp_r_opt1'), getNum('wp_c_opt1')], image:[getNum('wp_r_opt1_img'), getNum('wp_c_opt1_img')] },
        { text:[getNum('wp_r_opt2'), getNum('wp_c_opt2')], image:[getNum('wp_r_opt2_img'), getNum('wp_c_opt2_img')] },
        { text:[getNum('wp_r_opt3'), getNum('wp_c_opt3')], image:[getNum('wp_r_opt3_img'), getNum('wp_c_opt3_img')] },
        { text:[getNum('wp_r_opt4'), getNum('wp_c_opt4')], image:[getNum('wp_r_opt4_img'), getNum('wp_c_opt4_img')] }
      ]
    };
  }
  function cell(rows, [r,c]){
    const rr=r-1; if(rr<0 || rr>=rows.length) return { text:'', image:null };
    const tds=rows[rr].querySelectorAll('td,th'); if(c<1 || c>tds.length) return { text:'', image:null };
    const td=tds[c-1];
    const html = sanitizeHTML( texWrappersToQuillHTML(td.innerHTML||'') );
    const text = html; // نُبقي HTML (يدعم معادلاتك \(...\) → span)
    const img  = td.querySelector('img') ? td.querySelector('img').src : null;
    return { text, image: img };
  }
  function firstImgSrc(td){ return td?.querySelector?.('img')?.src || null; }

  function splitTextImgCells(row){
    const tds = Array.from(row?.cells||[]);
    if (tds.length < 2) return { textTd: tds[0]||null, imgTd: null };
    const withImg = tds.find(td => td.querySelector('img'));
    if (withImg){
      const others = tds.filter(td => td !== withImg);
      // اختر أغناها نصًا كنصّ
      const textTd = others.sort((a,b)=> (a.textContent||'').length - (b.textContent||'').length).pop() || others[0] || null;
      return { textTd, imgTd: withImg };
    }
    // بدون صور: اعتبر الأولى نصًا
    return { textTd: tds[0], imgTd: tds[1]||null };
  }
  function hasAnyContentPart(p){
    if (!p) return false;
    const plain = (p.text||'').replace(/<[^>]*>/g,'').trim();
    return !!plain || !!p.image;
  }

  // ======= نجمة الإجابة الصحيحة =======
  function mapCellToOptionIndex(r, c, coords){
    for (let i=0;i<4;i++){
      const [tr,tc] = coords.options[i].text  || [0,0];
      const [ir,ic] = coords.options[i].image || [0,0];
      if ((tr===r && tc===c) || (ir===r && ic===c)) return i;
    }
    // تقريب عمودي على نفس العمود
    let best=-1, dist=Infinity;
    for (let i=0;i<4;i++){
      const [tr,tc] = coords.options[i].text  || [0,0];
      const [ir,ic] = coords.options[i].image || [0,0];
      if (tc===c || ic===c){
        const d1 = tr ? Math.abs(r-tr) : Infinity;
        const d2 = ir ? Math.abs(r-ir) : Infinity;
        const d  = Math.min(d1,d2);
        if (d<dist){ dist=d; best=i; }
      }
    }
    return best;
  }
  function maxOptionRow(coords){
    let m=0;
    for (let i=0;i<4;i++){
      m = Math.max(m, coords.options[i].text?.[0]||0, coords.options[i].image?.[0]||0);
    }
    return m||0;
  }
  function detectCorrect(q, rowsSlice, coords, lookahead){
    const hits=[];
    // نجوم داخل نص الخيار
    for(let i=0;i<4;i++){
      const t=q.options[i]?.text||'';
      if (STAR.test(t)){
        hits.push({idx:i, where:'option-text'});
        q.options[i].text = t.replace(STAR,'').trim();
      }
    }
    // صفوف لاحقة بعد آخر صف خيارات
    if (lookahead>0 && rowsSlice?.length){
      const startRow = Math.min(rowsSlice.length, maxOptionRow(coords)+1);
      const endRow   = Math.min(rowsSlice.length, startRow + lookahead - 1);
      for (let rr=startRow; rr<=endRow; rr++){
        const rowEl=rowsSlice[rr-1]; if(!rowEl) continue;
        const cells=rowEl.querySelectorAll('td,th');
        for (let j=0;j<cells.length;j++){
          const raw=(cells[j].textContent||'').trim();
          if (STAR.test(raw)){
            const idx = mapCellToOptionIndex(rr, j+1, coords);
            if (idx !== -1){
              hits.push({idx, where:'marker-row'});
              cells[j].textContent = raw.replace(STAR,'').trim();
            }
          }
        }
      }
    }
    const uniq=[...new Set(hits.map(h=>h.idx))];
    if (uniq.length===1){ q.correct=uniq[0]; delete q._ambiguousCandidates; }
    else if (uniq.length>1){ q.correct=-1; q._ambiguousCandidates=uniq; }
    else { q.correct=-1; delete q._ambiguousCandidates; }
  }

  // ========= إزالة خلفية (اختياري ومُصغّر) =========
  const BG_PRESETS = {
    safe:     { inner:10, outer:22, ss:1, blurR:1, blurP:1 },
    balanced: { inner:18, outer:38, ss:2, blurR:1, blurP:2 },
    strong:   { inner:30, outer:60, ss:3, blurR:1, blurP:3 },
  };
  function readBgUI(){
    const on = !!document.getElementById('wp_bg_enable')?.checked;
    const preset = document.getElementById('wp_bg_preset')?.value || 'balanced';
    const pg = BG_PRESETS[preset] || BG_PRESETS.balanced;
    const inner = parseInt(document.getElementById('wp_bg_inner')?.value,10); 
    const outer = parseInt(document.getElementById('wp_bg_outer')?.value,10); 
    const ss    = parseInt(document.getElementById('wp_bg_ss')?.value,10);
    const blurR = parseInt(document.getElementById('wp_bg_blurR')?.value,10);
    const blurP = parseInt(document.getElementById('wp_bg_blurP')?.value,10);
    return {
      enabled: on,
      inner: Number.isFinite(inner)?inner:pg.inner,
      outer: Number.isFinite(outer)?outer:pg.outer,
      ss:    Number.isFinite(ss)?ss:pg.ss,
      blurR: Number.isFinite(blurR)?blurR:pg.blurR,
      blurP: Number.isFinite(blurP)?blurP:pg.blurP,
    };
  }
  async function removeBG(dataURL, P){
    if (!dataURL || !/^data:image\//i.test(dataURL)) return dataURL;
    // نسخة خفيفة مستندة على منطقك
    return new Promise(resolve=>{
      const img=new Image();
      img.onload=()=>{
        const hi=document.createElement('canvas'), ctx=hi.getContext('2d',{willReadFrequently:true});
        hi.width = Math.max(1, img.width  * P.ss);
        hi.height= Math.max(1, img.height * P.ss);
        ctx.imageSmoothingEnabled=true; ctx.drawImage(img,0,0,hi.width,hi.height);
        const id=ctx.getImageData(0,0,hi.width,hi.height), d=id.data, W=hi.width, H=hi.height;
        const px=(x,y)=>{const i=(y*W+x)*4; return [d[i],d[i+1],d[i+2]];};
        const bg=[[0,0],[W-1,0],[0,H-1],[W-1,H-1]].map(([x,y])=>px(x,y)).reduce((a,c)=>[a[0]+c[0],a[1]+c[1],a[2]+c[2]],[0,0,0]).map(v=>Math.round(v/4));
        const dist=(r,g,b)=>{const dr=r-bg[0],dg=g-bg[1],db=b-bg[2]; return Math.sqrt(dr*dr+dg*dg+db*db);};
        const smooth=(e0,e1,x)=>{const t=Math.min(1,Math.max(0,(x-e0)/(e1-e0))); return t*t*(3-2*t);};
        for(let i=0;i<d.length;i+=4){
          const dd=dist(d[i],d[i+1],d[i+2]);
          if(dd<=P.inner) d[i+3]=0;
          else if(dd<P.outer) d[i+3]=Math.round(d[i+3]*smooth(P.inner,P.outer,dd));
        }
        // تمليس قناة ألفا (تمرير واحد بسيط)
        if (P.blurR>0 && P.blurP>0){
          const A=new Uint8ClampedArray(W*H), T=new Uint8ClampedArray(W*H);
          for(let k=0,j=3;k<A.length;k++,j+=4) A[k]=d[j];
          const R=P.blurR, S=R*2+1;
          // أفقي
          for(let y=0;y<H;y++){
            let sum=0, row=y*W;
            for(let x=-R;x<=R;x++){ const xi=Math.max(0,Math.min(W-1,x)); sum+=A[row+xi]; }
            for(let x=0;x<W;x++){
              T[row+x]=Math.round(sum/S);
              const xAdd=Math.min(W-1,x+R+1), xRem=Math.max(0,x-R);
              sum+=A[row+xAdd]-A[row+xRem];
            }
          }
          // عمودي
          for(let x=0;x<W;x++){
            let sum=0;
            for(let y=-R;y<=R;y++){ const yi=Math.max(0,Math.min(H-1,y)); sum+=T[yi*W+x]; }
            for(let y=0;y<H;y++){
              A[y*W+x]=Math.round(sum/S);
              const yAdd=Math.min(H-1,y+R+1), yRem=Math.max(0,y-R);
              sum+=T[yAdd*W+x]-T[yRem*W+x];
            }
          }
          for(let k=0,j=3;k<A.length;k++,j+=4) d[j]=A[k];
        }
        for(let i=3;i<d.length;i+=4){ if(d[i]<8)d[i]=0; else if(d[i]>247)d[i]=255; }
        ctx.putImageData(id,0,0);
        const out=document.createElement('canvas'), octx=out.getContext('2d');
        out.width=Math.max(1,Math.round(W/P.ss)); out.height=Math.max(1,Math.round(H/P.ss));
        octx.imageSmoothingEnabled=true; octx.drawImage(hi,0,0,out.width,out.height);
        resolve(out.toDataURL('image/png'));
      };
      img.src=dataURL;
    });
  }
  async function maybeBG(img){
    const cfg=readBgUI();
    if (!cfg.enabled) return img;
    return await removeBG(img, cfg);
  }

  // ========= Parser: HTML → أسئلة =========
  function extractQuestion(rows, coords, startRow, rowsPerQuestion, lookahead){
    if (!rows?.length || startRow>=rows.length) return null;
    const endRow = Math.min(startRow+rowsPerQuestion, rows.length);
    const slice  = rows.slice(startRow, endRow);
    if (slice.every(isRowEmpty)) return null;

    // صف 0: قراءة (نص+صورة) — إن لم تنطبق الإحداثيات، نحاول splitTextImgCells
    const r0 = splitTextImgCells(slice[0] || {});
    const reading = cell(slice, coords.readingText);
    const readingImgCell = cell(slice, coords.readingImage);
    if (!hasAnyContentPart(reading) && r0.textTd){
      reading.text  = sanitizeHTML( texWrappersToQuillHTML(r0.textTd.innerHTML||'') );
    }
    if (!reading.image && r0.imgTd){
      reading.image = firstImgSrc(r0.imgTd);
    }

    const r1 = splitTextImgCells(slice[1] || {});
    const question = cell(slice, coords.questionText);
    const questionImgCell = cell(slice, coords.questionImage);
    if (!hasAnyContentPart(question) && r1.textTd){
      question.text  = sanitizeHTML( texWrappersToQuillHTML(r1.textTd.innerHTML||'') );
    }
    if (!question.image && r1.imgTd){
      question.image = firstImgSrc(r1.imgTd);
    }

    const options = [
      cell(slice, coords.options[0].text),
      cell(slice, coords.options[1].text),
      cell(slice, coords.options[2].text),
      cell(slice, coords.options[3].text)
    ];
    options[0].image = cell(slice, coords.options[0].image).image;
    options[1].image = cell(slice, coords.options[1].image).image;
    options[2].image = cell(slice, coords.options[2].image).image;
    options[3].image = cell(slice, coords.options[3].image).image;

    const q = { reading, question, options, correct:-1 };
    detectCorrect(q, slice, coords, lookahead);

    const any = hasAnyContentPart(reading) || hasAnyContentPart(question) || options.some(hasAnyContentPart);
    return any ? q : null;
  }

  function parseWordHtmlToQuestions(html, rowsPerQuestion, coords, lookahead){
    const dom=new DOMParser().parseFromString(html,'text/html');
    const tables=Array.from(dom.querySelectorAll('table'));
    const out=[];
    tables.forEach(tbl=>{
      const rows=Array.from(tbl.querySelectorAll('tr'));
      let i=0;
      while(i<rows.length){
        while(i<rows.length && isRowEmpty(rows[i])) i++;
        if(i>=rows.length) break;
        const q = extractQuestion(rows, coords, i, rowsPerQuestion, lookahead);
        if (q) out.push(q);
        i += rowsPerQuestion;
      }
    });
    return out;
  }

  // ========= Controller =========
// داخل كلمة: استبدل دالة run() كاملة بهذه النسخة
async function run(){
  const files = Array.from(document.getElementById('wordFiles').files||[]);
  if (!files.length){ showNotification('اختر ملفات Word أولاً','error'); return; }

  const wordImportModeRadios = document.querySelector('input[name="wordImportMode"]:checked');
  const wordImportMode = (wordImportModeRadios?.value === 'replace') ? 'replace' : 'append';

  const review = document.getElementById('wordReviewBeforeImport')?.checked ?? true;
  const rowsPerQuestion = getNum('wp_rowsPerQuestion', 5);
  const lookahead = Math.max(0, Math.min(10, getNum('wp_lookahead', 3)));

  const coords = coordsFromUI();
  const all = [];

  for (const f of files){
    try{
      let html='';
      if (/\.(docx)$/i.test(f.name)) html = await readDocxAsHtml(f);
      else                           html = await readDocAsHtml(f);
      const qs = parseWordHtmlToQuestions(html, rowsPerQuestion, coords, lookahead);
      all.push(...qs);
    }catch(err){
      console.error(err);
      showNotification(`تعذّر تحويل الملف: ${f.name}`,'error');
    }
  }

  if (!all.length){ showNotification('لم أعثر على أسئلة في الملفات','error'); return; }

  // إزالة خلفية (اختياري)
  const cfg = readBgUI();
  if (cfg.enabled){
    for (const q of all){
      if (q.reading?.image)  q.reading.image  = await maybeBG(q.reading.image);
      if (q.question?.image) q.question.image = await maybeBG(q.question.image);
      for (const o of (q.options||[])){
        if (o?.image) o.image = await maybeBG(o.image);
      }
    }
  }

  // طبّع ثم راجع/ادمج
  const normalized = normalizeQuestions(all);
  if (review){
    openImportReviewModal(normalized, wordImportMode);
  } else {
    await finalizeImportApply(normalized, wordImportMode, /*stripExternal=*/true);
    const choice = wordImportMode === 'append' ? 'دمج' : 'استبدال';
    showNotification(`تم استيراد ${normalized.length} سؤالًا (${choice})`, 'success');
  }

  // تنظيف
  const inp=document.getElementById('wordFiles'); if (inp) inp.value='';
  const list=document.getElementById('wordFilesList'); if (list) list.innerHTML='';
}


  function resetCoords(){
    const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.value=val; };
    set('wp_r_reading',1); set('wp_c_reading',1); set('wp_r_reading_img',1); set('wp_c_reading_img',2);
    set('wp_r_question',2); set('wp_c_question',1); set('wp_r_question_img',2); set('wp_c_question_img',2);
    set('wp_r_opt1',3); set('wp_c_opt1',1); set('wp_r_opt2',3); set('wp_c_opt2',2); set('wp_r_opt3',4); set('wp_c_opt3',1); set('wp_r_opt4',4); set('wp_c_opt4',2);
    set('wp_r_opt1_img',3); set('wp_c_opt1_img',3); set('wp_r_opt2_img',3); set('wp_c_opt2_img',4); set('wp_r_opt3_img',4); set('wp_c_opt3_img',3); set('wp_r_opt4_img',4); set('wp_c_opt4_img',4);
    showNotification('تمت إعادة التعيين','success');
  }

  function bindUI(){
    // اختيار ملفات
    const btnChoose = document.getElementById('wordChooseFilesBtn');
    if (btnChoose) btnChoose.addEventListener('click', ()=> document.getElementById('wordFiles')?.click());
    const inp = document.getElementById('wordFiles');
    if (inp){
      inp.addEventListener('change', ()=>{
        const files = Array.from(inp.files||[]);
        const list=document.getElementById('wordFilesList');
        if (list) list.innerHTML = files.map(f=>`<span class="file-pill">${f.name}</span>`).join('');
      });
    }
    // تشغيل
    const runBtn = document.getElementById('wordImportRunBtn');
    if (runBtn){
      runBtn.addEventListener('click', ()=> runAction('wordImportRunBtn','جارٍ التحويل...','تحويل Word → أسئلة...', run));
    }
    // إعادة تعيين
    document.getElementById('wp_reset')?.addEventListener('click', resetCoords);
  }

  return { bindUI };
})();

/* ================== تشغيل أولي ================== */
function init(){
  try{
    const cached=localStorage.getItem(LS_KEY);
    if(cached){ 
      state.questions=normalizeQuestions(JSON.parse(cached)); 
      state.currentQuestionIndex=0; 
    } else {
      // إذا لم توجد بيانات محفوظة، أنشئ سؤالاً افتراضياً
      state.questions = [makeDefaultQuestion()];
      state.currentQuestionIndex = 0;
    }
  }catch(_){
    // في حالة وجود خطأ، أنشئ سؤالاً افتراضياً
    state.questions = [makeDefaultQuestion()];
    state.currentQuestionIndex = 0;
  }
  
  ensureOptionIds();
  renderSidebar(); 
  renderQuestion();
  setupEventListeners();
  restoreLastSaved();
  refreshIssuesUI();
  mountIssueToolbarAtTop();
  hideKeyboardHints();
  showNotification('جاهز: محرر الأسئلة التفاعلية ـ نصا عاديا/هتمل/معادلات رياضية ✅','success');
}
document.addEventListener('DOMContentLoaded', init);

// ——— أدوات إرجاء صغيرة ———
function debounce(fn, ms = 800) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ——— حفظ موحّد إلى localStorage مع تحديث وسم "آخر حفظ" ———
// استبدال كامل نظام الحفظ الحالي بهذا الكود البسيط
// استبدل دالة persistNow الحالية بهذا الكود المحسّن
function persistNow() {
  if (muteSaves > 0) return;
  
  try {
    // محاولة الحفظ مباشرة
    localStorage.setItem(LS_KEY, JSON.stringify(state.questions));
    dirty = false;
    
    // تحديث وقت الحفظ الأخير بدون إشعارات
    const stamp = new Date().toISOString();
    localStorage.setItem('last_saved_stamp', stamp);
    const pill = $('#lastSavedPill');
    if (pill) {
      const t = new Date(stamp).toLocaleString('ar-SA', {hour12: false});
      pill.textContent = `آخر تحديث: ${t}`;
    }
  } catch (err) {
    console.error("فشل في الحفظ:", err);
    
    // إذا كانت المساحة ممتلئة، نقوم بتنظيف شامل ثم إعادة المحاولة
    if (err.name === "QuotaExceededError" || err.code === 22) {
      try {
        // مسح كل شيء ما عدا البيانات الأساسية
        const essentialKeys = [LS_KEY, 'last_saved_stamp', 'last_saved_note'];
        const allKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          allKeys.push(localStorage.key(i));
        }
        
        // مسح جميع المفاتيح غير الضرورية
        for (const key of allKeys) {
          if (!essentialKeys.includes(key)) {
            localStorage.removeItem(key);
          }
        }
        
        // الآن حاول الحفظ مرة أخرى
        localStorage.setItem(LS_KEY, JSON.stringify(state.questions));
      } catch (err2) {
        console.error("فشل في الحفظ حتى بعد التنظيف الشامل:", err2);
        // إذا فشل كل شيء، توقف عن المحاولة لتجنب التكرار
        return;
      }
    }
  }
}

const persistDebounced = debounce(() => persistNow("Auto"), 800);
