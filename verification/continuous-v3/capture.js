async (page) => {
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:2,mobile:false});
  await page.goto('http://127.0.0.1:5177/luminous.html?embed=1&scene=recording&motion=continuous');
  await page.waitForTimeout(600);
  const downloadPromise=page.waitForEvent('download',{timeout:90000});
  const info=await page.evaluate(async()=>{
    const canvas=document.querySelector('canvas');
    const stream=canvas.captureStream(60);
    const mime=MediaRecorder.isTypeSupported('video/mp4')?'video/mp4':'video/webm;codecs=vp9';
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:16000000});
    const chunks=[];
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
    const done=new Promise(resolve=>recorder.onstop=resolve);
    recorder.start(); await new Promise(resolve=>setTimeout(resolve,64000)); recorder.stop(); await done;
    stream.getTracks().forEach(track=>track.stop());
    const blob=new Blob(chunks,{type:mime});
    const link=document.createElement('a'); link.href=URL.createObjectURL(blob);
    link.download=mime.startsWith('video/mp4')?'luminous-continuous-v3-dpr2.mp4':'luminous-continuous-v3-dpr2.webm'; link.click();
    return {mime,width:canvas.width,height:canvas.height,bytes:blob.size,filename:link.download};
  });
  const download=await downloadPromise;
  await download.saveAs('output/playwright/'+info.filename);
  await cdp.send('Emulation.clearDeviceMetricsOverride'); await cdp.detach();
  return info;
}
