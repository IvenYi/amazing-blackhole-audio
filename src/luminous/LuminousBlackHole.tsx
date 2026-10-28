import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { vertexShader } from '../components/black-hole-shaders';
import { luminousField } from './shaders';
import homeArt from './artwork/home.png';
import recordingArt from './artwork/recording.png';
import playbackArt from './artwork/playback.png';
import desktopArt from './artwork/desktop.png';
import { LUMINOUS_SCENES, type LuminousScene } from './scenes';

export interface LuminousBlackHoleProps {
  scene?: LuminousScene;
  active?: boolean;
  /** Fixed shader time for screenshots; never used for normal animation. */
  deterministicTime?: number;
}

/** Visual-only prototype. No microphone, audio permissions, recording, or storage. */
export default function LuminousBlackHole({ scene = 'home', active = true, deterministicTime }: LuminousBlackHoleProps) {
  const root = useRef<HTMLDivElement>(null);
  const settings = useRef({ scene, active, deterministicTime });
  const wake = useRef<() => void>(() => {});
  const [error, setError] = useState(false);
  settings.current = { scene, active, deterministicTime };
  useEffect(() => { wake.current(); }, [scene, active, deterministicTime]);

  useEffect(() => {
    const element = root.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: 'high-performance' });
    } catch { setError(true); return; }
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    element.append(canvas);
    renderer.autoClear = false;
    const graph = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0], 3));
    const initial=LUMINOUS_SCENES[settings.current.scene];
    const shape={ ...initial };
    const keys: LuminousScene[]=['home','recording','paused','playback'];
    const weights=keys.map(key=>key===settings.current.scene?1:0);
    let ready=false;
    const loader=new THREE.TextureLoader();
    const textures: THREE.Texture[]=[];
    const uniforms = {
      uResolution: { value: new THREE.Vector2(1,1) }, uWeights: { value: new THREE.Vector4(...weights) },
      uEnergy: { value: shape.energy }, uTime: { value: 0 },
      uHome: { value: null as THREE.Texture | null }, uRecording: { value: null as THREE.Texture | null },
      uPlayback: { value: null as THREE.Texture | null }, uDesktop: { value: null as THREE.Texture | null },
    };
    const fieldMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader, fragmentShader: luminousField, uniforms,
      depthWrite: false, depthTest: false, blending: THREE.NoBlending,
    });
    const triangle = new THREE.Mesh(geometry, fieldMaterial);
    triangle.frustumCulled = false;
    graph.add(triangle);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0, last = 0, elapsed = 0, visible = true, lost = false, disposed = false;
    let width = 0, height = 0, ratio = 0;
    let frameCount = 0;
    const resize = () => {
      const w = Math.round(element.clientWidth), h = Math.round(element.clientHeight), dpr = Math.min(devicePixelRatio || 1, 2);
      if (w < 2 || h < 2) return false;
      if (w !== width || h !== height || ratio !== dpr) {
        width = w; height = h; ratio = dpr;
        renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
        uniforms.uResolution.value.set(Math.round(w*dpr),Math.round(h*dpr));
      }
      return true;
    };
    const request = () => {
      if (!raf && ready && !disposed && !lost && visible && !document.hidden) raf=requestAnimationFrame(draw);
    };
    const draw = (now: number) => {
      raf=0;
      if (disposed || lost || !visible || document.hidden) { last=0; return; }
      if (last && now-last < 1000/60-.5) { request(); return; }
      if (!resize()) { last=0; return; }
      const dt=last?Math.min((now-last)/1000,.05):1/60;
      last=now;
      const fixed=Number.isFinite(settings.current.deterministicTime);
      const target=LUMINOUS_SCENES[settings.current.scene];
      const amount=reduced.matches||fixed||!settings.current.active?1:1-Math.exp(-dt/.48);
      let moving=false;
      for(const key of ['energy','speed'] as const) {
        shape[key]+=(target[key]-shape[key])*amount;
        moving ||= Math.abs(shape[key]-target[key])>.0001;
      }
      for(let i=0;i<4;i++) {
        const targetWeight=keys[i]===settings.current.scene?1:0;
        weights[i]+=(targetWeight-weights[i])*amount;
        moving ||= Math.abs(weights[i]-targetWeight)>.0001;
      }
      if (!reduced.matches && !fixed && settings.current.active) elapsed+=dt*shape.speed;
      uniforms.uTime.value=fixed?settings.current.deterministicTime!:elapsed;
      uniforms.uWeights.value.set(weights[0],weights[1],weights[2],weights[3]);
      uniforms.uEnergy.value=shape.energy;
      renderer.render(graph,camera);
      frameCount++;
      if(frameCount===1 || frameCount%60===0 || reduced.matches || fixed || !settings.current.active) {
        element.dataset.frames=String(frameCount); element.dataset.scene=settings.current.scene;
        element.dataset.resolution=`${canvas.width}x${canvas.height}`;
      }
      if (settings.current.active && ((!fixed && !reduced.matches) || moving)) request();
    };
    const suspend = () => { cancelAnimationFrame(raf); raf=0; last=0; };
    const onVisibility = () => { suspend(); request(); };
    const onLost = (event: Event) => { event.preventDefault(); lost=true; suspend(); };
    const onRestore = () => { lost=false; request(); };
    const onMotion = () => { suspend(); request(); };
    const observer = new ResizeObserver(() => { resize(); request(); });
    observer.observe(element);
    const intersection = new IntersectionObserver(([entry]) => { visible=entry.isIntersecting; suspend(); request(); });
    intersection.observe(element);
    document.addEventListener('visibilitychange',onVisibility);
    reduced.addEventListener('change',onMotion);
    canvas.addEventListener('webglcontextlost',onLost);
    canvas.addEventListener('webglcontextrestored',onRestore);
    wake.current=() => { suspend(); request(); };
    Promise.all([homeArt,recordingArt,playbackArt,desktopArt].map(url=>loader.loadAsync(url).then(texture=>{
      if(disposed) texture.dispose(); else textures.push(texture);
      return texture;
    }))).then(loaded=>{
      if(disposed) return;
      for(const texture of loaded) { texture.minFilter=THREE.LinearFilter; texture.magFilter=THREE.LinearFilter; texture.generateMipmaps=false; }
      [uniforms.uHome.value,uniforms.uRecording.value,uniforms.uPlayback.value,uniforms.uDesktop.value]=loaded;
      ready=true; request();
    }).catch(()=>{if(!disposed)setError(true);});
    return () => {
      disposed=true; suspend(); wake.current=() => {};
      observer.disconnect(); intersection.disconnect(); document.removeEventListener('visibilitychange',onVisibility);
      reduced.removeEventListener('change',onMotion); canvas.removeEventListener('webglcontextlost',onLost); canvas.removeEventListener('webglcontextrestored',onRestore);
      geometry.dispose(); fieldMaterial.dispose();
      textures.forEach(texture=>texture.dispose()); renderer.dispose(); canvas.remove();
    };
  }, []);
  return <div ref={root} className="luminous-canvas">{error && <p role="status">当前环境无法加载黑洞预览</p>}</div>;
}
