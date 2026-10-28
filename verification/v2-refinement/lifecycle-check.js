async (page) => {
  const checks=[]; const errors=[];
  const onError=e=>errors.push(String(e)); const onConsole=m=>{if(m.type()==='error')errors.push(m.text())};
  page.on('pageerror',onError); page.on('console',onConsole);
  const check=(name,condition)=>{checks.push({name,passed:!!condition});if(!condition)throw new Error(name)};
  const stage=page.locator('.stage');
  const canvas=await page.$('.luminous-canvas canvas');
  check('one WebGL canvas',await page.locator('canvas').count()===1);
  const before=await stage.screenshot(); await page.waitForTimeout(1200); const after=await stage.screenshot();
  check('live animation changes rendered pixels',!before.equals(after));
  for(const name of ['录音聚拢','暂停收敛','回放环流','首页视界']) {
    await page.getByRole('button',{name,exact:true}).click(); await page.waitForTimeout(900);
    check(name+' reuses the renderer',await canvas.evaluate(el=>el===document.querySelector('.luminous-canvas canvas')));
    check(name+' state selected',await page.getByRole('button',{name,exact:true}).getAttribute('aria-pressed')==='true');
  }
  await page.getByRole('button',{name:'冻结画面',exact:true}).click();
  await page.waitForTimeout(100); const frozen=await stage.screenshot(); await page.waitForTimeout(300);
  check('freeze stops visible movement',frozen.equals(await stage.screenshot()));
  await page.getByRole('button',{name:'继续动画',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'}); await page.waitForTimeout(150);
  const still=await stage.screenshot(); await page.waitForTimeout(300);
  check('reduced motion produces a static frame',still.equals(await stage.screenshot()));
  await page.getByRole('button',{name:'回放环流',exact:true}).click(); await page.waitForTimeout(150);
  check('reduced motion still responds to state changes',!(await stage.screenshot()).equals(still));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:393,height:852}); await page.waitForTimeout(200);
  check('mobile has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1440,height:1100}); await page.getByRole('button',{name:'桌面',exact:true}).click(); await page.waitForTimeout(600);
  check('desktop layout uses the same canvas',await canvas.evaluate(el=>el===document.querySelector('.luminous-canvas canvas')));
  check('desktop has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('no browser or shader errors',errors.length===0);
  await page.getByRole('button',{name:'手机',exact:true}).click(); await page.getByRole('button',{name:'首页视界',exact:true}).click();
  page.off('pageerror',onError); page.off('console',onConsole);
  return {checks,errors};
}
