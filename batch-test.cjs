const qaPath=require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'pdf-studio-test-'));
const fs=require('fs');
const assert=require('assert');
const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{runScripts:'outside-only',url:'https://example.test/'});
const w=dom.window;w.HTMLAnchorElement.prototype.click=function(){};
w.Blob=Blob;w.File=File;w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
w.HTMLElement.prototype.scrollIntoView=()=>{};
w.eval(fs.readFileSync('dist/vendor/pdf-lib.min.js','utf8'));
const app=fs.readFileSync('dist/app.js','utf8').replaceAll("await import('./quiz.mjs?v=20261015e')",'globalThis.__quizModule');
w.eval(app+';globalThis.__getOutputs=()=>outputs;');
(async()=>{
 const quiz=await import('./dist/quiz.mjs');globalThis.PDFLib=require('pdf-lib');
 const visualRows=[
  ['A 26-year-old patient has a cough.',65,650],['Which diagnosis is most likely?',65,625],
  ['A',72,555],['First option',98,555],['B',72,520],['Second option',98,520],
  ['C',72,485],['Correct option',98,485],['D',72,450],['Fourth option',98,450],
  ['E',72,415],['Fifth option',98,415],['Explanation',65,380],
  ['C',72,345],['Correct option',98,345],['The correct explanation.',65,320]
 ].map(([str,x,y])=>({str,width:str.length*5,transform:[1,0,0,1,x,y]}));
 const visualQuestions=quiz.parseVisualOptionBank([visualRows]);
 assert.equal(visualQuestions.length,1);
 assert.equal(visualQuestions[0].stem.startsWith('A 26-year-old'),true);
 assert.equal(visualQuestions[0].answer,2);
 assert.equal(visualQuestions[0].explanation,'The correct explanation.');
 w.__quizModule={...quiz,buildQuizPdf:async (questions,title,progress,existing)=>{
  if(existing)existing.doc=await globalThis.PDFLib.PDFDocument.load(new Uint8Array(await existing.doc.save()));
  return quiz.buildQuizPdf(questions,title,progress,existing);
 }};
 const spans=[
  ['Q-1',40,700],['Which choice?',40,680],['A.',40,650],['First',58,650],
  ['B.',40,630],['Second',58,630],['ANSWER:',40,600],['Second',40,580]
 ].map(([str,x,y])=>({str,transform:[1,0,0,1,x,y]}));
 const splitText=quiz.textLinesFromItems(spans).join('\n');
 assert.equal(quiz.parseStructured(splitText)[0].answer,1);
 const pastest=quiz.parseStructured('Q-1\nWhich choice?\nA. First\nB. Second\nANSWER:\nSecond\nEXPLANATION:\nThe second choice is correct.');
 assert.equal(pastest.length,1);assert.equal(pastest[0].answer,1);assert.deepEqual(pastest[0].options,['First','Second']);
 const long=quiz.parseStructured('Q-2\nA long discussion?\nA. Yes\nB. No\nANSWER: A\nEXPLANATION:\n'+('Detailed discussion with supporting points. '.repeat(130)));
 const longPdf=await quiz.buildQuizPdf(long,'Discussion');assert(longPdf.pages>=3);
 w.eval("extractQuiz=async item=>{if(item.file.name.startsWith('empty'))return [];const parsed=globalThis.__quizModule.parseStructured(await item.file.text());item.expectedMCQs=item.file.name.startsWith('mismatch')?parsed.length+1:parsed.length;return parsed}");
 const folderA=new File(['Q1. A?\nA. Yes\nB. No'],'same.txt'),folderB=new File(['Q1. B?\nA. Yes\nB. No'],'same.txt');
 Object.defineProperty(folderA,'webkitRelativePath',{value:'Subject/A/same.txt'});
 Object.defineProperty(folderB,'webkitRelativePath',{value:'Subject/B/same.txt'});
 w.add([folderA,folderB]);
 assert.equal(w.document.querySelectorAll('#queue .file').length,2);
 assert(w.document.getElementById('queue').textContent.includes('Subject/B/same.txt'));
 w.document.getElementById('clear').click();
 w.add([new File(['Q1. Separate first?\nA. Yes\nB. No'],'first-separate.txt'),new File(['Q1. Separate second?\nA. No\nB. Yes'],'second-separate.txt')]);
 await w.convert();
 assert.equal(w.document.querySelectorAll('#queue .download').length,2);
 assert.equal(w.__getOutputs().length,2);
 assert.equal(w.__getOutputs()[0].mcqs,1);assert.equal(w.__getOutputs()[1].mcqs,1);
 assert.equal(w.__getOutputs()[0].name,'first-separate-quiz.pdf');
 assert.equal(w.__getOutputs()[1].name,'second-separate-quiz.pdf');
 w.document.getElementById('clear').click();
 w.add([new File(['Q1. Incomplete?\nA. Yes\nB. No'],'mismatch.txt'),new File(['Q1. Safe?\nA. Yes\nB. No'],'safe.txt')]);
 await w.convert();
 assert.equal(w.__getOutputs().length,1);
 assert(w.document.getElementById('queue').textContent.includes('Incomplete PDF blocked'));
 w.document.getElementById('clear').click();
 w.document.getElementById('combineMode').checked=true;
 w.add([
  new File(['No questions here'],'empty.pdf'),
  new File(['Q1. First MCQ?\nA. Yes\nB. No\nAnswer: A'],'first.txt'),
  new File(['Nothing to parse'],'empty-again.txt'),
  new File(['Q1. Second MCQ?\nA. Yes\nB. No\nAnswer: B'],'second.txt'),
 ]);
 w.document.getElementById('title').value='Combined subject';
 await w.convert();
 assert.equal(w.document.querySelectorAll('.output .download').length,1);
 assert(w.document.getElementById('status').textContent.includes('2 file(s); 2 skipped'));
 assert(w.document.getElementById('queue').textContent.includes('Skipped'));
 const result=w.document.querySelector('.output .download');assert.equal(result.download,'Combined subject-quiz.pdf');
 const base=await quiz.buildQuizPdf(quiz.parseStructured('Q1. Original question?\nA. Old correct\nB. Old wrong\nAnswer: A\nExplanation: Original explanation.'),'Combined subject');
 w.document.getElementById('clear').click();
 w.add([new File([base.bytes],'Combined subject-quiz.pdf',{type:'application/pdf'}),new File(['Q1. Added question?\nA. New wrong\nB. New correct\nAnswer: B'],'added.txt')]);
 await w.convert();
 const continued=await globalThis.PDFLib.PDFDocument.load(await w.__getOutputs()[0].blob.arrayBuffer());
 assert.equal(continued.getTitle(),'Combined subject');
 assert.equal(continued.getKeywords().includes('question-count:2'),true);
 assert.equal(continued.getPageCount(),base.pages+2);
 assert.equal(continued.getPage(0).node.Annots().size(),2);
 assert.equal(continued.getPage(0).getWidth(),892.5);
 assert.equal(continued.getPage(base.pages).getWidth(),892.5);
 assert(w.document.getElementById('status').textContent.includes('1 existing + 1 new'));
 fs.writeFileSync(require('path').join(qaPath,'continued-quiz.pdf'),Buffer.from(await w.__getOutputs()[0].blob.arrayBuffer()));
 const third=await quiz.buildQuizPdf(quiz.parseStructured('Q1. Third question?\nA. Yes\nB. No\nAnswer: A'),'Combined subject',()=>{},
  {doc:continued,questionCount:2,originalPageCount:continued.getPageCount()});
 const again=await globalThis.PDFLib.PDFDocument.load(third.bytes);
 assert.equal(again.getKeywords().includes('question-count:3'),true);
 assert.equal(again.getPage(0).node.Annots().size(),2);
 assert.equal(again.getPage(base.pages).node.Annots().size(),2);
 console.log('PASS: empty files skipped; old interactive quiz preserved; repeat continuation reaches question 3.');
})().catch(e=>{console.error(e);process.exitCode=1});
