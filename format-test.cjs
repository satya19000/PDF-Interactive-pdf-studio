const fs=require('node:fs');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const PDFLib=require('pdf-lib');
const {createCanvas}=require('@napi-rs/canvas');
const XLSX=require('xlsx');
const JSZip=require('jszip');
const w=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{runScripts:'outside-only',url:'https://example.test/'}).window;
Object.assign(w,{Blob,File,XLSX,PDFLib,TextDecoder,TextEncoder});
const canvases=new WeakMap();
w.HTMLCanvasElement.prototype.getContext=function(){let c=canvases.get(this);if(!c||c.width!==this.width||c.height!==this.height){c=createCanvas(this.width,this.height);canvases.set(this,c)}return c.getContext('2d')};
w.HTMLCanvasElement.prototype.toDataURL=function(...args){return canvases.get(this).toDataURL(...args)};
w.URL.createObjectURL=()=>'blob:test';w.URL.revokeObjectURL=()=>{};
w.HTMLElement.prototype.scrollIntoView=()=>{};
w.eval(fs.readFileSync('dist/vendor/mammoth.browser.min.js','utf8'));
w.eval(fs.readFileSync('dist/vendor/pdf-lib.min.js','utf8'));
const convertWord=w.mammoth.convertToHtml;
w.mammoth.convertToHtml=({arrayBuffer})=>convertWord({arrayBuffer:new w.Uint8Array(new Uint8Array(arrayBuffer)).buffer});
w.eval(fs.readFileSync('dist/app.js','utf8')
 .replace(/await import\('\.\/quiz\.mjs\?[^']+'\)/g,'globalThis.quiz')
 .replaceAll("await import('./vendor/pdf.mjs')",'globalThis.pdfjs')+
 ';globalThis.state=()=>({queue,outputs});');
(async()=>{
 globalThis.PDFLib=PDFLib;
 w.quiz=await import('./dist/quiz.mjs');
 const pdfjs=await import(require('node:url').pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')));
 // Node uses its installed worker rather than a browser URL.
 w.pdfjs={...pdfjs,GlobalWorkerOptions:{},getDocument:o=>pdfjs.getDocument({...o,...(o.data?{data:new Uint8Array(o.data)}:{}),useSystemFonts:true})};
 const key='1. First question?\n(a) Alpha (b) Beta (c) Gamma (d) Delta\n2. Second question?\nA) One B) Two C) Three D) Four ANSWER KEY 1-B 2-A';
 const draw=await PDFLib.PDFDocument.create();
 const page=draw.addPage();page.drawText(key,{x:40,y:730,size:10,lineHeight:16});
 const b=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['Question','Option A','Option B','Option C','Option D','Answer'],['Spreadsheet question?','One','Two','Three','Four','(b)']]),'Questions');
 const zip=new JSZip();
 zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
 zip.file('word/numbering.xml','<w:numbering xmlns:w="'+ns+'"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>');
 const p=(t,list=false)=>'<w:p>'+(list?'<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>':'')+'<w:r><w:t>'+t+'</w:t></w:r></w:p>';
 zip.file('word/document.xml','<w:document xmlns:w="'+ns+'"><w:body>'+p('Word auto-numbered question?',true)+p('A) Yes')+p('B) No')+p('Ans: (b)')+'</w:body></w:document>');
 const files=[
  new File([key],'bank.txt'),
  new File([await draw.save()],'bank.pdf'),
  new File([await zip.generateAsync({type:'uint8array'})],'bank.docx'),
  new File([XLSX.write(b,{type:'buffer',bookType:'xlsx'})],'table.xlsx'),
  new File(['A memo without questions.'],'memo.txt'),
  new File(['1. Question without choices?'],'broken.txt'),
  new File(['1. Unknown answer?\nA. Yes\nB. No'],'no-key.txt'),
 ];
 if(process.argv[2])files.push(new File([fs.readFileSync(process.argv[2])],'clinical-existing.pdf'));
 w.add([files[0]]);assert.equal(w.document.getElementById('count').textContent,'1 file');
 w.add(files.slice(1));await w.convert();
 const {queue,outputs}=w.state();
 console.log(queue.map(i=>[i.file.name,i.error||i.state]));
 assert.deepEqual(Array.from(outputs.slice(0,4),o=>o.name),['bank-quiz.pdf','bank-2-quiz.pdf','bank-3-quiz.pdf','table-quiz.pdf']);
 for(const [i,answers] of [[0,[1,0]],[1,[1,0]],[2,[1]],[3,[1]]]){
  assert.deepEqual(Array.from(queue[i].questions,q=>q.answer),answers);
  assert(!JSON.stringify(queue[i].questions).includes('ANSWER KEY'));
  const pdf=await PDFLib.PDFDocument.load(await outputs[i].blob.arrayBuffer());
  assert.equal(pdf.getPageCount(),answers.length*2);
  assert(pdf.getPage(0).node.Annots().size()>=2);
 }
 assert.equal(outputs.filter(o=>o.formatted).length,2);
 assert.equal(queue[4].error,null);assert.equal(queue[5].error,null);
 for(const output of outputs.filter(o=>o.formatted)){
  const pdf=await PDFLib.PDFDocument.load(await output.blob.arrayBuffer());
  assert.equal(pdf.getPage(0).getWidth(),595.28);
  assert.equal(pdf.getPage(0).getHeight(),841.89);
 }
 assert.equal(queue[6].questions[0].answer,null);
 assert.equal(w.quiz.parseStructured('1. Conflicting key?\nA. Yes\nB. No\nANSWER KEY 1-A 1-B')[0].answer,null);
 assert.equal(w.quiz.structuredQuestionCount('1. A?\nA. Yes\nB. No\nANSWER KEY\n1. B'),1);
 if(process.argv[2]){
  assert.equal(outputs.at(-1).blob,files.at(-1));
  assert.equal(outputs.at(-1).mcqs,152);
  assert.equal(outputs.at(-1).pages,454);
 }
 if(process.argv[3]){
  w.document.getElementById('clear').click();
  w.add([new File([fs.readFileSync(process.argv[3])],'cardiology.pdf')]);
  await w.convert();
  assert.equal(w.state().outputs[0]?.mcqs,17,w.state().queue[0]?.error);
  console.log('PASS: real Cardiology Pastest regression, 17 MCQs.');
 }
 console.log('PASS: upload format, answer-key, count gate, naming, quiz PDF and preservation checks.');
})().catch(e=>{console.error(e);process.exitCode=1;});
