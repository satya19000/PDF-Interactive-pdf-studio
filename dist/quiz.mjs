// A clean question bank is built from source text, never by covering printed answers.
const letters = 'ABCDE';
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const norm = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function textLinesFromItems(items) {
  const lines=[];
  for(const item of items){
    if(!item.str?.trim()||!item.transform||item.transform.length<6)continue;
    const y=item.transform[5],x=item.transform[4],last=lines.at(-1);
    if(last&&Math.abs(last.y-y)<2&&x>=last.x-1){last.parts.push(item.str);last.x=x;}
    else lines.push({y,x,parts:[item.str]});
  }
  return lines.map(line=>clean(line.parts.join(' '))).filter(Boolean);
}

export function parseStructured(text) {
  const questions = [];
  const questionStart = /^(?:Q(?:uestion)?\s*[-.:#]?\s*\d+[.)]?|\d+[.)])(?:\s+|$)/i;
  const chunks = String(text).split(/(?=^\s*(?:Q(?:uestion)?\s*[-.:#]?\s*\d+[.)]?|\d+[.)])(?:\s+|$))/gim);
  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (/^(?:Q(?:uestion)?\s*[-.:#]?\s*\d+[.)]?|\d+[.)])$/i.test(lines[0] || '') && lines[1]) lines.splice(0,2,lines[0]+' '+lines[1]);
    if (!questionStart.test(lines[0] || '')) continue;
    const options = [], stem = [], explanation = [];
    let answer = null, answerText = '', inExplanation = false, afterAnswer = false;
    stem.push(lines[0].replace(/^(?:Q(?:uestion)?\s*[-.:#]?\s*\d+[.)]?|\d+[.)])\s*/i,''));
    for (const line of lines.slice(1)) {
      const a = /^(?:correct\s+)?answer\s*[:\-]\s*(.*)$/i.exec(line);
      if (a) { answerText=a[1].trim();afterAnswer=true;inExplanation=false;continue; }
      if (/^(?:explanation|discussion|rationale)\s*[:\-]?/i.test(line)) { inExplanation = true; explanation.push(line.replace(/^(?:explanation|discussion|rationale)\s*[:\-]?\s*/i, '')); continue; }
      if (afterAnswer && !inExplanation) {answerText+=(answerText?' ':'')+line;continue;}
      const o = /^([A-E])[.)]\s+(.+)/i.exec(line);
      if (o && !inExplanation && options.length < 5) { options.push(clean(o[2])); continue; }
      if (inExplanation) explanation.push(line);
      else if (options.length) options[options.length - 1] += ' ' + line;
      else stem.push(line);
    }
    const answerLetter=/^([A-E])(?:\b|[.)])/i.exec(answerText);
    if(answerLetter)answer=letters.indexOf(answerLetter[1].toUpperCase());
    else if(answerText){const exact=options.map(norm).findIndex(value=>value===norm(answerText));if(exact>=0)answer=exact;}
    if (options.length >= 2 && clean(stem.join(' '))) {
      questions.push({ id: `structured-${questions.length + 1}`, stem: clean(stem.join(' ')), options, answer: Number.isInteger(answer)&&answer<options.length?answer:null, explanation: clean(explanation.join(' ')), sourcePage: null, verified:Number.isInteger(answer) });
    }
  }
  return questions;
}

export function parseBmj(pages) {
  const groups = [], seen = new Set();
  for (let page = 0; page < pages.length; page++) {
    const header = pages[page].find(i => /Question\s+(\d+)\s+of\s+(\d+)/i.test(i.str || ''));
    const match = header && /Question\s+(\d+)\s+of\s+(\d+)/i.exec(header.str);
    if (!match) continue;
    const id = `${match[2]}-${match[1]}`;
    if (!seen.has(id)) { seen.add(id); groups.push({ id, number: Number(match[1]), total: Number(match[2]), start: page }); }
  }
  if (!groups.length) return [];
  return groups.map((group, gi) => {
    const end = groups[gi + 1]?.start ?? pages.length;
    const options = [], stemItems = [], explanationItems = [], learningItems = [];
    let optionEnd = false, firstOptionY = 0, answerPage = null, hasVisual = false;
    for (let page = group.start; page < end; page++) {
      const items = pages[page], isAnswer = items.some(i => clean(i.str) === 'Key learning points');
      if(isAnswer && items.some(i=>/\bPhotographic\b/i.test(i.str||'')))hasVisual=true;
      if (isAnswer && answerPage === null) answerPage = page;
      if (isAnswer || (answerPage !== null && page > answerPage)) {
        const explanation = items.find(i => clean(i.str) === 'Explanation');
        const learning = items.find(i => clean(i.str) === 'Key learning points');
        const exY = explanation?.transform[5] ?? (isAnswer ? -1 : 1120);
        const learnY = learning?.transform[5] ?? -1;
        for (const item of items) {
          const x = item.transform[4], y = item.transform[5], t = clean(item.str);
          if (x >= 95 && x < 675 && y < exY && y > 35 && t && !/^(?:Incorrect|Correct|Good try!|Common Mistake!|Further Reading|Add revision notes|Save notes|Next question|Time elapsed|My score|Question navigator|Rate this question)/i.test(t)) explanationItems.push({ x, y, text: t });
          if (x >= 120 && x < 675 && y < learnY && y > exY + 5 && t) learningItems.push({ x, y, text: t });
        }
        continue;
      }
      if (optionEnd) continue;
      const button = items.some(i => /Answer question/i.test(i.str || ''));
      for (const item of items) {
        const x = item.transform[4], y = item.transform[5], t = clean(item.str);
        if (x >= 118 && x <= 120 && t && !/^\d+$/.test(t) && y > 28 && y < 1170) options.push({ text: t, page, y });
        if (group.id === '121-64' && t === 'I Thyroid uptake scan') options.push({ text: t, page, y });
      }
      if (page === group.start) {
        // Source stem lines, including investigations. Exclude the navigation header and options.
        const ys = options.filter(o => o.page === page).map(o => o.y);
        firstOptionY = Math.max(...ys, 0);
        for (const item of items) {
          const x = item.transform[4], y = item.transform[5], t = clean(item.str);
          if (x >= 77 && x < 675 && y < 955 && y > firstOptionY + 14 && t && !/^(?:Previous|Next|Exit session|English|French|Question \d+ of \d+|Answer question|High impact question)$/.test(t)) stemItems.push({ x, y, text: t });
        }
      }
      if (button) optionEnd = true;
    }
    options.sort((a, b) => a.page - b.page || b.y - a.y);
    const combined=[];
    for(const option of options){const previous=combined.at(-1);if(previous&&previous.page===option.page&&previous.y-option.y<24){previous.text+=' '+option.text;}else combined.push({...option});}
    const sorted = xs => xs.sort((a,b) => b.y - a.y || a.x - b.x).map(i => i.text).join(' ');
    const explanation = clean(sorted(explanationItems));
    const learning = clean(sorted(learningItems));
    const candidates = combined.map((option, index) => ({ index, phrase: norm(option.text) })).filter(o => o.phrase.length >= 5 && (norm(learning).includes(o.phrase) || norm(explanation).includes(o.phrase)));
    // Answer-page prose can mention several distractors. Trust only a unique match in the learning point.
    const learningHits = candidates.filter(o => norm(learning).includes(o.phrase));
    const answer = learningHits.length === 1 ? learningHits[0].index : null;
    return { id: group.id, stem: clean(sorted(stemItems)), options: combined.map(o => o.text), answer, explanation: clean([learning, explanation].filter(Boolean).join(' ')), sourcePage: group.start + 1, answerPage: answerPage === null ? null : answerPage + 1, endPage: end, optionTopY:firstOptionY, verified: false, hasVisual };
  }).filter(q => q.options.length >= 2 && q.options.length <= 5 && q.stem);
}

export async function inferBmjAnswerColors(pdfjs, questions, onProgress=()=>{}) {
  const scale=.4;
  for(let qi=0;qi<questions.length;qi++){
    const q=questions[qi];if(!q.answerPage)continue;
    const matches=new Set();
    for(let pageNumber=q.answerPage;pageNumber<=Math.min(q.endPage,q.answerPage+2);pageNumber++){
      const page=await pdfjs.getPage(pageNumber), items=(await page.getTextContent()).items;
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(page.view[2]*scale);canvas.height=Math.ceil(page.view[3]*scale);
      const ctx=canvas.getContext('2d',{willReadFrequently:true});await page.render({canvasContext:ctx,viewport:page.getViewport({scale})}).promise;
      for(const item of items){
        const x=item.transform[4],y=item.transform[5],t=norm(item.str);
        if(x<90||x>110||!t||y<30||y>1170)continue;
        const py=Math.floor((page.view[3]-y-8)*scale), px=Math.floor(84*scale);
        if(py<0||py>=canvas.height)continue;
        const pixel=ctx.getImageData(px,py,1,1).data;
        if(pixel[1]<pixel[0]+8||pixel[1]<pixel[2]+18)continue;
        q.options.forEach((option,index)=>{const optionText=norm(option);if(optionText===t||optionText.startsWith(t+' ')||t.startsWith(optionText+' '))matches.add(index)});
      }
      canvas.width=0;canvas.height=0;
      if(matches.size)break;
    }
    if(matches.size===1){q.answer=[...matches][0];q.verified=true}
    if(qi%10===0){onProgress(qi+1,questions.length);await new Promise(resolve=>setTimeout(resolve,0))}
  }
  return questions;
}

export async function captureBmjFigures(pdfjs,questions,onProgress=()=>{}){
  const figures=questions.filter(q=>q.hasVisual);
  for(let index=0;index<figures.length;index++){
    const q=figures[index];
    const page=await pdfjs.getPage(q.sourcePage),scale=.85;
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(page.view[2]*scale);canvas.height=Math.ceil(page.view[3]*scale);
    const ctx=canvas.getContext('2d');await page.render({canvasContext:ctx,viewport:page.getViewport({scale})}).promise;
    const top=220,bottom=Math.max(top+80,Math.min(page.view[3]-q.optionTopY-18,page.view[3]-45));
    const sourceX=Math.floor(75*scale),sourceY=Math.floor(top*scale),width=Math.floor(695*scale),height=Math.floor((bottom-top)*scale);
    const crop=document.createElement('canvas');crop.width=width;crop.height=height;
    crop.getContext('2d').drawImage(canvas,sourceX,sourceY,width,height,0,0,width,height);
    q.visualData=crop.toDataURL('image/jpeg',.82);canvas.width=0;canvas.height=0;crop.width=0;crop.height=0;
    onProgress(index+1,figures.length);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
}

export function validateQuiz(questions) {
  return questions.filter(q => !q.stem || q.options.length < 2 || q.options.length > 5 || (Number.isInteger(q.answer) && (q.answer < 0 || q.answer >= q.options.length)) || (q.hasVisual&&!q.visualData));
}

function ascii(value) { return String(value || '').replace(/[^\x20-\x7e]/g, c => ({'×':'x','µ':'u','μ':'u','°':' degrees ','–':'-','—':'-','’':"'"}[c] || ' ')); }
function lineCount(text,font,size,width){let lines=1,line='';for(const word of ascii(text).split(/\s+/)){if(font.widthOfTextAtSize((line?line+' ':'')+word,size)<=width)line+=(line?' ':'')+word;else{lines++;line=word}}return lines}
function wrappedLines(text,width,font,size) {
  const words = ascii(text).split(/\s+/), lines = []; let line = '';
  for (const word of words) {
    if (font.widthOfTextAtSize((line ? line + ' ' : '') + word, size) <= width) line += (line ? ' ' : '') + word;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}
function drawWrapped(page, text, x, y, width, font, size, color, lineHeight = size * 1.42) {
  const lines=wrappedLines(text,width,font,size);
  for (const row of lines) { page.drawText(row, {x,y,size,font,color}); y -= lineHeight; }
  return y;
}
function goto(doc, page, rectangle, target) {
  const {PDFName, PDFArray,PDFNumber} = globalThis.PDFLib;
  const destination = PDFArray.withContext(doc.context);
  destination.push(target.ref); destination.push(PDFName.of('XYZ'));
  destination.push(PDFNumber.of(0));destination.push(PDFNumber.of(target.getHeight()*1.5));destination.push(PDFNumber.of(0));
  const annotation = doc.context.obj({Type:PDFName.of('Annot'),Subtype:PDFName.of('Link'),Rect:rectangle,Border:[0,0,0]});
  annotation.set(PDFName.of('A'),doc.context.obj({S:PDFName.of('GoTo'),D:destination}));
  page.node.addAnnot(doc.context.register(annotation));
}
export async function buildQuizPdf(questions, title, onProgress=()=>{}) {
  if (!questions.length || validateQuiz(questions).length) throw new Error('Some questions could not be extracted. Try a text-based PDF with clear options.');
  const {PDFDocument,StandardFonts,rgb} = globalThis.PDFLib;
  const doc = await PDFDocument.create(), regular = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(.11,.17,.27), green = rgb(.08,.47,.28), red = rgb(.74,.15,.17), amber = rgb(.52,.36,.09), blue = rgb(.15,.32,.75), grey = rgb(.39,.45,.54);
  const questionPages = [], feedbackPages = [], visualPages=[];
  const heading = ascii(title.trim() || 'MCQ Question Bank');
  const header = (page, label, color) => {
    page.drawRectangle({x:0,y:794,width:595,height:48,color});
    let short=heading;
    while(short.length && bold.widthOfTextAtSize(short,12)>510) short=short.slice(0,-1);
    if(short!==heading) short=short.slice(0,-3)+'...';
    page.drawText(short,{x:42,y:819,size:12,font:bold,color:rgb(1,1,1)});
    page.drawText(label,{x:42,y:801,size:10,font:bold,color:rgb(1,1,1)});
  };
  for (const q of questions) {
    const question = doc.addPage([595,842]); questionPages.push(question);
    const results = q.options.map(() => doc.addPage([595,842])); feedbackPages.push(results);visualPages.push(q.visualData?doc.addPage([595,842]):null);
  }
  for (let qi=0; qi<questions.length; qi++) {
    const q=questions[qi], page=questionPages[qi], results=feedbackPages[qi];
    header(page,`QUESTION ${qi+1} / ${questions.length}`,blue);
    let y=754,stemSize=12,stemLine=17;
    const minOptionHeight=58;
    while(stemSize>9 && y-lineCount(q.stem,regular,stemSize,510)*stemLine-34-q.options.length*minOptionHeight<65){stemSize--;stemLine=stemSize*1.38;}
    if(y-lineCount(q.stem,regular,stemSize,510)*stemLine-34-q.options.length*minOptionHeight<65)throw new Error(`Question ${qi+1} is too long for one quiz page. Edit its stem before export.`);
    y=drawWrapped(page,q.stem,42,y,510,regular,stemSize,ink,stemLine)-34;
    q.options.forEach((option,oi) => {
      const height=Math.max(minOptionHeight,Math.ceil(ascii(option).length/68)*16+26);
      const bottom=y-height+12;
      page.drawRectangle({x:41,y:bottom,width:512,height:height-6,borderWidth:1,borderColor:rgb(.75,.80,.89),color:rgb(.975,.983,1)});
      page.drawText(`${letters[oi]}.`,{x:54,y:y-11,size:12,font:bold,color:blue});
      drawWrapped(page,option,79,y-11,460,regular,11,ink,15);
      goto(doc,page,[41,bottom,553,bottom+height-6],results[oi]);
      y=bottom-14;
    });
    if(visualPages[qi]){page.drawText('View source figure  >',{x:42,y:42,size:10,font:bold,color:blue});goto(doc,page,[40,36,188,56],visualPages[qi]);}
    else page.drawText('Choose one option to check your answer.',{x:42,y:42,size:10,font:regular,color:grey});
    if(visualPages[qi]){const figure=visualPages[qi],image=await doc.embedJpg(q.visualData),ratio=Math.min(510/image.width,670/image.height);header(figure,`SOURCE FIGURE · QUESTION ${qi+1}`,blue);figure.drawImage(image,{x:42,y:750-image.height*ratio,width:image.width*ratio,height:image.height*ratio});figure.drawText('Back to question',{x:42,y:42,size:11,font:bold,color:blue});goto(doc,figure,[40,35,210,60],page);}
    results.forEach((result,oi) => {
      const hasAnswer=Number.isInteger(q.answer),correct=hasAnswer&&oi===q.answer,accent=hasAnswer?(correct?green:red):amber;
      header(result,hasAnswer?(correct?'CORRECT ANSWER':'INCORRECT ANSWER'):'NO ANSWER FOR THIS QUESTION',accent);
      let ry=750;
      ry=drawWrapped(result,`Your choice: ${letters[oi]}. ${q.options[oi]}`,42,ry,510,bold,12,accent,18)-24;
      ry=drawWrapped(result,hasAnswer?`Correct answer: ${letters[q.answer]}. ${q.options[q.answer]}`:'No answer for this question',42,ry,510,bold,12,hasAnswer?green:amber,18)-32;
      result.drawText('EXPLANATION',{x:42,y:ry,size:12,font:bold,color:ink});
      const explanation=q.explanation?.trim()||'No explanation provided.';
      const lines=wrappedLines(explanation,510,regular,11),start=ry-27;
      if(start-lines.length*16>=105){lines.forEach((line,index)=>result.drawText(line,{x:42,y:start-index*16,size:11,font:regular,color:ink}));}
      else {
        const previewCount=Math.max(0,Math.min(10,Math.floor((start-145)/16)));
        lines.slice(0,previewCount).forEach((line,index)=>result.drawText(line,{x:42,y:start-index*16,size:11,font:regular,color:ink}));
        const detailPages=[];
        for(let offset=0;offset<lines.length;offset+=38)detailPages.push(doc.addPage([595,842]));
        detailPages.forEach((detail,index)=>{
          header(detail,`EXPLANATION · QUESTION ${qi+1} · PAGE ${index+1}/${detailPages.length}`,blue);
          lines.slice(index*38,(index+1)*38).forEach((line,row)=>detail.drawText(line,{x:42,y:754-row*16,size:11,font:regular,color:ink}));
          detail.drawText(index?'Previous explanation page':'Back to result',{x:42,y:69,size:11,font:bold,color:blue});
          goto(doc,detail,[40,63,245,84],index?detailPages[index-1]:result);
          if(detailPages[index+1]){detail.drawText('Continue  >',{x:420,y:69,size:11,font:bold,color:blue});goto(doc,detail,[412,63,555,84],detailPages[index+1]);}
        });
        result.drawText('Read full explanation  >',{x:42,y:112,size:11,font:bold,color:blue});
        goto(doc,result,[40,105,250,130],detailPages[0]);
      }
      result.drawText('Try this question again',{x:42,y:69,size:11,font:bold,color:blue}); goto(doc,result,[40,63,230,84],page);
      if (questionPages[qi+1]) {result.drawText('Next question  >',{x:390,y:69,size:11,font:bold,color:blue});goto(doc,result,[382,63,555,84],questionPages[qi+1]);}
    });
    if(qi%5===0||qi===questions.length-1){onProgress(qi+1,questions.length);await new Promise(resolve=>setTimeout(resolve,0));}
  }
  // A 100% PDF viewer now displays the old page's content at 150% size.
  // Scale link rectangles as well as visible content so choices remain clickable.
  for(const page of doc.getPages()) page.scale(1.5,1.5);
  doc.setTitle(ascii(title)); doc.setCreator('PDF Interactive Studio - Quiz PDF');
  onProgress(questions.length,questions.length,'Saving PDF');
  return {bytes:await doc.save({useObjectStreams:true}),pages:doc.getPageCount(),sourcePages:questions.length,mcqs:questions.length};
}
