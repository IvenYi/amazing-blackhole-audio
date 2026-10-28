async page=>{
 const checks=[],errors=[];const canvas=await page.$('.luminous-canvas canvas');
 const check=(name,condition)=>{checks.push({name,passed:!!condition});if(!condition)throw new Error(name);};
 const error=message=>{if(message.type()==='error')errors.push(message.text())};page.on('console',error);
 for(const [name,key] of [['V1 · 波纹','ripple'],['V2 · 已保存','continuous'],['V2.1 · 流动调整','flowing']]){
  await page.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(1200);
  check(name+' selection',await page.getByRole('button',{name,exact:true}).getAttribute('aria-pressed')==='true');
  check(name+' renderer reused',await canvas.evaluate(el=>el===document.querySelector('canvas')));
  check(name+' rendered',await page.locator('.luminous-canvas').getAttribute('data-motion')===key);
 }
 check('no shader errors across modes',errors.length===0);page.off('console',error);
 return {checks,errors};
}
