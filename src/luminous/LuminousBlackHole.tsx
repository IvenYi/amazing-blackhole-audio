import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { vertexShader } from '../components/black-hole-shaders';
import { luminousField as rippleField } from './ripple-shader';
import { prepareFlowMaterial } from './flow-material';
import { ContinuousFlow } from './continuous-flow';
import { luminousField as continuousField } from './continuous-shader';
import { luminousField as flowingField } from './flowing-shader';
import homeArt from './artwork/home.png';
import recordingArt from './artwork/recording.png';
import playbackArt from './artwork/playback.png';
import desktopArt from './artwork/desktop.png';
import { LUMINOUS_SCENES, type LuminousScene } from './scenes';

export interface LuminousBlackHoleProps {
  scene?: LuminousScene;
  active?: boolean;
  /** Drawing pixel-ratio ceiling. Native hosts may request their physical pixel ratio. */
  dpr?: number;
  /** Native page navigation can cut between compositions while reusing the renderer. */
  transition?: boolean;
  motion?: 'ripple' | 'continuous' | 'flowing';
  /** Fixed shader time for screenshots; never used for normal animation. */
  deterministicTime?: number;
}

/** Visual-only prototype. No microphone, audio permissions, recording, or storage. */
export default function LuminousBlackHole({ scene = 'home', active = true, dpr = 2, transition = true, motion = 'continuous', deterministicTime }: LuminousBlackHoleProps) {
  const root = useRef<HTMLDivElement>(null);
  const settings = useRef({ scene, active, dpr, transition, motion, deterministicTime });
  const wake = useRef<() => void>(() => {});
  const [error, setError] = useState(false);
  settings.current = { scene, active, dpr, transition, motion, deterministicTime };
  useEffect(() => { wake.current(); }, [scene, active, dpr, transition, motion, deterministicTime]);

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
      uFlowHome: { value: null as THREE.Texture | null }, uFlowRecording: { value: null as THREE.Texture | null },
      uFlowPlayback: { value: null as THREE.Texture | null }, uFlowDesktop: { value: null as THREE.Texture | null },
    };
    const rippleMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader, fragmentShader: rippleField, uniforms,
      depthWrite: false, depthTest: false, blending: THREE.NoBlending,
    });
    const continuousUniforms={...uniforms,
      uFlowHome:{value:null as THREE.Texture|null},uFlowRecording:{value:null as THREE.Texture|null},
      uFlowPlayback:{value:null as THREE.Texture|null},uFlowDesktop:{value:null as THREE.Texture|null}};
    const continuousMaterial=new THREE.RawShaderMaterial({
      glslVersion:THREE.GLSL3,vertexShader,fragmentShader:continuousField,uniforms:continuousUniforms,
      depthWrite:false,depthTest:false,blending:THREE.NoBlending,
    });
    let continuous:ContinuousFlow|undefined;
    let flowing:ContinuousFlow|undefined;
    const flowingMaterial=new THREE.RawShaderMaterial({
      glslVersion:THREE.GLSL3,vertexShader,fragmentShader:flowingField,
      uniforms:{...continuousUniforms,
        uGuideHome:uniforms.uFlowHome,uGuideRecording:uniforms.uFlowRecording,
        uGuidePlayback:uniforms.uFlowPlayback,uGuideDesktop:uniforms.uFlowDesktop},
      depthWrite:false,depthTest:false,blending:THREE.NoBlending,
    });
    let originalArt: THREE.Texture[]=[];
    let movingArt: THREE.Texture[]=[];
    const triangle = new THREE.Mesh(geometry, continuousMaterial);
    triangle.frustumCulled = false;
    graph.add(triangle);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0, last = 0, elapsed = 0, visible = true, lost = false, disposed = false;
    let width = 0, height = 0, ratio = 0;
    let frameCount = 0;
    const resize = () => {
      const w = Math.round(element.clientWidth), h = Math.round(element.clientHeight), dpr = Math.min(devicePixelRatio || 1, settings.current.dpr);
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
      const amount=reduced.matches||fixed||!settings.current.active||!settings.current.transition?1:1-Math.exp(-dt/.48);
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
      const isRipple=settings.current.motion==='ripple';
      const isContinuous=settings.current.motion==='continuous'||settings.current.motion==='flowing';
      const art=isRipple?originalArt:movingArt;
      [uniforms.uHome.value,uniforms.uRecording.value,uniforms.uPlayback.value,uniforms.uDesktop.value]=art;
      if(isContinuous && continuous) {
        const indices:number[]=[];
        const wide=width/height>1.05;
        if(wide && weights[0]+weights[3]>.001) indices.push(3);
        if(!wide && weights[0]>.001) indices.push(0);
        if(weights[1]+weights[2]>.001) indices.push(1);
        if(!wide && weights[3]>.001) indices.push(2);
        const isFlowing=settings.current.motion==='flowing';
        const driver=isFlowing?flowing!:continuous;
        if(isFlowing)continuous.release();else flowing?.release();
        const images=driver.update(renderer,indices,uniforms.uTime.value);
        [continuousUniforms.uFlowHome.value,continuousUniforms.uFlowRecording.value,continuousUniforms.uFlowPlayback.value,continuousUniforms.uFlowDesktop.value]=images;
      } else {continuous?.release();flowing?.release();}
      triangle.material=isRipple?rippleMaterial:settings.current.motion==='flowing'?flowingMaterial:continuousMaterial;
      renderer.render(graph,camera);
      frameCount++;
      if(frameCount===1 || frameCount%60===0 || reduced.matches || fixed || !settings.current.active) {
        element.dataset.frames=String(frameCount); element.dataset.scene=settings.current.scene;
        element.dataset.resolution=`${canvas.width}x${canvas.height}`;
        element.dataset.motion=settings.current.motion;element.dataset.time=String(uniforms.uTime.value);
      }
      if (settings.current.active && ((!fixed && !reduced.matches) || moving)) request();
    };
    const suspend = () => { cancelAnimationFrame(raf); raf=0; last=0; };
    const onVisibility = () => { suspend(); request(); };
    const onLost = (event: Event) => { event.preventDefault(); lost=true; suspend();continuous?.release();flowing?.release(); };
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
      originalArt=loaded;
      const prepared=loaded.map(prepareFlowMaterial);
      continuous=new ContinuousFlow(prepared);
      flowing=new ContinuousFlow(prepared,true);
      movingArt=prepared.map(item=>item.art);
      textures.push(...movingArt,...prepared.map(item=>item.flow));
      [uniforms.uFlowHome.value,uniforms.uFlowRecording.value,uniforms.uFlowPlayback.value,uniforms.uFlowDesktop.value]=prepared.map(item=>item.flow);
      ready=true; request();
    }).catch(()=>{if(!disposed)setError(true);});
    return () => {
      disposed=true; suspend(); wake.current=() => {};
      observer.disconnect(); intersection.disconnect(); document.removeEventListener('visibilitychange',onVisibility);
      reduced.removeEventListener('change',onMotion); canvas.removeEventListener('webglcontextlost',onLost); canvas.removeEventListener('webglcontextrestored',onRestore);
      continuous?.dispose();flowing?.dispose();geometry.dispose(); rippleMaterial.dispose();continuousMaterial.dispose();flowingMaterial.dispose();
      textures.forEach(texture=>texture.dispose()); renderer.dispose(); canvas.remove();
    };
  }, []);
  return <div ref={root} className="luminous-canvas">{error && <p role="status">当前环境无法加载黑洞预览</p>}</div>;
}
