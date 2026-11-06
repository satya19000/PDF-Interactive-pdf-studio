// Independent source markers; never use the extracted array length as its own audit.
export function explicitSourceCount(text){return (String(text).match(/^\s*(?:Q(?:uestion)?\s*[-.:#]?\s*\d+[.)]?|\d+[.)])(?:\s+|$)/gim)||[]).length;}
export function visualSourceCount(pages,toRows){
 let count=0;
 for(const page of pages){const rows=toRows(page);let options=[];
  for(const row of rows){if(/^Explanation\b/i.test(row.text)){if(options.join('')==='ABCDE')count++;options=[];continue;}
   if(row.letter==='A')options=['A'];else if(row.letter&&options.length)options.push(row.letter);
  }
 }
 return count;
}
export function checkRunning(signal){if(signal?.aborted){const error=new Error('Conversion stopped. Original file kept for retry.');error.name='AbortError';throw error;}}
export async function boundedWork(work,{signal,timeout=180000,onStop=()=>{}}={}){
 checkRunning(signal);let timer,abort;
 const interrupted=new Promise((_,reject)=>{const stop=error=>{try{Promise.resolve(onStop()).catch(()=>{})}catch{}reject(error)};
  timer=setTimeout(()=>stop(new Error('OCR page exceeded 3 minutes. Original saved for retry.')),timeout);
  abort=()=>{const error=new Error('Conversion stopped. Original file kept for retry.');error.name='AbortError';stop(error)};
  signal?.addEventListener('abort',abort,{once:true});
 });
 try{return await Promise.race([Promise.resolve().then(work),interrupted])}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
export function compactSourceImage(canvas){
 // Retain source pixel dimensions. Prefer PNG unless a 96%-quality JPEG is materially smaller.
 const png=canvas.toDataURL('image/png'),jpeg=canvas.toDataURL('image/jpeg',.96);
 return jpeg.length<png.length*.75?jpeg:png;
}
