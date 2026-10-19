import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createPracticeStore,PracticeConflict} from '../dist/exam-store.mjs';
const attempt=id=>({id,paper:1,questions:[],answers:{},flags:[],bookmarks:[],index:0,startedAt:1000,endsAt:5000,submittedAt:null});
test('transactions prevent duplicate active papers and stale writes',async()=>{
 const store=createPracticeStore(new IDBFactory());
 try{const first=await store.start(attempt('one'),1000);await assert.rejects(store.start(attempt('two'),1000),PracticeConflict);
  const saved=await store.update(first.id,0,{answers:{0:1}},false,2000);assert.equal(saved.revision,1);
  await assert.rejects(store.update(first.id,0,{answers:{0:2}},false,2100),PracticeConflict);
  assert.deepEqual((await store.get(first.id)).answers,{0:1});
 }finally{await store.close()}
});
test('submission is idempotent and expiry rejects late changes',async()=>{
 const store=createPracticeStore(new IDBFactory());
 try{await store.start(attempt('one'),1000);await store.update('one',0,{answers:{0:1}},false,2000);
  const ended=await store.update('one',1,{answers:{0:4}},false,6000);assert.equal(ended.submittedAt,5000);assert.deepEqual(ended.answers,{0:1});
  const again=await store.update('one',0,{answers:{0:3}},true,7000);assert.deepEqual(again,ended);
 }finally{await store.close()}
});
