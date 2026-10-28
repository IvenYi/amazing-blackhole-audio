from PIL import Image
import numpy as np,json,hashlib,re
from pathlib import Path
frames=[np.asarray(Image.open(f'work/continuous-frames/{i}.png').convert('RGB').crop((0,180,786,1080)),dtype=np.float32).mean(axis=2) for i in range(64)]
x=np.stack(frames);d=np.abs(x[1:]-x[:-1]).mean(axis=(1,2));residual=(x-np.median(x,axis=0)).reshape((64,-1));corr={}
for lag in [2,5,9,15,30]:
 vals=[]
 for a,b in zip(residual[:-lag],residual[lag:]):
  den=np.linalg.norm(a)*np.linalg.norm(b)
  if den:vals.append(float(np.dot(a,b)/den))
 corr[str(lag)]={'mean':float(np.mean(vals)),'max':float(np.max(vals))}
result={'source':'luminous-continuous-v3-dpr2.mp4','samples':64,'sample_interval_seconds':1,'roi':[0,180,786,1080],
 'adjacent_mean_absolute_pixel_change_0_255':{'min':float(d.min()),'mean':float(d.mean()),'max':float(d.max())},
 'temporal_residual_correlation_by_lag_seconds':corr,
 'checks':{'every_sampled_second_has_motion':bool((d>.15).all()),'all_64_samples_differ':len({a.tobytes() for a in frames})==64},
 'limits':'Pixel changes do not prove cinematic quality, optical-flow direction, non-repetition at all times, presented FPS, or Xiaomi performance.'}
assert all(result['checks'].values())
Path('verification/continuous-v3/motion-samples.json').write_text(json.dumps(result,indent=2)+'\n')
media={name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for name in ['luminous-continuous-v3-dpr2.mp4','luminous-continuous-v3-detail.mp4','luminous-continuous-v3-preview.mp4'] for p in [Path('output/playwright',name)]}
media['avfoundation_observation']=Path('work/continuous-frames-info.txt').read_text().splitlines()[-1]
Path('verification/continuous-v3/media.json').write_text(json.dumps(media,indent=2)+'\n')
for i in [2,12,32,62]:Image.open(f'work/continuous-frames/{i}.png').crop((0,180,786,1080)).save(f'output/playwright/continuous-v3-t{i}.png')
print(json.dumps({'motion':result['checks'],'media':media},indent=2))
