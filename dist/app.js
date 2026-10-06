/* All processing is local. No file bytes leave the browser. */
const $=id=>document.getElementById(id);
const allowed=new Set('pdf docx pptx xlsx xls csv tsv txt md json html htm png jpg jpeg webp bmp gif'.split(' '));
let queue=[],outputs=[],busy=false;
const ext=name=>name.split('.').pop().toLowerCase();
const stem=name=>name.replace(/\.[^.]+$/,'');
const human=n=>n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function render(){
 $('count').textContent=queue.length+' files';$('queue').replaceChildren();
 if(!queue.length)$('queue').append(el('div','empty','Your conversion queue will appear here.'));
 for(const item of queue){const row=el('div','file');row.append(el('div','fileicon',ext(item.file.name).toUpperCase()));const info=el('div','fileinfo');info.append(el('div','filename',item.file.name),el('div','filemeta'+(item.error?' error':''),item.error||`${human(item.file.size)} · ${item.state||'Ready'}`));const remove=el('button','textbtn','×');remove.setAttribute('aria-label','Remove '+item.file.name);remove.disabled=busy;remove.onclick=()=>{queue=queue.filter(i=>i!==item);render()};row.append(info,remove);$('queue').append(row)}
 const quiz=$('quizMode').checked;$('legacyOptions').hidden=quiz;
 $('convert').disabled=busy||!queue.some(i=>!i.unsupported);
 $('convert').firstChild.textContent=quiz?'Create one quiz PDF ':'Create interactive PDFs ';
 $('clear').disabled=busy||!queue.length;$('files').disabled=busy;$('demo').disabled=busy;
 for(const id of ['title','quizMode','index','mcqs','notes','checks','size'])$(id).disabled=busy;
}
function add(files){if(busy)return;let added=0;for(const file of files){if(queue.some(i=>i.file.name===file.name&&i.file.size===file.size&&i.file.lastModified===file.lastModified))continue;const bad=!allowed.has(ext(file.name));queue.push({file,unsupported:bad,error:bad?'Unsupported format. Export to PDF in the original app first.':null});added++}render();$('status').textContent=added?`${added} file(s) added. Choose your options and convert.`:'These files are already in your queue.';}
$('files').onchange=e=>{add(e.target.files);e.target.value=''};$('drop').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('files').click()}};for(const type of ['dragenter','dragover'])$('drop').addEventListener(type,e=>{e.preventDefault();$('drop').classList.add('drag')});for(const type of ['dragleave','drop'])$('drop').addEventListener(type,e=>{e.preventDefault();$('drop').classList.remove('drag')});$('drop').addEventListener('drop',e=>add(e.dataTransfer.files));$('clear').onclick=()=>{queue=[];render();$('status').textContent='Add a file to get started.'};$('demo').onclick=()=>add([new File(['Q1. What is the first-line lifestyle advice for impaired fasting glucose?\nA. Antibiotics\nB. Diet and exercise\nC. Anticoagulation\nD. Surgery\nAnswer: B\nExplanation: Diet and exercise are the initial measures.'],'Sample question bank.txt',{type:'text/plain'})]);$('quizMode').onchange=()=>{render()};
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
function showOutputs(){ $('results').hidden=!outputs.length;$('zip').hidden=outputs.length<=1;$('outputs').replaceChildren();for(const o of outputs){const row=el('div','output');const info=el('div','filename',o.name);info.append(el('small','',`${o.sourcePages} ${o.quiz?'questions':'source pages'} · ${o.mcqs} interactive MCQs · ${o.pages} total pages · ${human(o.blob.size)}`));const a=el('a','download','Download PDF');a.href=o.url;a.download=o.name;row.append(el('div','fileicon','PDF'),info,a);$('outputs').append(row)}}
function setProgress(value,message){$('progress').hidden=false;$('progress').value=Math.max(0,Math.min(100,value));$('progress').setAttribute('aria-label',message);$('status').textContent=message;}
async function extractQuiz(item,report=setProgress){
 const {parseBmj,parseStructured,inferBmjAnswerColors,captureBmjFigures}=await import('./quiz.mjs');
 if(ext(item.file.name)==='pdf'){
  const {getDocument,GlobalWorkerOptions}=await import('./vendor/pdf.mjs');GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;
  const pdfjs=await getDocument({data:new Uint8Array(await item.file.arrayBuffer()),disableFontFace:true}).promise;
  try{
   const pages=[];
   for(let p=1;p<=pdfjs.numPages;p++){
    pages.push((await (await pdfjs.getPage(p)).getTextContent()).items);
    if(p%10===0||p===pdfjs.numPages){item.state=`Reading ${p}/${pdfjs.numPages} pages`;report(p/pdfjs.numPages*50,`${item.file.name}: reading page ${p} of ${pdfjs.numPages} (${Math.round(p/pdfjs.numPages*50)}%)`);render();await new Promise(r=>setTimeout(r,0));}
   }
   const bmj=parseBmj(pages);if(bmj.length){await inferBmjAnswerColors(pdfjs,bmj,(done,total)=>{item.state=`Checking answer key ${done}/${total}`;report(50+done/total*25,`${item.file.name}: checking answers ${done} of ${total} (${Math.round(50+done/total*25)}%)`);render()});item.state='Preserving question figures…';report(75,`${item.file.name}: preserving question figures (75%)`);render();await captureBmjFigures(pdfjs,bmj,(done,total)=>report(75+done/total*5,`${item.file.name}: preserving figure ${done} of ${total} (${Math.round(75+done/total*5)}%)`));return bmj;}
   const lines=pages.flatMap(items=>items.filter(i=>i.str?.trim()).sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4]).map(i=>i.str));
   return parseStructured(lines.join('\n'));
  }finally{await pdfjs.destroy()}
 }
 if(['txt','md','docx','html','htm'].includes(ext(item.file.name))){const blocks=await contentBlocks(item.file);return parseStructured(blocks.map(b=>b.text||'').join('\n'));}
 throw new Error('Quiz extraction needs a text-based PDF, DOCX, TXT, MD or HTML file. Use original-layout mode for other formats.');
}
async function convert(){
 if(busy)return;busy=true;outputs.forEach(o=>URL.revokeObjectURL(o.url));outputs=[];showOutputs();render();
 const candidates=queue.filter(i=>!i.unsupported),quiz=$('quizMode').checked;
 const opts={index:$('index').checked,notes:$('notes').checked,checks:$('checks').checked,mcqs:$('mcqs').checked};
 if(quiz){
  const allQuestions=[];let currentItem=null;
  try{
   if(queue.some(i=>i.unsupported))throw new Error('Remove unsupported files before creating one quiz PDF.');
   if(!candidates.length)throw new Error('Add a question bank to begin.');
   for(let i=0;i<candidates.length;i++){
    const item=candidates[i];currentItem=item;item.error=null;item.state='Analyzing…';render();
    await new Promise(resolve=>setTimeout(resolve,0));
    if(!item.questions?.length)item.questions=await extractQuiz(item,(value,message)=>{
     const percent=Math.round((i+value/100)/candidates.length*75);
     setProgress(percent,`${message.replace(/ \(\d+%\)$/,'')} · file ${i+1}/${candidates.length} (${percent}%)`);
    });
    if(!item.questions.length)throw new Error(`No supported questions in ${item.file.name}. Scanned pages need OCR.`);
    allQuestions.push(...item.questions);
    item.state=`${item.questions.length} questions added`;render();
    setProgress(Math.round((i+1)/candidates.length*75),`Analyzed ${i+1} of ${candidates.length} files · ${allQuestions.length} questions`);
   }
   const title=$('title').value.trim()||stem(candidates[0].file.name);
   const {buildQuizPdf}=await import('./quiz.mjs');
   const result=await buildQuizPdf(allQuestions,title,(current,total,phase)=>{
    const percent=Math.round(75+(phase?24:current/total*24));
    setProgress(percent,`${phase||'Building combined quiz'}: ${current} of ${total} questions (${percent}%)`);
   });
   const blob=new Blob([result.bytes],{type:'application/pdf'});
   const filename=(title.replace(/[\\/:*?"<>|]/g,'-').trim().slice(0,90)||'Question Bank')+'-quiz.pdf';
   outputs.push({...result,quiz:true,bytes:undefined,blob,url:URL.createObjectURL(blob),name:filename});
   for(const item of candidates)item.state=`Included · ${item.questions.length} questions`;
   const unknown=allQuestions.filter(q=>!Number.isInteger(q.answer)).length;
   setProgress(100,`One PDF ready: ${candidates.length} files, ${allQuestions.length} numbered questions${unknown?`, ${unknown} with no answer`:''}.`);
  }catch(e){
   if(currentItem)currentItem.error=e.message||'Question extraction failed.';
   setProgress(0,e.message||'Conversion failed. Check the file queue.');
  }finally{busy=false;render();showOutputs();if(outputs.length)$('results').scrollIntoView?.({behavior:'smooth'});}
  return;
 }
 let done=0;setProgress(0,'Starting conversion (0%)');
 for(const item of candidates){
  item.error=null;item.state='Converting…';render();
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
   let name=stem(item.file.name)+'-interactive.pdf';
   if(outputs.some(o=>o.name===name))name=stem(item.file.name)+`-${done+1}-interactive.pdf`;
   outputs.push({...result,bytes:undefined,blob,url:URL.createObjectURL(blob),name});item.state='Converted';
  }catch(e){item.error=e.message||'Conversion failed. Try a text-based question bank.'}
  done++;$('progress').value=done/candidates.length*100;render();showOutputs();
 }
 busy=false;render();$('status').textContent=`${outputs.length} of ${candidates.length} converted.${candidates.length>outputs.length?' See the file queue for errors.':''}`;
 if(outputs.length)$('results').scrollIntoView?.({behavior:'smooth'});
}
$('convert').onclick=convert;$('zip').onclick=async()=>{if(!outputs.length)return;$('zip').disabled=true;$('zip').textContent='Preparing ZIP…';try{const zip=new JSZip();for(const o of outputs)zip.file(o.name,await o.blob.arrayBuffer());const blob=await zip.generateAsync({type:'blob',compression:'STORE'});const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download='Interactive-PDFs.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){$('status').textContent='ZIP could not be created. Download the PDFs individually.'}finally{$('zip').disabled=false;$('zip').textContent='Download all as ZIP'}};
if(document.modelContext?.registerTool){try{document.modelContext.registerTool({name:'get_conversion_queue',description:'Read local file conversion status and generated PDF names.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({busy,files:queue.map(i=>({name:i.file.name,status:i.error||i.state||'Ready'})),outputs:outputs.map(o=>({name:o.name,pages:o.pages}))})})}catch(e){console.warn('Optional agent tools unavailable')}}
render();
