/* All processing is local. No file bytes leave the browser. */
const $=id=>document.getElementById(id);
const allowed=new Set('pdf docx pptx xlsx xls csv tsv txt md json html htm png jpg jpeg webp bmp gif'.split(' '));
let queue=[],outputs=[],busy=false,collecting=false;
const droppedPaths=new WeakMap();
const filePath=file=>file.webkitRelativePath||droppedPaths.get(file)||file.name;
let outputDirectory=null,downloadChain=Promise.resolve();
const ext=name=>name.split('.').pop().toLowerCase();
const stem=name=>name.replace(/\.[^.]+$/,'');
const human=n=>n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
// Directory readers may return only 100 entries at a time; drain every batch.
async function collectDroppedFiles(transfer){
 const fallback=[...transfer.files],items=[...(transfer.items||[])];
 const rawEntries=items.map(item=>item.webkitGetAsEntry?.()),entries=rawEntries.filter(Boolean),files=[],errors=[];
 if(!entries.length)return {files:fallback,errors};
 async function visit(entry,parent=''){
  const path=parent+entry.name;
  try{
   if(entry.isFile){const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));droppedPaths.set(file,path);files.push(file)}
   else if(entry.isDirectory){const reader=entry.createReader();while(true){const batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!batch.length)break;for(const child of batch)await visit(child,path+'/')}}
  }catch(error){errors.push(path+': '+(error.message||'could not read'))}
 }
 for(const entry of entries)await visit(entry);
 // Retain ordinary files whose browser did not provide a directory entry.
 items.forEach((item,index)=>{if(!rawEntries[index]){const file=item.getAsFile?.();if(file&&!files.includes(file))files.push(file)}});
 files.sort((a,b)=>filePath(a).localeCompare(filePath(b),undefined,{numeric:true}));
 return {files,errors};
}
function registerOutput(output){
 const base=output.name.replace(/\.pdf$/i,'');let name=output.name,suffix=2;
 while(outputs.some(previous=>previous.name===name))name=base+` (${suffix++}).pdf`;
 output.name=name;outputs.push(output);return output;
}
function requestBrowserDownload(output){
 const anchor=el('a');anchor.href=output.url;anchor.download=output.name;
 document.body.append(anchor);anchor.click();anchor.remove();
}
async function downloadOutput(output){
 if(outputDirectory){
  const base=output.name.replace(/\.pdf$/i,'');let name=output.name,suffix=2;
  while(true){try{await outputDirectory.getFileHandle(name);name=base+` (${suffix++}).pdf`}catch(error){if(error.name==='NotFoundError')break;throw error}}
  const file=await outputDirectory.getFileHandle(name,{create:true});const writer=await file.createWritable();
  try{await writer.write(output.blob);await writer.close()}catch(error){try{await writer.abort()}catch{}throw error}
  output.downloadState='Saved to selected folder · '+name;output.savedToFolder=true;
 }else{
  requestBrowserDownload(output);output.downloadState='Download requested · allow multiple downloads if prompted';
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 output.downloadFailed=false;
}
function queueOutputDownloads(){
 if(!busy||!$('autoDownload').checked)return;
 for(const output of outputs){
  if(output.downloadQueued)continue;output.downloadQueued=true;
  downloadChain=downloadChain.then(async()=>{try{await downloadOutput(output)}catch(error){output.downloadFailed=true;output.downloadState='Save failed: '+error.message+' · use Download PDF to retry'}showOutputs()});
 }
}
async function finishDownloads(){
 await downloadChain;
 const saved=outputs.filter(o=>o.savedToFolder).length,requested=outputs.filter(o=>o.downloadQueued&&!o.savedToFolder&&!o.downloadFailed).length,failed=outputs.filter(o=>o.downloadFailed).length;
 $('downloadStatus').textContent=saved||requested||failed?`${saved} saved to selected folder · ${requested} browser download requests${failed?` · ${failed} saves failed; retry individual downloads`:''}.`:'';
}
$('chooseOutputFolder').hidden=typeof window.showDirectoryPicker!=='function';
$('chooseOutputFolder').onclick=async()=>{
 try{outputDirectory=await window.showDirectoryPicker({mode:'readwrite'});$('autoDownload').checked=true;$('downloadFolderNotice').textContent=`PDFs will be saved individually to ${outputDirectory.name}. Existing files will not be overwritten.`;}
 catch(error){if(error.name!=='AbortError')$('downloadFolderNotice').textContent='Folder permission was not granted. Browser downloads are still available.'}
};
$('downloadAll').onclick=async()=>{
 if(busy)return;$('downloadAll').disabled=true;
 for(const output of outputs){try{await downloadOutput(output)}catch(error){output.downloadFailed=true;output.downloadState='Save failed: '+error.message}}
 showOutputs();$('downloadAll').disabled=false;
};

function failureSnapshot(){
 const mode=document.querySelector('input[name="format"]:checked').value;
 return {busy,files:queue.map(item=>({file:item.file,path:filePath(item.file),size:item.file.size,lastModified:item.file.lastModified,
  mode:item.failureMode||mode,error:item.error||(item.state?.startsWith('Skipped')?item.skipReason||item.state:null),
  success:!item.error&&outputs.some(output=>output.sourceItem===item||output.sourceItems?.includes(item)),
  expectedMCQs:item.expectedMCQs,extractedMCQs:item.questions?.length}))};
}
function render(){
 window.dispatchEvent(new CustomEvent('pdf-conversion-state',{detail:failureSnapshot()}));
 $('count').textContent=queue.length+' files';$('queue').replaceChildren();
 if(!queue.length)$('queue').append(el('div','empty','Your conversion queue will appear here.'));
 for(const item of queue){const row=el('div','file');row.append(el('div','fileicon',ext(item.file.name).toUpperCase()));const info=el('div','fileinfo');info.append(el('div','filename',filePath(item.file)),el('div','filemeta'+(item.error?' error':''),item.error||`${human(item.file.size)} · ${item.state||'Ready'}`));const result=outputs.find(o=>o.sourceItem===item);if(result){const download=el('a','download','Download PDF');download.href=result.url;download.download=result.name;row.append(info,download)}else row.append(info);const remove=el('button','textbtn','×');remove.setAttribute('aria-label','Remove '+item.file.name);remove.disabled=busy;remove.onclick=()=>{queue=queue.filter(i=>i!==item);render()};row.append(remove);$('queue').append(row)}
 const format=document.querySelector('input[name="format"]:checked').value,quiz=format==='quiz';$('quizMode').checked=quiz;$('legacyOptions').hidden=format!=='original';$('studyOptions').hidden=format!=='study';$('modeNotice').hidden=format!=='original';$('quizHint').hidden=!quiz;
 $('convert').disabled=busy||collecting||!queue.some(i=>!i.unsupported);
 $('convert').firstChild.textContent=quiz?($('combineMode').checked?'Create one combined quiz PDF ':`Convert all ${queue.filter(item=>!item.unsupported).length} files to separate quiz PDFs `):format==='study'?'Create colourful study notes PDFs ':'Keep original pages with notes ';
 $('clear').disabled=busy||collecting||!queue.length;$('files').disabled=busy||collecting;$('folders').disabled=busy||collecting;$('demo').disabled=busy||collecting;$('autoDownload').disabled=busy;$('chooseOutputFolder').disabled=busy;$('downloadAll').disabled=busy||!outputs.length;
 for(const id of ['title','quizMode','combineMode','index','mcqs','notes','checks','size','studySize'])$(id).disabled=busy;
 document.querySelectorAll('input[name="format"]').forEach(input=>input.disabled=busy);
}
function add(files){if(busy)return;let added=0;for(const file of files){if(queue.some(i=>filePath(i.file)===filePath(file)&&i.file.size===file.size&&i.file.lastModified===file.lastModified))continue;const bad=!allowed.has(ext(file.name));queue.push({file,unsupported:bad,error:bad?'Unsupported format. Export to PDF in the original app first.':null});added++}render();$('status').textContent=added?`${added} file(s) added. Choose your options and convert.`:'These files are already in your queue.';}
$('files').onchange=e=>{add(e.target.files);e.target.value=''};
$('folders').onchange=e=>{add([...e.target.files].sort((a,b)=>filePath(a).localeCompare(filePath(b),undefined,{numeric:true})));e.target.value=''};
$('drop').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('files').click()}};
for(const type of ['dragenter','dragover'])$('drop').addEventListener(type,e=>{e.preventDefault();$('drop').classList.add('drag')});
$('drop').addEventListener('dragleave',e=>{e.preventDefault();$('drop').classList.remove('drag')});
$('drop').addEventListener('drop',async e=>{
 e.preventDefault();$('drop').classList.remove('drag');if(busy||collecting)return;
 collecting=true;render();$('status').textContent='Reading dropped files and subfolders…';
 try{const result=await collectDroppedFiles(e.dataTransfer);collecting=false;add(result.files);if(result.errors.length)$('status').textContent+=` ${result.errors.length} unreadable folder entries: ${result.errors.join('; ')}`;}
 catch(error){$('status').textContent='Could not read this folder: '+error.message}
 finally{collecting=false;render()}
});
$('clear').onclick=()=>{queue=[];render();$('status').textContent='Add a file to get started.'};
$('demo').onclick=()=>add([new File(['Q1. What is the first-line lifestyle advice for impaired fasting glucose?\nA. Antibiotics\nB. Diet and exercise\nC. Anticoagulation\nD. Surgery\nE. No lifestyle changes\nAnswer: B\nExplanation: Diet and exercise are the initial measures.'],'Sample question bank.txt',{type:'text/plain'})]);$('quizMode').onchange=render;$('combineMode').onchange=render;
document.querySelectorAll('input[name="format"]').forEach(input=>input.onchange=render);
async function rasterImage(data){const url=data instanceof Blob?URL.createObjectURL(data):data;try{const im=new Image();im.src=url;await im.decode();const scale=Math.min(1,2400/Math.max(im.naturalWidth,im.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,im.naturalWidth*scale);c.height=Math.max(1,im.naturalHeight*scale);const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.92)}finally{if(data instanceof Blob)URL.revokeObjectURL(url)}}
async function contentBlocks(file){const type=ext(file.name),buf=await file.arrayBuffer();if(['png','jpg','jpeg','webp','bmp','gif'].includes(type))return [{image:await rasterImage(file)}];if(type==='docx'){const result=await mammoth.convertToHtml({arrayBuffer:buf});const dom=new DOMParser().parseFromString(result.value,'text/html');const blocks=[];for(const node of dom.body.children){if(node.textContent.trim())blocks.push({text:node.textContent});for(const im of node.querySelectorAll('img'))if(im.src.startsWith('data:image/')){try{blocks.push({image:await rasterImage(im.src)})}catch{blocks.push({text:'[An embedded image could not be converted.]'})}}}return blocks;}
if(type==='pptx'){const zip=await JSZip.loadAsync(buf);const names=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>parseInt(a.match(/slide(\d+)/)[1])-parseInt(b.match(/slide(\d+)/)[1]));const blocks=[];for(let i=0;i<names.length;i++){const name=names[i];const dom=new DOMParser().parseFromString(await zip.file(name).async('text'),'application/xml');const texts=Array.from(dom.getElementsByTagNameNS('*','t')).map(n=>n.textContent);blocks.push({text:`Slide ${i+1}\n\n${texts.join('\n')}`,newPage:true});const relName=name.replace('/slides/','/slides/_rels/')+'.rels';const relFile=zip.file(relName);if(relFile){const rel=new DOMParser().parseFromString(await relFile.async('text'),'application/xml');const targets=new Map(Array.from(rel.getElementsByTagName('Relationship')).filter(n=>n.getAttribute('TargetMode')!=='External').map(n=>[n.getAttribute('Id'),n.getAttribute('Target')]));for(const blip of Array.from(dom.getElementsByTagNameNS('*','blip'))){const rid=blip.getAttribute('r:embed');const target=targets.get(rid);if(!target)continue;const parts=('ppt/slides/'+target).split('/'),clean=[];for(const p of parts){if(p==='..')clean.pop();else if(p!=='.')clean.push(p)}const asset=zip.file(clean.join('/'));if(asset){try{blocks.push({image:await rasterImage(new Blob([await asset.async('uint8array')]))})}catch{blocks.push({text:'[Unsupported slide graphic. Export the presentation to PDF for full fidelity.]'})}}}}}return blocks;}
if(['xlsx','xls','csv','tsv'].includes(type)){const wb=XLSX.read(new Uint8Array(buf),{type:'array'});return wb.SheetNames.map(n=>({text:n+'\n\n'+XLSX.utils.sheet_to_csv(wb.Sheets[n],{FS:'  |  '}),newPage:true}))}let text=await file.text();if(type==='html'||type==='htm'){const dom=new DOMParser().parseFromString(text,'text/html');dom.querySelectorAll('script,style,iframe,object,embed').forEach(n=>n.remove());dom.querySelectorAll('p,div,br,li,h1,h2,h3,tr').forEach(n=>n.append('\n'));text=dom.body.textContent}return [{text}];}
async function makeSource(file,size){if(ext(file.name)==='pdf'){try{return await PDFLib.PDFDocument.load(await file.arrayBuffer())}catch(e){throw new Error('This PDF cannot be opened. Remove its password in the original app, or export a fresh PDF.')}}const doc=await PDFLib.PDFDocument.create();const raw=await contentBlocks(file);const blocks=[];for(const b of raw){const prev=blocks[blocks.length-1];if(b.text&&prev?.text&&!b.newPage)prev.text+='\n\n'+b.text;else blocks.push(b)}for(const b of blocks){if(b.image){const im=await doc.embedJpg(b.image);const page=doc.addPage([595.28,841.89]);const k=Math.min(499/im.width,746/im.height);page.drawImage(im,{x:(595.28-im.width*k)/2,y:(841.89-im.height*k)/2,width:im.width*k,height:im.height*k});continue}const text=(b.text||'').replace(/\r/g,'').replace(/\t/g,'    ');if(!text.trim())continue;const canvas=document.createElement('canvas');canvas.width=1190;canvas.height=1684;const ctx=canvas.getContext('2d');const font=size*2,line=font*1.5,left=96,top=110,bottom=1560,width=998;let y=top;function reset(){ctx.fillStyle='white';ctx.fillRect(0,0,1190,1684);ctx.fillStyle='#172239';ctx.font=`${font}px Arial, sans-serif`;ctx.textBaseline='top';y=top}async function flush(){const im=await doc.embedJpg(canvas.toDataURL('image/jpeg',.95));const p=doc.addPage([595,842]);p.drawImage(im,{x:0,y:0,width:595,height:842});reset();await new Promise(r=>setTimeout(r,0))}reset();for(const paragraph of text.split('\n')){let row='';const words=paragraph.split(/(\s+)/);for(let word of words){if(ctx.measureText(row+word).width<=width){row+=word;continue}if(row){ctx.fillText(row,left,y);y+=line;row='';if(y+line>bottom)await flush()}while(ctx.measureText(word).width>width){let chunk='';for(const char of word){if(ctx.measureText(chunk+char).width>width)break;chunk+=char}if(!chunk)break;ctx.fillText(chunk,left,y);y+=line;word=word.slice(chunk.length);if(y+line>bottom)await flush()}row=word.trimStart()}ctx.fillText(row,left,y);y+=line;if(y+line>bottom)await flush()}if(y>top)await flush()}if(!doc.getPageCount())throw new Error('No readable text or images were found. Export this file to PDF in its original app.');return doc;}
const ascii=s=>s.replace(/[^\x20-\x7E]/g,'?');
function safeText(s,font,size,width){s=ascii(s);while(s&&font.widthOfTextAtSize(s,size)>width)s=s.slice(0,-1);return s;}
function link(doc,page,label,x,y,target,font){page.drawText(label,{x,y,size:11,font,color:PDFLib.rgb(.18,.3,.85)});const annot=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[x,y-3,x+Math.min(490,font.widthOfTextAtSize(label,11)),y+14],Border:[0,0,0],Dest:[target.ref,'Fit']}));page.node.addAnnot(annot);}
async function interactive(doc,title,opts){const {rgb}=PDFLib;const regular=await doc.embedFont(PDFLib.StandardFonts.Helvetica),bold=await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);const source=[...doc.getPages()];const n=source.length,form=doc.getForm();const prefix='studio_'+Date.now()+'_'+Math.random().toString(36).slice(2);const indices=[];const perIndex=28;const worksheetPages=[];
function heading(page,kind){page.drawRectangle({x:0,y:824,width:595,height:18,color:rgb(.18,.3,1)});page.drawText(kind,{x:48,y:774,size:22,font:bold,color:rgb(.09,.14,.24)});page.drawText(safeText(title,regular,11,490),{x:48,y:750,size:11,font:regular,color:rgb(.4,.45,.55)});page.drawText('PDF Interactive Studio',{x:48,y:28,size:9,font:regular,color:rgb(.5,.55,.65)});}
if(opts.index){for(let i=0;i<Math.ceil(n/perIndex);i++){const p=doc.insertPage(i,[595,842]);heading(p,'Your page index');indices.push(p)}for(let i=0;i<n;i++){const p=indices[Math.floor(i/perIndex)];link(doc,p,`Source page ${i+1}`,52,704-(i%perIndex)*21,source[i],regular)}}
if(opts.notes||opts.checks){const count=opts.checks?Math.ceil(n/18):1;for(let k=0;k<count;k++){const p=doc.addPage([595,842]);heading(p,'Reading worksheet'+(count>1?` ${k+1}`:''));worksheetPages.push(p);let y=704;if(opts.checks){p.drawText('Mark completed pages',{x:48,y,size:12,font:bold});y-=30;for(let i=k*18;i<Math.min(n,(k+1)*18);i++){const c=form.createCheckBox(prefix+'_review_'+i);c.addToPage(p,{x:50,y:y-3,width:13,height:13,borderWidth:1,borderColor:rgb(.5,.58,.75)});link(doc,p,`Source page ${i+1}`,76,y,source[i],regular);y-=23;}}if(opts.notes){y-=20;p.drawText('My notes',{x:48,y,size:12,font:bold});const field=form.createTextField(prefix+'_notes_'+k);field.enableMultiline();const height=Math.max(115,y-108);field.addToPage(p,{x:48,y:80,width:499,height,borderWidth:1,borderColor:rgb(.72,.77,.87),backgroundColor:rgb(.98,.985,1)});field.setFontSize(12);}if(indices.length)link(doc,p,'Back to page index',400,28,indices[0],regular);}}
for(let i=0;i<indices.length;i++){const p=indices[i];if(i>0)link(doc,p,'Previous index',48,62,indices[i-1],regular);if(i+1<indices.length)link(doc,p,'Next index',220,62,indices[i+1],regular);if(worksheetPages.length)link(doc,p,'Open worksheet',400,62,worksheetPages[0],regular)}doc.setTitle(title);doc.setCreator('PDF Interactive Studio');return {bytes:await doc.save(),pages:doc.getPageCount(),sourcePages:n,mcqs:opts.mcqCount||0};}
function showOutputs(){ queueOutputDownloads();window.dispatchEvent(new Event('quiz-ready'));  $('results').hidden=!outputs.length;$('zip').hidden=outputs.length<=1;$('outputs').replaceChildren();for(const o of outputs){const row=el('div','output');const info=el('div','filename',o.name);info.append(el('small','',o.quiz?`${o.mcqs} interactive questions · ${o.pages} total pages · ${human(o.blob.size)}`:o.study?`${o.notesPages} styled notes pages · ${o.sourcePages?`${o.sourcePages} original pages appended · `:''}${o.pages} total pages · ${human(o.blob.size)}`:`Original layout · ${o.sourcePages} source pages · ${o.mcqs} ungraded choice markers · ${o.pages} total pages · ${human(o.blob.size)}`));const a=el('a','download','Download PDF');a.href=o.url;a.download=o.name;if(o.downloadState)info.append(el('small',o.downloadFailed?'error':'',o.downloadState));row.append(el('div','fileicon','PDF'),info,a);$('outputs').append(row)}}
function setProgress(value,message){$('progress').hidden=false;$('progress').value=Math.max(0,Math.min(100,value));$('progress').setAttribute('aria-label',message);$('status').textContent=message;}
function explicitQuestionCount(text){return (String(text).match(/^\s*(?:Q(?:uestion)?\s*[-.:#]?\s*\d+[.)]?|\d+[.)])(?:\s+|$)/gim)||[]).length;}
let ocrScriptPromise;
function loadOcrEngine(){
 if(!ocrScriptPromise)ocrScriptPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='vendor/tesseract.min.js';
  script.onload=()=>resolve();script.onerror=()=>reject(new Error('OCR engine could not load. Check the connection and try again.'));
  document.head.append(script);
 });
 return ocrScriptPromise;
}
async function ocrPdfPages(pdfjs,pages,report,recognizeScannedPage){
 await loadOcrEngine();
 const root=new URL('./vendor/',location.href).href;
 let worker;const recognized=new Map(),imageQuestions=[];
 try{
  report(0,`Loading English OCR model for ${pages.length} scanned page(s)…`);
  worker=await Tesseract.createWorker('eng',1,{
   workerPath:root+'worker.min.js',corePath:root+'ocr-core',langPath:root+'ocr-lang',workerBlobURL:false
  });
  for(let index=0;index<pages.length;index++){
   const number=pages[index],page=await pdfjs.getPage(number),base=page.getViewport({scale:1});
   const scale=Math.min(2.2,2400/Math.max(base.width,base.height));
   const viewport=page.getViewport({scale});
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   try{
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    const result=await recognizeScannedPage(canvas,worker,number,imageQuestions.at(-1));
    if(result.kind==='question')imageQuestions.push(result.question);
    else if(result.kind==='feedback'){
     const question=imageQuestions.at(-1);question.answer=result.answer;question.explanation=result.explanation;question.verified=true;
    }else recognized.set(number,result.text||'');
    report((index+1)/pages.length,`OCR page ${index+1} of ${pages.length} · source page ${number} · ${imageQuestions.length} MCQs found`);
   }finally{canvas.width=0;canvas.height=0;page.cleanup?.();}
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 }finally{await worker?.terminate();}
 return {recognized,imageQuestions};
}
async function readExistingQuiz(file){
 if(ext(file.name)!=='pdf')return null;
 let doc;
 try{doc=await PDFLib.PDFDocument.load(new Uint8Array(await file.arrayBuffer()));}catch{return null;}
 if(doc.getCreator()!=='PDF Interactive Studio - Quiz PDF')return null;
 let questionCount=Number(/question-count:(\d+)/.exec(doc.getKeywords()||'')?.[1]);
 if(!questionCount){
  // Quiz PDFs made before the count was stored also show it on the first page.
  const {getDocument,GlobalWorkerOptions}=await import('./vendor/pdf.mjs');
  GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;
  const pdfjs=await getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  try{
   const first=(await (await pdfjs.getPage(1)).getTextContent()).items.map(i=>i.str||'').join(' ');
   questionCount=Number(/QUESTION\s+1\s*\/\s*(\d+)/i.exec(first)?.[1]);
  }finally{await pdfjs.destroy();}
 }
 if(!Number.isSafeInteger(questionCount)||questionCount<1)throw new Error('This quiz PDF has no readable question count. Please upload the original exported quiz PDF.');
 return {doc,questionCount,originalPageCount:doc.getPageCount(),title:doc.getTitle()||stem(file.name)};
}
async function extractQuiz(item,report=setProgress){
 const {parseBmj,parseMyPastest,parseStructured,parseVisualOptionBank,textLinesFromItems,inferBmjAnswerColors,captureBmjFigures,captureMyPastestFigures,captureVisualFigures,recognizeScannedPage,extractPairedImageBank}=await import('./quiz.mjs?v=20261015e');
 if(ext(item.file.name)==='pdf'){
  const {getDocument,GlobalWorkerOptions}=await import('./vendor/pdf.mjs');GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;
  const pdfjs=await getDocument({data:new Uint8Array(await item.file.arrayBuffer()),disableFontFace:true}).promise;
  try{
   const pages=[];
   for(let p=1;p<=pdfjs.numPages;p++){
    pages.push((await (await pdfjs.getPage(p)).getTextContent()).items);
    if(p%10===0||p===pdfjs.numPages){item.state=`Reading ${p}/${pdfjs.numPages} pages`;report(p/pdfjs.numPages*50,`${item.file.name}: reading page ${p} of ${pdfjs.numPages} (${Math.round(p/pdfjs.numPages*50)}%)`);render();await new Promise(r=>setTimeout(r,0));}
   }
   const pairedPages=pdfjs.numPages%2===0&&pages.every((items,index)=>{
    const text=items.map(i=>i.str||'').join(' ');
    return text.includes('MRCP Part 1 Study Library')&&text.includes(`Page ${index+1} of ${pdfjs.numPages}`);
   });
   if(pairedPages){
    item.state=`Preserving 0/${pdfjs.numPages/2} source questions`;render();
    const all=await extractPairedImageBank(pdfjs,(done,total)=>{
     item.state=`Preserving ${done}/${total} source questions`;
     report(50+done/total*35,`${item.file.name}: preserved ${done} of ${total} question/answer pairs`);render();
    });
    item.expectedMCQs=pdfjs.numPages/2;
    if(all.length!==item.expectedMCQs)throw new Error('Source and output MCQ counts differ. Incomplete PDF blocked.');
    return all;
   }
   const myPastest=parseMyPastest(pages);
   if(myPastest.length){item.expectedMCQs=new Set(pages.flatMap(items=>items.map(i=>/questionIndex=(\d+)/i.exec(i.str||'')).filter(Boolean).map(m=>m[1]))).size;if(myPastest.length!==item.expectedMCQs)throw new Error(`Source has ${item.expectedMCQs} distinct question indexes, but ${myPastest.length} were extracted.`);item.state='Preserving clinical figures…';render();await captureMyPastestFigures(pdfjs,myPastest,(done,total)=>report(55+done/total*30,`${item.file.name}: checking figures ${done}/${total}`));return myPastest;}
   const bmj=parseBmj(pages);if(bmj.length){item.expectedMCQs=new Set(pages.flatMap(items=>items.map(i=>/Question\s+(\d+)\s+of\s+(\d+)/i.exec(i.str||'')).filter(Boolean).map(m=>`${m[2]}-${m[1]}`))).size;await inferBmjAnswerColors(pdfjs,bmj,(done,total)=>{item.state=`Checking answer key ${done}/${total}`;report(50+done/total*25,`${item.file.name}: checking answers ${done} of ${total} (${Math.round(50+done/total*25)}%)`);render()});item.state='Preserving question figures…';report(75,`${item.file.name}: preserving question figures (75%)`);render();await captureBmjFigures(pdfjs,bmj,(done,total)=>report(75+done/total*5,`${item.file.name}: preserving figure ${done} of ${total} (${Math.round(75+done/total*5)}%)`));return bmj;}
   const visual=parseVisualOptionBank(pages);
   if(visual.length){item.state=`Found ${visual.length} questions`;report(55,`${item.file.name}: ${visual.length} questions found; preserving source tables`);render();await captureVisualFigures(pdfjs,visual);return visual;}
   const pageTexts=pages.map(items=>textLinesFromItems(items).join('\n'));
   let questions=parseStructured(pageTexts.join('\n'));
   // Image-only banks often include selectable headers and page numbers (~80 characters).
   const scanned=pageTexts.map((text,index)=>text.trim().length<180?index+1:null).filter(Boolean);
   if(!scanned.length&&questions.length){item.expectedMCQs=explicitQuestionCount(pageTexts.join('\n'));return questions;}
   if(!scanned.length){item.skipReason='No recognized MCQs in selectable text';return [];}
   item.state=`OCR: 0/${scanned.length} pages`;render();
   const {recognized,imageQuestions}=await ocrPdfPages(pdfjs,scanned,(fraction,message)=>{
    item.state=`OCR: ${Math.round(fraction*scanned.length)}/${scanned.length} pages`;
    report(50+fraction*35,`${item.file.name}: ${message}`);render();
   },recognizeScannedPage);
   for(const [number,text] of recognized)pageTexts[number-1]=text;
   questions=[...parseStructured(pageTexts.join('\n')),...imageQuestions];
   if(!questions.length){item.skipReason=`OCR read ${scanned.length} page(s); no MCQs recognized`;return [];}
   return questions;
  }finally{await pdfjs.destroy()}
 }
 if(['png','jpg','jpeg','webp','bmp','gif'].includes(ext(item.file.name))){
  await loadOcrEngine();const root=new URL('./vendor/',location.href).href;
  let worker;try{report(10,`${item.file.name}: loading OCR model`);worker=await Tesseract.createWorker('eng',1,{workerPath:root+'worker.min.js',corePath:root+'ocr-core',langPath:root+'ocr-lang',workerBlobURL:false});const {data}=await worker.recognize(await rasterImage(item.file));report(80,`${item.file.name}: OCR complete`);return parseStructured(data.text||'');}finally{await worker?.terminate();}
 }
 const blocks=await contentBlocks(item.file),text=blocks.map(b=>b.text||'').join('\n');
 item.expectedMCQs=explicitQuestionCount(text);
 return parseStructured(text);
}
async function convert(retryItems=null){
 const activeQueue=Array.isArray(retryItems)?retryItems:queue;
 if(busy||collecting)return;busy=true;downloadChain=Promise.resolve();$('downloadStatus').textContent='';if(!Array.isArray(retryItems)){outputs.forEach(o=>URL.revokeObjectURL(o.url));outputs=[];}showOutputs();render();
 const candidates=activeQueue.filter(i=>!i.unsupported),quiz=$('quizMode').checked;
 const opts={index:$('index').checked,notes:$('notes').checked,checks:$('checks').checked,mcqs:$('mcqs').checked};
 if(document.querySelector('input[name="format"]:checked').value==='study'){
  const {buildStudyPdf}=await import('./study.mjs?v=20261016a');let done=0,failed=0;
  try{
   for(const item of activeQueue){
    if(item.unsupported){item.failureMode=document.querySelector('input[name="format"]:checked').value;item.error=null;item.state='Skipped · unsupported format';done++;render();continue}
    item.failureMode=document.querySelector('input[name="format"]:checked').value;item.error=null;item.state='Formatting notes…';render();
    try{
     const title=$('title').value.trim()||stem(item.file.name);
     const result=await buildStudyPdf(item.file,title,Number($('studySize').value),contentBlocks,(fraction,message)=>{
      item.state=message;setProgress((done+fraction)/activeQueue.length*100,`${item.file.name}: ${message}`);render();
     });
     const blob=new Blob([result.bytes],{type:'application/pdf'});
     let name=stem(item.file.name)+'-study-notes.pdf';if(outputs.some(o=>o.name===name))name=stem(item.file.name)+`-${done+1}-study-notes.pdf`;
     registerOutput({...result,bytes:undefined,study:true,sourceItem:item,blob,url:URL.createObjectURL(blob),name});
     item.state=`Ready · ${result.notesPages} styled pages${result.sourcePages?` + ${result.sourcePages} original pages`:''}`;
    }catch(e){item.error=e.message||'Could not format these notes';failed++}
    done++;setProgress(done/activeQueue.length*100,`${done}/${activeQueue.length} checked · ${outputs.length} notes PDFs ready · ${failed} failed`);
    render();showOutputs();await new Promise(resolve=>setTimeout(resolve,0));
   }
  }finally{showOutputs();await finishDownloads();busy=false;render();showOutputs();if(outputs.length)$('results').scrollIntoView?.({behavior:'smooth'})}
  return;
 }
 if(quiz&&!$('combineMode').checked){
  const {buildQuizPdf}=await import('./quiz.mjs?v=20261015e');let done=0,skipped=0,failed=0;
  try{
   for(const item of activeQueue){
    if(item.unsupported){item.failureMode=document.querySelector('input[name="format"]:checked').value;item.error=null;item.state='Skipped · unsupported format';skipped++;done++;render();continue;}
    item.failureMode='quiz';item.error=null;item.expectedMCQs=null;item.state='Analyzing…';render();
    try{
     const previous=await readExistingQuiz(item.file);
     if(previous&&previous.originalPageCount!==previous.questionCount*6){
      const name=stem(item.file.name).replace(/-quiz$/i,'')+'-quiz.pdf';
      const blob=new Blob([await previous.doc.save()],{type:'application/pdf'});
      registerOutput({quiz:true,sourceItem:item,blob,url:URL.createObjectURL(blob),name,mcqs:previous.questionCount,pages:previous.originalPageCount});
      item.expectedMCQs=previous.questionCount;item.state=`Ready · ${previous.questionCount} MCQs · already-interactive pages preserved`;
     }else{
     if(previous){
      const {getDocument,GlobalWorkerOptions}=await import('./vendor/pdf.mjs');
      const {extractLegacyQuizPdf}=await import('./quiz.mjs?v=20261015e');
      GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;
      const pdfjs=await getDocument({data:new Uint8Array(await item.file.arrayBuffer())}).promise;
      try{item.questions=await extractLegacyQuizPdf(pdfjs,(current,total)=>setProgress((done+current/total*.75)/activeQueue.length*90,`${item.file.name}: restoring ${current}/${total} questions`));}
      finally{await pdfjs.destroy();}
      item.expectedMCQs=previous.questionCount;
     }else item.questions=await extractQuiz(item,(value,message)=>setProgress((done+value/100)/activeQueue.length*90,`${item.file.name}: ${message}`));
     if(!item.questions.length){item.state=`Skipped · ${item.skipReason||'no MCQs found'}`;skipped++;}
     else if(!Number.isInteger(item.expectedMCQs)||item.expectedMCQs<1)throw new Error('Source MCQ count cannot be verified for this layout. No incomplete PDF was exported.');
     else if(item.questions.length!==item.expectedMCQs)throw new Error(`Source has ${item.expectedMCQs} MCQs, but ${item.questions.length} were extracted. Incomplete PDF blocked.`);
     else {
      item.state=`Building ${item.expectedMCQs} questions…`;render();
      const title=$('title').value.trim()||previous?.title||stem(item.file.name);
      const result=await buildQuizPdf(item.questions,title,(current,total)=>setProgress((done+.75+current/total*.2)/activeQueue.length*100,`${item.file.name}: building ${current}/${total}`));
      if(result.mcqs!==item.expectedMCQs)throw new Error('Output MCQ count mismatch. Incomplete PDF blocked.');
      const blob=new Blob([result.bytes],{type:'application/pdf'});let name=previous?stem(item.file.name).replace(/-quiz$/i,'')+'-updated-quiz.pdf':stem(item.file.name)+'-quiz.pdf';
      if(outputs.some(o=>o.name===name))name=stem(item.file.name)+`-${done+1}-quiz.pdf`;
      registerOutput({...result,quiz:true,sourceItem:item,blob,url:URL.createObjectURL(blob),name,bytes:undefined});
      item.state=`Ready · ${result.mcqs}/${item.expectedMCQs} MCQs · ${result.pages} pages`;
     }
     }
    }catch(e){item.error=e.message||'Could not verify this question bank';failed++;}
    done++;setProgress(done/activeQueue.length*100,`${done}/${activeQueue.length} files checked · ${outputs.length} ready · ${failed} failed · ${skipped} skipped`);
    render();showOutputs();await new Promise(resolve=>setTimeout(resolve,0));
   }
  }finally{showOutputs();await finishDownloads();busy=false;render();showOutputs();if(outputs.length)$('results').scrollIntoView?.({behavior:'smooth'});}
  return;
 }
 if(quiz){
  const allQuestions=[],included=[],skipped=[],failed=[];let currentItem=null,existing=null,baseTitle='',sawBase=false;
  try{
   if(!candidates.length)throw new Error('Add a question bank to begin.');
   for(const item of activeQueue.filter(i=>i.unsupported)){item.failureMode=document.querySelector('input[name="format"]:checked').value;item.error=null;item.state='Skipped · unsupported format';skipped.push(item);}
   for(let i=0;i<candidates.length;i++){
    const item=candidates[i];currentItem=item;item.error=null;item.skipReason=null;item.state='Analyzing…';render();
    try{
     await new Promise(resolve=>setTimeout(resolve,0));
     const previous=await readExistingQuiz(item.file);
     if(previous){
      if(sawBase)throw new Error('Add only one existing quiz PDF as the continuation base.');
      sawBase=true;baseTitle=previous.title;
      if(previous.originalPageCount===previous.questionCount*6){
       const {getDocument,GlobalWorkerOptions}=await import('./vendor/pdf.mjs');
       const {extractLegacyQuizPdf}=await import('./quiz.mjs?v=20261015e');
       GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;
       const pdfjs=await getDocument({data:new Uint8Array(await item.file.arrayBuffer())}).promise;
       try{item.questions=await extractLegacyQuizPdf(pdfjs,(current,total)=>setProgress(Math.round((i+current/total)/candidates.length*75),`${item.file.name}: restoring old quiz ${current}/${total}`));}
       finally{await pdfjs.destroy();}
       if(item.questions.length!==previous.questionCount)throw new Error('Old quiz count mismatch. Incomplete PDF blocked.');
       item.expectedMCQs=previous.questionCount;allQuestions.push(...item.questions);included.push(item);
       item.state=`Restored old quiz · ${previous.questionCount} questions`;
      }else{existing=previous;item.state=`Base quiz · ${previous.questionCount} questions`;}
      render();setProgress(Math.round((i+1)/candidates.length*75),`Existing quiz loaded: ${previous.questionCount} questions. Reading new files…`);
      continue;
     }
     if(!item.questions?.length)item.questions=await extractQuiz(item,(value,message)=>{
      const percent=Math.round((i+value/100)/candidates.length*75);
      setProgress(percent,`${message.replace(/ \(\d+%\)$/,'')} · file ${i+1}/${candidates.length} (${percent}%)`);
     });
     if(!item.questions.length){item.state=`Skipped · ${item.skipReason||'no recognizable MCQs found'}`;skipped.push(item);}
     else if(!Number.isInteger(item.expectedMCQs)||item.expectedMCQs<1)throw new Error('Source MCQ count cannot be verified. Incomplete PDF blocked for this file.');
     else if(item.questions.length!==item.expectedMCQs)throw new Error(`Source has ${item.expectedMCQs} MCQs, but ${item.questions.length} were extracted. Incomplete PDF blocked.`);
     else {allQuestions.push(...item.questions);included.push(item);item.state=`Included · ${item.questions.length} questions`;}
    }catch(e){item.error=e.message||'Could not read this file';failed.push(item);}
    setProgress(Math.round((i+1)/candidates.length*75),`Checked ${i+1} of ${candidates.length} files · ${allQuestions.length} questions found`);render();
   }
   if(!allQuestions.length){setProgress(100,`No new recognizable MCQs found. ${skipped.length} skipped${failed.length?`, ${failed.length} failed`:''}. See the file list.`);return;}
   const title=baseTitle||$('title').value.trim()||stem(included[0].file.name);
   const {buildQuizPdf}=await import('./quiz.mjs?v=20261015e');
   const result=await buildQuizPdf(allQuestions,title,(current,total,phase)=>{
    const percent=Math.round(75+(phase?24:current/total*24));
    setProgress(percent,`${phase||'Building combined quiz'}: ${current} of ${total} questions (${percent}%)`);
   },existing);
   const blob=new Blob([result.bytes],{type:'application/pdf'});
   const filename=(title.replace(/[\\/:*?"<>|]/g,'-').trim().slice(0,90)||'Question Bank')+'-quiz.pdf';
   registerOutput({...result,quiz:true,sourceItems:included,bytes:undefined,blob,url:URL.createObjectURL(blob),name:filename});
   const unknown=allQuestions.filter(q=>!Number.isInteger(q.answer)).length;
   setProgress(100,`One PDF ready: ${result.mcqs} total questions${existing?` (${existing.questionCount} existing + ${allQuestions.length} new)`:` from ${included.length} file(s)`}; ${skipped.length} skipped${failed.length?`, ${failed.length} failed`:''}${unknown?`; ${unknown} new with no answer`:''}.`);
  }catch(e){
   if(currentItem)currentItem.error=e.message||'Question extraction failed.';
   setProgress(0,e.message||'Conversion failed. Check the file queue.');
  }finally{showOutputs();await finishDownloads();busy=false;render();showOutputs();if(outputs.length)$('results').scrollIntoView?.({behavior:'smooth'});}
  return;
 }
 let done=0;setProgress(0,'Starting conversion (0%)');
 for(const item of candidates){
  item.failureMode=document.querySelector('input[name="format"]:checked').value;item.error=null;item.state='Converting…';render();
  try{
   await new Promise(resolve=>setTimeout(resolve,30));
   const title=$('title').value.trim()||stem(item.file.name);let result;
   {
    setProgress(done/candidates.length*100,`Converting ${item.file.name}`);
    const doc=await makeSource(item.file,Number($('size').value));let mcqCount=0;
    if(opts.mcqs&&ext(item.file.name)==='pdf'){
     const {getDocument,GlobalWorkerOptions}=await import('./vendor/pdf.mjs');GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;
     const pdfjs=await getDocument({data:new Uint8Array(await item.file.arrayBuffer()),disableFontFace:true}).promise;
     try{const pages=[];for(let p=1;p<=pdfjs.numPages;p++)pages.push((await (await pdfjs.getPage(p)).getTextContent()).items);const {detectQuestions,addMcqWidgets}=await import('./mcq.mjs');mcqCount=addMcqWidgets(doc,detectQuestions(pages));}finally{await pdfjs.destroy()}
    }
    result=await interactive(doc,title,{...opts,mcqCount});
   }
   const blob=new Blob([result.bytes],{type:'application/pdf'});
   let name=stem(item.file.name)+'-original-layout.pdf';
   if(outputs.some(o=>o.name===name))name=stem(item.file.name)+`-${done+1}-original-layout.pdf`;
   registerOutput({...result,bytes:undefined,sourceItem:item,blob,url:URL.createObjectURL(blob),name});item.state='Converted';
  }catch(e){item.error=e.message||'Conversion failed. Try a text-based question bank.'}
  done++;$('progress').value=done/candidates.length*100;render();showOutputs();
 }
 await finishDownloads();busy=false;render();$('status').textContent=`${outputs.length} of ${candidates.length} converted.${candidates.length>outputs.length?' See the file queue for errors.':''}`;
 if(outputs.length)$('results').scrollIntoView?.({behavior:'smooth'});
}
$('convert').onclick=convert;$('zip').onclick=async()=>{if(!outputs.length)return;$('zip').disabled=true;$('zip').textContent='Preparing ZIP…';try{const zip=new JSZip();for(const o of outputs)zip.file(o.name,await o.blob.arrayBuffer());const blob=await zip.generateAsync({type:'blob',compression:'STORE'});const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download='Interactive-PDFs.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){$('status').textContent='ZIP could not be created. Download the PDFs individually.'}finally{$('zip').disabled=false;$('zip').textContent='Download all as ZIP'}};
let combinedUrl=null;
$('combineFiles').onchange=()=>{$('combineDownloaded').disabled=$('combineFiles').files.length<2;$('combineStatus').textContent=$('combineFiles').files.length?`${$('combineFiles').files.length} PDFs selected. Their selection order will be used.`:'';$('combineDownload').hidden=true;};
$('combineDownloaded').onclick=async()=>{
 const files=[...$('combineFiles').files];if(files.length<2)return;
 $('combineDownloaded').disabled=true;$('combineDownload').hidden=true;
 try{
  const {getDocument,GlobalWorkerOptions}=await import('./vendor/pdf.mjs');
  const {buildQuizPdf}=await import('./quiz.mjs?v=20261015e');
  GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;
  const all=[];
  for(let i=0;i<files.length;i++){
   $('combineStatus').textContent=`Reading quiz ${i+1} of ${files.length}: ${files[i].name}`;
   const pdf=await getDocument({data:new Uint8Array(await files[i].arrayBuffer())}).promise;
   try{
    const attachment=(await pdf.getAttachments())?.['quiz-data.json'];
    if(!attachment?.content)throw new Error(`${files[i].name}: no reusable quiz data. Convert its original source again in this version, then combine the new download.`);
    const payload=JSON.parse(new TextDecoder().decode(attachment.content));
    if(payload.format!=='pdf-interactive-studio-questions-v1'||!Array.isArray(payload.questions)||!payload.questions.length)throw new Error(`${files[i].name}: invalid quiz data.`);
    const first=(await (await pdf.getPage(1)).getTextContent()).items.map(x=>x.str||'').join(' ');
    if(!new RegExp(`QUESTION\\s+1\\s*/\\s*${payload.questions.length}\\b`,'i').test(first))throw new Error(`${files[i].name}: question count does not match its quiz data.`);
    all.push(...payload.questions);
   }finally{await pdf.destroy();}
  }
  const title=$('combineTitle').value.trim()||stem(files[0].name).replace(/-quiz$/i,'');
  const result=await buildQuizPdf(all,title,(done,total)=>{$('combineStatus').textContent=`Building ${done} / ${total} questions…`;});
  if(result.mcqs!==all.length)throw new Error('Question count mismatch. No combined PDF exported.');
  if(combinedUrl)URL.revokeObjectURL(combinedUrl);
  combinedUrl=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'}));
  const link=$('combineDownload');link.href=combinedUrl;link.download=(title.replace(/[\\/:*?"<>|]/g,'-').slice(0,90)||'Combined-quiz')+'-combined-quiz.pdf';link.hidden=false;
  $('combineStatus').textContent=`Ready: ${all.length} questions from ${files.length} PDFs, numbered 1–${all.length}.`;
 }catch(e){$('combineStatus').textContent=e.message||'Could not combine these PDFs.';}
 finally{$('combineDownloaded').disabled=files.length<2;}
};
if(document.modelContext?.registerTool){try{document.modelContext.registerTool({name:'get_conversion_queue',description:'Read local file conversion status and generated PDF names.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({busy,files:queue.map(i=>({name:i.file.name,status:i.error||i.state||'Ready'})),outputs:outputs.map(o=>({name:o.name,pages:o.pages}))})})}catch(e){console.warn('Optional agent tools unavailable')}}
render();

// Expose only successfully verified conversion inputs to the optional local CBT practice UI.
window.getExamSources=()=>queue.filter(item=>item.questions?.length&&item.expectedMCQs===item.questions.length&&!item.error).map(item=>({name:item.file.name,questions:item.questions}));

window.getFailureCandidates=failureSnapshot;
window.addEventListener('pdf-retry-failed',async event=>{
 const {records,complete}=event.detail;if(busy||collecting){complete();return}
 const originalFormat=document.querySelector('input[name="format"]:checked').value;
 try{
  for(const mode of [...new Set(records.map(record=>record.mode))]){
   const retryItems=[];
   for(const record of records.filter(record=>record.mode===mode)){
    const file=new File([record.blob],record.name,{type:record.type,lastModified:record.lastModified});droppedPaths.set(file,record.path);
    let item=queue.find(item=>filePath(item.file)===record.path&&item.file.size===record.size&&item.file.lastModified===record.lastModified);
    if(!item){item={file,unsupported:!allowed.has(ext(file.name))};queue.push(item)}else item.file=file;
    retryItems.push(item);
   }
   const option=document.querySelector(`input[name="format"][value="${mode}"]`);if(!option)continue;option.checked=true;
   render();await convert(retryItems);
  }
 }finally{document.querySelector(`input[name="format"][value="${originalFormat}"]`).checked=true;render();complete();}
});
