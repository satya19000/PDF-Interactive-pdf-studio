import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {JSDOM} from 'jsdom';
import JSZip from 'jszip';
import {createFailureStore,failureId,buildFailureZip} from '../dist/repair-store.mjs';
import {mountFailedFiles} from '../dist/repair.mjs';
function failed(path='Subject/failed.pdf') {const file=new File(['unchanged original bytes'],'failed.pdf',{type:'application/pdf',lastModified:12345});return {file,path,size:file.size,lastModified:file.lastModified,error:'MCQ count mismatch',mode:'quiz',expectedMCQs:19,extractedMCQs:18}}
function page(store,files=[]) {const dom=new JSDOM('<section id="failed"></section>',{url:'https://example.test/'});const root=dom.window.document.getElementById('failed');const panel=mountFailedFiles({root,store,snapshot:()=>({files,busy:false}),createZip:()=>new JSZip()});return {dom,root,panel}}
test('failed original bytes and error metadata survive a new page; success removes only the repaired record',async()=>{
 const store=createFailureStore(new IDBFactory()),source=failed(),other=failed('Other/failed.pdf');let ui=page(store,[source,other]);
 try{await ui.panel.ready;assert.equal(ui.panel.records().length,2);assert.equal((await store.list())[0].error,'MCQ count mismatch');ui.panel.destroy();ui.dom.window.close();ui=page(store);await ui.panel.ready;assert.equal(ui.panel.records().length,2);assert.equal(await ui.panel.records()[0].blob.text(),'unchanged original bytes');
  ui.dom.window.dispatchEvent(new ui.dom.window.CustomEvent('pdf-conversion-state',{detail:{busy:false,files:[{...source,error:null,success:true}]}}));await ui.panel.idle();assert.equal(ui.panel.records().length,1);assert.equal((await store.list())[0].path,'Other/failed.pdf');
 }finally{ui.panel.destroy();ui.dom.window.close();await store.close()}
});
test('quota failure keeps originals available for download and clearly marks them as unsaved',async()=>{
 const store={list:async()=>[],put:async()=>{throw Error('Quota exceeded')},remove:async()=>{}};const ui=page(store,[failed()]);
 try{await ui.panel.ready;assert.equal(ui.panel.records().length,1);assert.match(ui.root.textContent,/not saved across refresh/);assert.match(ui.root.textContent,/Quota exceeded/);assert.equal(await ui.panel.records()[0].blob.text(),'unchanged original bytes')}
 finally{ui.panel.destroy();ui.dom.window.close()}
});
test('repair ZIP preserves originals, folder paths and machine-readable error report',async()=>{
 const item=failed('../Subject/failed.pdf'),record={...item,id:failureId(item),name:item.file.name,blob:item.file,updatedAt:1};
 const blob=await buildFailureZip([record],()=>new JSZip());const zip=await JSZip.loadAsync(await blob.arrayBuffer());
 assert.equal(await zip.file('originals/Subject/failed.pdf').async('text'),'unchanged original bytes');const report=JSON.parse(await zip.file('failure-report.json').async('text'));assert.equal(report.files[0].expectedMCQs,19);assert.equal(report.files[0].extractedMCQs,18);assert.equal(report.files[0].error,'MCQ count mismatch');assert.equal(Object.keys(zip.files).some(path=>path.includes('../')),false);
});
