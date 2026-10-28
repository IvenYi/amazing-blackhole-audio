async page=>{
 await page.goto('http://127.0.0.1:5177/luminous.html?scene=recording&motion=flowing');await page.waitForTimeout(600);
 const messages=[];const listener=m=>{if(m.type()==='warning'||m.type()==='error')messages.push({type:m.type(),text:m.text()})};page.on('console',listener);
 await page.locator('canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2'),extension=gl.getExtension('WEBGL_lose_context');extension.loseContext();setTimeout(()=>extension.restoreContext(),200)});
 await page.waitForTimeout(1300);
 for(const name of ['V2 · 已保存','V2.1 · 流动调整','首页视界','录音聚拢']){await page.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(700)}
 await page.goto('http://127.0.0.1:5177/luminous.html?scene=home&motion=flowing');await page.waitForTimeout(600);
 page.off('console',listener);
 if(messages.length)throw new Error(JSON.stringify(messages));
 return {checks:[{name:'context loss, restoration, mode switch, scene switch and renderer disposal produce no GL warnings or errors',passed:true}],messages};
}
