from PIL import Image,ImageFilter
import numpy as np,json,hashlib
from pathlib import Path
frames=[];coarse=[]
for i in range(64):
 image=Image.open(f'work/refined-frames/{i}.png').convert('L').crop((0,180,786,1080))
 frames.append(np.asarray(image,dtype=np.float32))
 coarse.append(np.asarray(image.resize((262,300)).filter(ImageFilter.GaussianBlur(5)),dtype=np.float32))
x=np.stack(frames);low=np.stack(coarse);delta=np.abs(x[1:]-x[:-1]).mean(axis=(1,2));bulk=np.abs(low[1:]-low[:-1]).mean(axis=(1,2))
yy,xx=np.mgrid[:900,:786];radius=np.hypot(xx-400,yy-481)
std=x.std(axis=0);rim=(radius>188)&(radius<215);core=radius<105
result={'samples':64,'interval_seconds':1,'native_roi':[0,180,786,1080],
 'adjacent_grayscale_pixel_difference':{'min':float(delta.min()),'mean':float(delta.mean()),'max':float(delta.max())},
 'coarse_light_field_difference':{'min':float(bulk.min()),'mean':float(bulk.mean()),'max':float(bulk.max())},
 'temporal_std_mean':{'core':float(std[core].mean()),'rim':float(std[rim].mean())},
 'checks':{'changes_each_sampled_second':bool((delta>.15).all()),'coarse_light_field_also_changes':bool((bulk>.05).all()),'rim_varies':bool(std[rim].mean()>.2)},
 'limits':'These checks confirm temporal changes, including low-frequency light, and varying rim light. They do not prove material trajectories, fluid physics, cinematic quality, presented FPS or Xiaomi performance.'}
assert all(result['checks'].values()),result
Path('verification/v2-refinement/motion.json').write_text(json.dumps(result,indent=2)+'\n')
media={name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for name in ['luminous-v2-refined-dpr2.mp4','luminous-v2-refined-detail.mp4','luminous-v2-refined-preview.mp4'] for p in [Path('output/playwright',name)]}
media['avfoundation_observation']=Path('work/refined-frames-info.txt').read_text().splitlines()[-1]
Path('verification/v2-refinement/media.json').write_text(json.dumps(media,indent=2)+'\n')
print(json.dumps(result,indent=2))
