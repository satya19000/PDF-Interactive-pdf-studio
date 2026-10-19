import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {mountPractice} from '../dist/exam.mjs';
import {createPracticeStore,PracticeConflict} from '../dist/exam-store.mjs';
const questions=()=>Array.from({length:10},(_,i)=>({id:String(i),stem:`Question ${i}?`,options:['One','Two','Three','Four','Five'],answer:1,explanation:`Original explanation ${i}`}));
const sources=()=>[{name:'Cardiology.txt',questions:questions()}];
const wait=async predicate=>{for(let i=0;i<200;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,5))}throw Error('UI did not reach expected state')};
function page(store,getSources=sources,now=()=>Date.now()){
 const dom=new JSDOM('<div id="practice"></div>',{url:'https://example.test/'});dom.window.confirm=()=>true;
 const root=dom.window.document.getElementById('practice');
 const app=mountPractice({root,store,sources:getSources,now});
 return {root,app,close(){app.destroy();dom.window.close()}};
}

test('answers, flags, active question and original deadline survive refresh; review reveals original explanation',async()=>{
 const store=createPracticeStore(new IDBFactory());let ui=page(store);
 try{
  await ui.app.ready;assert.match(ui.root.textContent,/10 eligible/);
  ui.root.querySelector('.primary').click();await wait(()=>ui.root.querySelector('.exam-question'));
  assert.doesNotMatch(ui.root.textContent,/Original explanation/);
  ui.root.querySelectorAll('input[type=radio]')[1].click();await wait(async()=>(await store.list())[0]?.answers[0]===1);await wait(()=>!ui.root.querySelector('input[type=radio]').disabled);
  ui.root.querySelectorAll('.exam-actions button')[2].click();await wait(async()=>(await store.list())[0]?.flags.length===1);await wait(()=>!ui.root.querySelector('input[type=radio]').disabled);
  ui.root.querySelector('.exam-actions').lastChild.click();await wait(async()=>(await store.list())[0]?.index===1);await wait(()=>!ui.root.querySelector('input[type=radio]').disabled);
  const saved=(await store.list())[0];ui.close();ui=page(store,()=>[]);await ui.app.ready;
  assert.match(ui.root.textContent,/Question 2 of 10/);assert.equal((await store.list())[0].endsAt,saved.endsAt);
  assert.deepEqual((await store.list())[0].flags,[0]);
  ui.root.querySelector('.exam-submit').click();await wait(()=>ui.root.querySelector('.exam-result'));
  assert.match(ui.root.textContent,/Original explanation/);assert.match(ui.root.textContent,/1 \/ 10 correct/);
  const back=[...ui.root.querySelectorAll('button')].find(b=>b.textContent==='Back to practice setup');back.click();await wait(()=>ui.root.querySelector('.exam-config'));
  assert.match(ui.root.textContent,/10 eligible/,'saved attempts remain available without re-upload');
 }finally{ui.close();await store.close()}
});

test('storage failures restore the saved selection and report the unsaved action',async()=>{
 const store=createPracticeStore(new IDBFactory());const ui=page({...store,update:async()=>{throw Error('Storage full')}});
 try{await ui.app.ready;ui.root.querySelector('.primary').click();await wait(()=>ui.root.querySelector('.exam-question'));
  ui.root.querySelectorAll('input[type=radio]')[1].click();await wait(()=>ui.root.textContent.includes('Your last action was not saved'));
  assert.match(ui.root.textContent,/Storage full/);assert.equal(ui.root.querySelectorAll('input:checked').length,0);assert.deepEqual((await store.list())[0].answers,{});
 }finally{ui.close();await store.close()}
});

test('stale tab cannot overwrite an answer saved by another tab',async()=>{
 const store=createPracticeStore(new IDBFactory());const first=page(store);let second;
 try{await first.app.ready;first.root.querySelector('.primary').click();await wait(()=>first.root.querySelector('.exam-question'));
  second=page(store);await second.app.ready;
  first.root.querySelectorAll('input[type=radio]')[1].click();await wait(async()=>(await store.list())[0].revision===1);await wait(()=>!first.root.querySelector('input[type=radio]').disabled);
  second.root.querySelectorAll('input[type=radio]')[2].click();await wait(()=>second.root.textContent.includes('Another tab changed this paper'));
  assert.equal((await store.list())[0].answers[0],1);assert.equal(second.root.querySelectorAll('input[type=radio]')[1].checked,true);
 }finally{first.close();second?.close();await store.close()}
});

test('expired paper submits stored answers at its original deadline on resume',async()=>{
 const store=createPracticeStore(new IDBFactory());const ui=page(store);let resumed;
 try{await ui.app.ready;ui.root.querySelector('.primary').click();await wait(()=>ui.root.querySelector('.exam-question'));
  const before=(await store.list())[0];ui.close();resumed=page(store,()=>[],()=>before.endsAt+60000);await resumed.app.ready;
  assert.match(resumed.root.textContent,/Practice result/);assert.equal((await store.list())[0].submittedAt,before.endsAt);
 }finally{ui.close();resumed?.close();await store.close()}
});
