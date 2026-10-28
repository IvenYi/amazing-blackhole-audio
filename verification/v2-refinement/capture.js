async parent=>{
 const context=await parent.context().browser().newContext({viewport:{width:393,height:852},deviceScaleFactor:2});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5177/luminous.html?embed=1&scene=recording&motion=flowing');
 await page.waitForFunction(()=>Number(document.querySelector('.luminous-canvas')?.dataset.frames)>0);
 const downloadPromise=page.waitForEvent('download',{timeout:90000});
 const info=await page.evaluate(async()=>{
  const canvas=document.querySelector('canvas'),root=document.querySelector('.luminous-canvas');
  const stream=canvas.captureStream(60),samples=[];
  const sample=()=>samples.push({wall:performance.now(),time:Number(root.dataset.time),frames:Number(root.dataset.frames)});
  const interval=setInterval(sample,1000);sample();
  const mime='video/mp4;codecs=avc1.64002a';
  if(!MediaRecorder.isTypeSupported(mime))throw new Error('H.264 capture unavailable');
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:16000000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  const done=new Promise(resolve=>recorder.onstop=resolve);
  recorder.start();await new Promise(resolve=>setTimeout(resolve,64000));recorder.stop();await done;
  clearInterval(interval);sample();stream.getTracks().forEach(track=>track.stop());
  const blob=new Blob(chunks,{type:mime}),link=document.createElement('a');link.href=URL.createObjectURL(blob);
  link.download='luminous-v2-refined-dpr2.mp4';link.click();
  return {mime:recorder.mimeType,width:canvas.width,height:canvas.height,dpr:devicePixelRatio,bytes:blob.size,filename:link.download,samples};
 });
 const download=await downloadPromise;await download.saveAs('output/playwright/'+info.filename);await context.close();
 if(errors.length)throw new Error(JSON.stringify(errors));return {...info,errors};
}
