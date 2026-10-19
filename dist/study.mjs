// Browser-local notes typesetting. Source PDF pages are appended so that figures,
// equations and tables remain available even when text extraction cannot reflow them.
const PAPER=[595.28,841.89];
const W=1190,H=1684,LEFT=104,RIGHT=1086,TOP=174,BOTTOM=1540;

function pdfLines(items){
 const rows=[];
 for(const item of items){
  const value=(item.str||'').trim();if(!value)continue;
  const x=item.transform?.[4]||0,y=item.transform?.[5]||0;
  let row=rows.find(r=>Math.abs(r.y-y)<3.5);
  if(!row){row={y,parts:[]};rows.push(row)}row.parts.push({x,value});
 }
 return rows.sort((a,b)=>b.y-a.y).map(r=>r.parts.sort((a,b)=>a.x-b.x).map(p=>p.value).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean);
}

export async function buildStudyPdf(file,title,size,contentBlocks,report){
 const doc=await PDFLib.PDFDocument.create(),isPdf=/\.pdf$/i.test(file.name);
 let blocks=[],original=null,sourcePages=0;
 if(isPdf){
  const bytes=new Uint8Array(await file.arrayBuffer());
  original=await PDFLib.PDFDocument.load(bytes);
  const {getDocument,GlobalWorkerOptions}=await import('./vendor/pdf.mjs');
  GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
  const source=await getDocument({data:bytes.slice(),disableFontFace:true}).promise;
  try{
   sourcePages=source.numPages;
   for(let n=1;n<=sourcePages;n++){
    const lines=pdfLines((await (await source.getPage(n)).getTextContent()).items);
    if(lines.length)blocks.push({kind:'page',number:n,lines});
    report?.(n/sourcePages*.55,`Reading notes page ${n} of ${sourcePages}`);
    if(n%5===0)await new Promise(r=>setTimeout(r,0));
   }
  }finally{await source.destroy()}
  if(!blocks.length)throw new Error('No selectable text in this PDF. Use Original pages + reading tools for scanned notes.');
 }else{
  const raw=await contentBlocks(file);
  for(const block of raw){
   if(block.text?.trim())blocks.push({kind:'text',lines:block.text.replace(/\r/g,'').split('\n')});
   if(block.image)blocks.push({kind:'image',data:block.image});
  }
  if(!blocks.length)throw new Error('No readable notes found in this file.');
 }
 let pageNumber=0,canvas,ctx,y,hasBody=false;
 const accent='#3e5bd7',ink='#17243a',muted='#64748b';
 function newCanvas(){
  canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
  ctx.fillStyle=accent;ctx.fillRect(0,0,W,16);
  ctx.fillStyle='#eef3ff';ctx.fillRect(0,16,W,120);
  ctx.fillStyle=ink;ctx.font='700 42px system-ui, sans-serif';ctx.textBaseline='top';
  ctx.fillText(title.slice(0,48),LEFT,52);
  ctx.fillStyle=muted;ctx.font='23px system-ui, sans-serif';ctx.fillText('STUDY NOTES',LEFT,112);
  ctx.fillStyle='#d8e0ee';ctx.fillRect(LEFT,158,RIGHT-LEFT,2);
  ctx.fillStyle=muted;ctx.font='20px system-ui, sans-serif';ctx.fillText('PDF Interactive Studio',LEFT,1614);
  ctx.textAlign='right';ctx.fillText(String(pageNumber+1),RIGHT,1614);ctx.textAlign='left';
  y=TOP;hasBody=false;
 }
 async function flush(){
  if(!hasBody)return;
  const image=await doc.embedPng(canvas.toDataURL('image/png'));
  const page=doc.addPage(PAPER);page.drawImage(image,{x:0,y:0,width:PAPER[0],height:PAPER[1]});
  pageNumber++;canvas.width=0;canvas.height=0;newCanvas();
 }
 function kindOf(line){
  if(/^#{1,4}\s/.test(line))return 'heading';
  if(/^\s*(?:chapter|section|unit)\s+\d+/i.test(line))return 'heading';
  if(line.length<85&&line.length>2&&(/^[A-Z][A-Z\s\d:–—-]+$/.test(line)||/:$/.test(line)))return 'heading';
  if(/^\s*(?:[-•*]|\d+[.)])\s+/.test(line))return 'list';
  return 'body';
 }
 function wrapped(text,font,maxWidth){
  const words=text.split(/\s+/),rows=[];let line='';
  for(let word of words){
   if(ctx.measureText(line?line+' '+word:word).width<=maxWidth){line+=(line?' ':'')+word;continue}
   if(line){rows.push(line);line=''}
   while(ctx.measureText(word).width>maxWidth){let part='';for(const char of word){if(ctx.measureText(part+char).width>maxWidth)break;part+=char}if(!part)break;rows.push(part);word=word.slice(part.length)}
   line=word;
  }
  if(line)rows.push(line);return rows;
 }
 newCanvas();
 for(let i=0;i<blocks.length;i++){
  const block=blocks[i];
  if(block.kind==='image'){
   const img=new Image();img.src=block.data;await img.decode();
   const scale=Math.min((RIGHT-LEFT)/img.naturalWidth,880/img.naturalHeight);
   const height=Math.max(1,Math.round(img.naturalHeight*scale));
   if(y+height+70>BOTTOM)await flush();
   ctx.drawImage(img,LEFT,y,Math.round(img.naturalWidth*scale),height);y+=height+38;hasBody=true;continue;
  }
  if(block.kind==='page'){
   if(y>TOP+400)await flush();
   ctx.fillStyle=accent;ctx.font='700 25px system-ui, sans-serif';ctx.fillText(`SOURCE PAGE ${block.number}`,LEFT,y);y+=52;hasBody=true;
  }
  for(let raw of block.lines){
   raw=raw.trim();if(!raw){y+=18;continue}
   const kind=kindOf(raw),heading=kind==='heading',list=kind==='list';
   const text=raw.replace(/^#{1,4}\s*/,'');
   const px=heading?Math.round(size*2.4):size*2;
   ctx.font=`${heading?'700':'400'} ${px}px system-ui, sans-serif`;
   const indent=list?24:0,lines=wrapped(text,ctx.font,RIGHT-LEFT-indent);
   const lineHeight=Math.round(px*(heading?1.42:1.48));
   if(heading&&y+lineHeight*2+30>BOTTOM)await flush();
   if(heading)y+=24;
   for(const line of lines){
    if(y+lineHeight>BOTTOM)await flush();
    ctx.font=`${heading?'700':'400'} ${px}px system-ui, sans-serif`;
    ctx.fillStyle=heading?accent:ink;
    if(list){ctx.fillStyle='#13a491';ctx.fillRect(LEFT,y+13,10,10);ctx.fillStyle=ink}
    ctx.fillText(line,LEFT+indent,y);y+=lineHeight;hasBody=true;
   }
   y+=heading?14:10;
  }
  report?.(.55+(i+1)/blocks.length*.25,`Formatting notes ${i+1} of ${blocks.length}`);
  await new Promise(r=>setTimeout(r,0));
 }
 await flush();
 const notesPages=doc.getPageCount();
 if(original){
  // Keep every source page as a complete appendix. No visual content is discarded.
  const refs=await doc.copyPages(original,original.getPageIndices());
  for(let i=0;i<refs.length;i++){doc.addPage(refs[i]);if(i%10===0){report?.(.8+(i+1)/refs.length*.2,`Preserving original page ${i+1} of ${refs.length}`);await new Promise(r=>setTimeout(r,0))}}
 }
 doc.setTitle(title);doc.setCreator('PDF Interactive Studio - Study Notes');
 return {bytes:await doc.save(),pages:doc.getPageCount(),notesPages,sourcePages};
}
