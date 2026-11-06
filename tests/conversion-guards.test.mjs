import test from 'node:test';import assert from 'node:assert/strict';
import {visualSourceCount,explicitSourceCount,boundedWork,compactSourceImage} from '../dist/conversion-guards.mjs';
import {parseMyPastest} from '../dist/quiz.mjs';
test('Pastest accepts split feedback and an explanation on the next page',()=>{
 const row=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
 const pages=[[row('MyPastest questionIndex=42',40,800),row('Which option fits?',40,730),
  row('Your answer',40,700),row('was incorrect',115,700),row('A First choice',50,660),row('B Second choice',50,630)],
 [row('Explanation:',40,740),row('B Second choice',50,715),row('Original rationale.',40,690)]];
 const [question]=parseMyPastest(pages);
 assert.equal(question.id,'mypastest-42');assert.deepEqual(question.options,['First choice','Second choice']);
 assert.equal(question.answer,1);assert.match(question.explanation,/Original rationale/);
});
test('visual question count excludes repeated answer choices and detects missing extraction',()=>{const question=['A','B','C','D','E'].map(letter=>({letter,text:letter+' choice'}));const page=[...question,{text:'Explanation'},...question];assert.equal(visualSourceCount([page,page],x=>x),2);assert.equal(visualSourceCount([[...question.slice(0,3),{text:'Explanation'}]],x=>x),0)});
test('source numbering audited independently of parsed options',()=>{assert.equal(explicitSourceCount('Q1. Question?\nA. Yes\nB. No\n2. Missing options\nDiscussion'),2)});
test('OCR deadline releases UI and stops worker',async()=>{let stopped=0;await assert.rejects(boundedWork(()=>new Promise(()=>{}),{timeout:15,onStop:()=>stopped++}),/3 minutes/);assert.equal(stopped,1)});
test('stop interrupts an active OCR page rather than waiting for it',async()=>{const controller=new AbortController();let stopped=0;const work=boundedWork(()=>new Promise(()=>{}),{signal:controller.signal,onStop:()=>stopped++});controller.abort();await assert.rejects(work,/stopped/);assert.equal(stopped,1)});
test('image optimisation retains lossless PNG unless JPEG saves materially',()=>{const canvas={toDataURL:type=>type==='image/png'?'P'.repeat(1000):'J'.repeat(600)};assert.equal(compactSourceImage(canvas).length,600);canvas.toDataURL=type=>type==='image/png'?'P'.repeat(100):'J'.repeat(95);assert.equal(compactSourceImage(canvas)[0],'P')});
