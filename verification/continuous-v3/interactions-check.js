async (page) => {
  const checks=[]; const check=(name,ok)=>{checks.push({name,passed:!!ok});if(!ok)throw new Error(name)};
  await page.getByRole('button',{name:'录音聚拢',exact:true}).click();
  await page.getByRole('button',{name:'暂停演示',exact:true}).click();
  check('tap pauses',await page.getByRole('button',{name:'继续演示',exact:true}).count()===1);
  await page.getByRole('button',{name:'继续演示',exact:true}).click();
  check('tap resumes',await page.getByRole('button',{name:'暂停演示',exact:true}).count()===1);
  await page.getByRole('button',{name:'暂停演示',exact:true}).click({delay:750});
  check('hold returns home',await page.getByRole('button',{name:'开始录音演示',exact:true}).count()===1);
  await page.getByRole('button',{name:'回放环流',exact:true}).click();
  await page.getByRole('button',{name:'示例前进15秒',exact:true}).click();
  check('seek control works',await page.getByRole('slider').inputValue()==='287');
  await page.getByRole('button',{name:'编辑',exact:true}).click();
  await page.getByRole('textbox',{name:'示例备注',exact:true}).fill('视觉验证备注');
  await page.getByRole('button',{name:'完成',exact:true}).click();
  check('note editor works',await page.getByText('视觉验证备注',{exact:true}).count()===1);
  await page.getByRole('button',{name:'冻结画面',exact:true}).click();
  await page.getByRole('button',{name:'录音聚拢',exact:true}).click();
  await page.waitForTimeout(100);
  check('frozen canvas still responds to scene switch',await page.locator('.luminous-canvas').getAttribute('data-scene')==='recording');
  await page.getByRole('button',{name:'继续动画',exact:true}).click();
  // Exercise the browser's real context-loss path, then ensure rendering resumes.
  const oldFrames=Number(await page.locator('.luminous-canvas').getAttribute('data-frames'));
  await page.locator('canvas').evaluate(canvas=>{ const gl=canvas.getContext('webgl2');const loss=gl.getExtension('WEBGL_lose_context');loss.loseContext();setTimeout(()=>loss.restoreContext(),200); });
  await page.waitForTimeout(1800);
  check('WebGL restores and continues rendering',Number(await page.locator('.luminous-canvas').getAttribute('data-frames'))>oldFrames);
  return checks;
}
