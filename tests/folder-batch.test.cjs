const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function app(){
 const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{runScripts:'outside-only',url:'https://example.test/'}),w=dom.window;
 const downloads=[];w.Blob=Blob;w.File=File;w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download)};w.HTMLElement.prototype.scrollIntoView=()=>{};
 const source=fs.readFileSync('dist/app.js','utf8').replaceAll("await import('./quiz.mjs?v=20261015e')",'globalThis.__quizModule');
 w.eval(source+';globalThis.__state=()=>({queue,outputs,busy});globalThis.__setDirectory=handle=>outputDirectory=handle;');
 return {w,dom,downloads};
}
const fileEntry=(name,file)=>({name,isFile:true,file:success=>success(file)});
function folder(name,entries){return {name,isDirectory:true,createReader(){let offset=0;return {readEntries(success){const batch=entries.slice(offset,offset+100);offset+=100;success(batch)}}}}}
test('drop traverses every directory-reader batch, nested folders and unreadable siblings',async()=>{
 const {w,dom}=app();try{
 const entries=Array.from({length:205},(_,i)=>fileEntry(`question-${i}.txt`,new File(['question'],`question-${i}.txt`)));
 const bad={name:'blocked.txt',isFile:true,file(_success,fail){fail(Error('Unreadable'))}};
 entries.push(folder('Nested',[fileEntry('question-0.txt',new File(['nested'],'question-0.txt')),bad]));
 const root=folder('Subject',entries);const result=await w.collectDroppedFiles({files:[],items:[{webkitGetAsEntry:()=>root}]});
 assert.equal(result.files.length,206);assert.equal(result.errors.length,1);w.add(result.files);
 assert.equal(w.__state().queue.length,206);assert.match(w.document.getElementById('queue').textContent,/Subject\/Nested\/question-0.txt/);
 }finally{dom.window.close()}
});
test('all files convert sequentially, duplicate names stay unique and failures do not stop automatic downloads',async()=>{
 const {w,dom,downloads}=app();try{
 let running=0,max=0;w.__quizModule={buildQuizPdf:async q=>{running++;max=Math.max(max,running);await new Promise(r=>setTimeout(r,2));running--;return {bytes:new Uint8Array([1]),pages:2,mcqs:q.length}}};
 w.eval("readExistingQuiz=async()=>null;extractQuiz=async item=>{if(item.file.name==='bad.txt')throw Error('Unreadable source');item.expectedMCQs=1;return [{stem:'Question',options:['A','B'],answer:0,explanation:'Original explanation'}]}");
 const files=['a/same.txt','b/same.txt','c/third.txt','bad.txt','d/fourth.txt'].map(path=>{const file=new File(['question'],path.split('/').pop());Object.defineProperty(file,'webkitRelativePath',{value:'Subject/'+path});return file});
 w.add(files);await w.convert();const state=w.__state();assert.equal(state.outputs.length,4);assert.equal(max,1);assert.equal(downloads.length,4);assert.equal(new Set(downloads).size,4);assert.match(w.document.getElementById('queue').textContent,/Unreadable source/);assert.equal(state.busy,false);
 }finally{dom.window.close()}
});
test('direct folder saves avoid overwrites and continue after one write failure',async()=>{
 const {w,dom}=app();try{
 const saved=new Set(['first-quiz.pdf']),writes=[];
 const directory={async getFileHandle(name,options){if(!options?.create&&!saved.has(name)){const error=Error('Missing');error.name='NotFoundError';throw error}return {async createWritable(){return {async write(){if(name==='bad-quiz.pdf')throw Error('Disk full');writes.push(name)},async close(){saved.add(name)},async abort(){}}}}}};
 w.__setDirectory(directory);w.__quizModule={buildQuizPdf:async q=>({bytes:new Uint8Array([1]),pages:2,mcqs:q.length})};
 w.eval("readExistingQuiz=async()=>null;extractQuiz=async item=>{item.expectedMCQs=1;return [{stem:'Question',options:['A','B'],answer:0,explanation:'Source explanation'}]}");
 w.add(['first','bad','last'].map(name=>new File(['question'],name+'.txt')));await w.convert();
 assert.deepEqual(writes,['first-quiz (2).pdf','last-quiz.pdf']);assert.equal(w.__state().outputs.length,3);assert.match(w.document.getElementById('downloadStatus').textContent,/1 saves failed/);
 }finally{dom.window.close()}
});
test('modern interactive PDF batches preserve every file without reparsing as a legacy six-page quiz',async()=>{
 const {w,dom,downloads}=app();try{
 w.__quizModule={};w.eval("readExistingQuiz=async()=>({originalPageCount:4,questionCount:2,doc:{save:async()=>new Uint8Array([1,2,3])}})");
 w.add([new File(['pdf1'],'first.pdf'),new File(['pdf2'],'second.pdf')]);await w.convert();
 assert.equal(w.__state().outputs.length,2);assert.equal(downloads.length,2);assert.equal(w.__state().outputs[1].mcqs,2);
 }finally{dom.window.close()}
});
test('retry processes only saved failures and retains successful PDF downloads',async()=>{
 const {w,dom}=app();const {IDBFactory}=await import('fake-indexeddb');const {createFailureStore}=await import('../dist/repair-store.mjs');const {mountFailedFiles}=await import('../dist/repair.mjs');const store=createFailureStore(new IDBFactory());let panel;
 try{
  w.document.getElementById('autoDownload').checked=false;
  w.__quizModule={buildQuizPdf:async q=>({bytes:new Uint8Array([1]),pages:2,mcqs:q.length})};
  w.eval("readExistingQuiz=async()=>null;globalThis.__repairReady=false;extractQuiz=async item=>{if(item.file.name==='failed.txt'&&!globalThis.__repairReady)throw Error('Source error');item.expectedMCQs=1;return [{stem:'Question',options:['A','B'],answer:0,explanation:'Original explanation'}]}");
  panel=mountFailedFiles({root:w.document.getElementById('failedFiles'),store,snapshot:()=>w.getFailureCandidates()});await panel.ready;
  w.add([new File(['safe'],'safe.txt'),new File(['failed bytes'],'failed.txt')]);await w.convert();await panel.idle();assert.equal(panel.records().length,1);assert.equal(w.__state().outputs.length,1);
  w.__repairReady=true;const retry=[...w.document.querySelectorAll('#failedFiles button')].find(button=>button.textContent==='Retry failed files');retry.click();
  for(let i=0;i<100;i++){await new Promise(resolve=>setTimeout(resolve,10));if(w.__state().outputs.length===2&&!w.__state().busy)break}
  await panel.idle();assert.equal(w.__state().outputs.length,2);assert.equal(panel.records().length,0);assert.equal((await store.list()).length,0);assert.equal(w.__state().outputs[0].name,'safe-quiz.pdf');
 }finally{panel?.destroy();dom.window.close();await store.close()}
});
