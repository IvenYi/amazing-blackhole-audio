import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import { AudioReactiveController, type AudioFeatureSource, type AudioReactiveOptions } from '../audio';
import {
  compositeShader,
  downsampleShader,
  fieldShader,
  upsampleShader,
  vertexShader,
} from './black-hole-shaders';

export interface BlackHoleHandle {
  gulp: (strength?: number) => void;
  replay: () => void;
}

export interface BlackHoleProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  speed?: number;
  zoom?: number;
  particleCount?: number;
  orbSize?: number;
  glow?: number;
  contrast?: number;
  mirrorSplits?: number;
  warpEnabled?: boolean;
  distanceFade?: number;
  colorShiftR?: number;
  colorShiftG?: number;
  colorShiftB?: number;
  colorSpeed?: number;
  colors?: [string, string];
  backgroundColor?: string;
  opacity?: number;
  bloom?: number;
  ringIntensity?: number;
  cursorInteraction?: boolean;
  cursorIntensity?: number;
  intro?: boolean;
  paused?: boolean;
  dpr?: number;
  /** An exact shader time for repeatable visual checks; use with intro={false}. */
  deterministicTime?: number;
  onError?: (message: string) => void;
  /** A borrowed analyser or native-recorder feature source. This component never owns the microphone. */
  audioSource?: AudioFeatureSource | null;
  audioStrength?: number;
  /** Fine controls for the sound envelope and visual mapping; omitted fields use defaults. */
  audioOptions?: AudioReactiveOptions;
  /** Pauses only GPU drawing, for application background/route lifecycle. */
  active?: boolean;
  /** Optional visual frame-rate cap. Omit to preserve the original scheduling. */
  maxFps?: number;
}

interface RenderSettings {
  speed: number;
  zoom: number;
  particleCount: number;
  orbSize: number;
  glow: number;
  contrast: number;
  mirrorSplits: number;
  warpEnabled: boolean;
  distanceFade: number;
  colorShiftR: number;
  colorShiftG: number;
  colorShiftB: number;
  colorSpeed: number;
  colors: [string, string] | null;
  backgroundColor: string;
  opacity: number;
  bloom: number;
  ringIntensity: number;
  cursorInteraction: boolean;
  cursorIntensity: number;
  intro: boolean;
  paused: boolean;
  dpr: number;
  reduced: boolean;
  deterministicTime?: number;
  audioSource: AudioFeatureSource | null;
  audioStrength: number;
  audioOptions?: AudioReactiveOptions;
  active: boolean;
  maxFps?: number;
}

interface RenderController extends BlackHoleHandle {
  sync: () => void;
  destroy: () => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

function rendererAudioOptions(options?: AudioReactiveOptions): AudioReactiveOptions {
  const delta = options?.maxDeltaSeconds;
  return { ...options, maxDeltaSeconds: delta !== undefined && Number.isFinite(delta) && delta > 0 ? delta : 0.25 };
}

const colorParser = new THREE.Color();

function parseColor(input: string): [number, number, number, number] | null {
  const value = input.trim().toLowerCase();
  if (!value || ['transparent', 'none', 'auto'].includes(value)) return null;
  const match = /^rgba?\(([^)]+)\)$/.exec(value);
  if (match) {
    const channels = match[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((channel) => Number.parseFloat(channel));
    const alpha =
      channels.length > 3 && Number.isFinite(channels[3])
        ? clamp(channels[3], 0, 1)
        : 1;
    return [
      (channels[0] ?? 0) / 255,
      (channels[1] ?? 0) / 255,
      (channels[2] ?? 0) / 255,
      alpha,
    ];
  }
  try {
    colorParser.setStyle(value, THREE.NoColorSpace);
  } catch {
    return null;
  }
  return [colorParser.r, colorParser.g, colorParser.b, 1];
}

function toOklab(red: number, green: number, blue: number) {
  const decode = (value: number) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const r = decode(red);
  const g = decode(green);
  const b = decode(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ] as const;
}

const subscribeReducedMotion = (callback: () => void) => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};
const getReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function createRenderer(
  root: HTMLDivElement,
  layer: HTMLDivElement,
  settings: { current: RenderSettings },
): RenderController | null {
  const ownerDocument = root.ownerDocument;
  const view = ownerDocument.defaultView ?? window;
  const canvas = ownerDocument.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block';

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    });
  } catch {
    return null;
  }
  layer.appendChild(canvas);
  renderer.autoClear = false;
  renderer.setClearColor(0, 0);

  const textureType =
    renderer.extensions.has('EXT_color_buffer_float') ||
    renderer.extensions.has('EXT_color_buffer_half_float')
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  const scene = new THREE.Scene();

  const material = (
    fragmentShader: string,
    uniforms: Record<string, THREE.IUniform>,
    additive = false,
  ) =>
    new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms,
      blending: additive ? THREE.AdditiveBlending : THREE.NoBlending,
      transparent: additive,
      depthTest: false,
      depthWrite: false,
    });

  const fieldUniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uZoom: { value: 1.8 },
    uCount: { value: 13 },
    uOrbSize: { value: 0.75 },
    uGlow: { value: 0.08 },
    uContrast: { value: 3 },
    uSplits: { value: 2 },
    uWarp: { value: 1 },
    uDistFade: { value: 0.35 },
    uColorShift: { value: new THREE.Vector3(-6, -6, -6) },
    uColorRate: { value: 0.2 },
    uFade: { value: 1 },
  };
  const fieldMaterial = material(fieldShader, fieldUniforms);
  const triangle = new THREE.Mesh(geometry, fieldMaterial);
  triangle.frustumCulled = false;
  scene.add(triangle);

  const makeTarget = () =>
    new THREE.WebGLRenderTarget(1, 1, {
      type: textureType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
  const fieldTarget = makeTarget();
  const bloomTargets = Array.from({ length: 6 }, makeTarget);
  const downsampleMaterial = material(downsampleShader, {
    uSource: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uFirst: { value: 0 },
  });
  const upsampleMaterial = material(
    upsampleShader,
    {
      uSource: { value: null },
      uTexel: { value: new THREE.Vector2() },
    },
    true,
  );
  const compositeUniforms = {
    uField: { value: fieldTarget.texture },
    uBloom: { value: bloomTargets[1].texture },
    uRes: { value: new THREE.Vector2(1, 1) },
    uBloomStrength: { value: 0.1 },
    uCenter: { value: new THREE.Vector2() },
    uRadius: { value: 100 },
    uLine: { value: 1 },
    uRing: { value: 1 },
    uTint: { value: 0 },
    uLabA: { value: new THREE.Vector3(1, 0, 0) },
    uLabB: { value: new THREE.Vector3(0.5, 0, 0) },
    uCool: { value: new THREE.Vector3(0.86, 0.89, 1) },
    uInk: { value: 0 },
    uInkLab: { value: new THREE.Vector3(0.24, 0.035, -0.13) },
    uBg: { value: new THREE.Vector3(0, 0, 0) },
    uSolid: { value: 1 },
    uAlpha: { value: 1 },
    uFrame: { value: 0 },
  };
  const compositeMaterial = material(compositeShader, compositeUniforms);

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let ready = false;
  let colorKey = '';
  let lastColorCheck = -10;
  let elapsed = 0;
  let frame = 0;
  let hover = 0;
  let isHovered = false;
  let gulpOffset = 0;
  let gulpVelocity = 0;
  let introStart = -1;
  let introProgress = 1;
  let animationFrame = 0;
  let lastTimestamp = 0;
  let visible = false;
  let destroyed = false;
  let contextLost = false;
  let pendingPointer: { id: number; x: number; y: number; time: number } | null =
    null;
  const audioController = new AudioReactiveController(rendererAudioOptions(settings.current.audioOptions));
  let audioResponse = audioController.update(null, performance.now(), 0);
  let observedAudioSource: AudioFeatureSource | null = null;
  let unsubscribeAudio: (() => void) | null = null;
  let lastPaintTimestamp = 0;

  const readInheritedBackground = (): [number, number, number] => {
    let parent = root.parentElement;
    while (parent) {
      const match = view
        .getComputedStyle(parent)
        .backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (match) {
        const channels = match[1]
          .split(/[\s,/]+/)
          .filter(Boolean)
          .map((channel) => Number.parseFloat(channel));
        if (channels.length < 4 || channels[3] > 0.05) {
          return [channels[0] / 255, channels[1] / 255, channels[2] / 255];
        }
      }
      parent = parent.parentElement;
    }
    return view.matchMedia('(prefers-color-scheme: dark)').matches
      ? [0, 0, 0]
      : [1, 1, 1];
  };

  const syncColors = () => {
    const state = settings.current;
    const background = parseColor(state.backgroundColor);
    const solid = !!background && background[3] > 0.05;
    const rgb = solid && background ? background : readInheritedBackground();
    const key = [rgb.slice(0, 3).join(','), solid, state.colors?.join(',') ?? ''].join(
      '|',
    );
    if (key === colorKey) return;
    colorKey = key;
    compositeUniforms.uSolid.value = Number(solid);
    compositeUniforms.uBg.value.set(rgb[0], rgb[1], rgb[2]);
    compositeUniforms.uInk.value = Number(
      0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] > 0.55,
    );
    const core = state.colors ? parseColor(state.colors[0]) : null;
    const edge = state.colors ? parseColor(state.colors[1]) : null;
    compositeUniforms.uInkLab.value.set(0.24, 0.035, -0.13);
    if (core && edge) {
      const labA = toOklab(core[0], core[1], core[2]);
      const labB = toOklab(edge[0], edge[1], edge[2]);
      compositeUniforms.uLabA.value.set(...labA);
      compositeUniforms.uLabB.value.set(...labB);
      compositeUniforms.uTint.value = 1;
      const strongest =
        Math.hypot(labA[1], labA[2]) > Math.hypot(labB[1], labB[2])
          ? labA
          : labB;
      const chroma = Math.hypot(strongest[1], strongest[2]);
      if (chroma > 0.02) {
        const scale = clamp(1.1 * chroma, 0.07, 0.16) / chroma;
        compositeUniforms.uInkLab.value.set(
          0.28,
          strongest[1] * scale,
          strongest[2] * scale,
        );
      }
    } else {
      compositeUniforms.uTint.value = 0;
    }
  };

  const resize = () => {
    const state = settings.current;
    const nextWidth = Math.round(root.clientWidth);
    const nextHeight = Math.round(root.clientHeight);
    if (nextWidth < 2 || nextHeight < 2) {
      ready = false;
      return false;
    }
    const nextDpr = Math.min(
      view.devicePixelRatio || 1,
      clamp(finite(state.dpr, 2), 0.5, 3),
    );
    if (ready && nextWidth === width && nextHeight === height && nextDpr === pixelRatio)
      return false;
    ready = true;
    width = nextWidth;
    height = nextHeight;
    pixelRatio = nextDpr;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    const renderWidth = Math.max(1, Math.round(width * pixelRatio));
    const renderHeight = Math.max(1, Math.round(height * pixelRatio));
    fieldTarget.setSize(renderWidth, renderHeight);
    fieldUniforms.uRes.value.set(renderWidth, renderHeight);
    compositeUniforms.uRes.value.set(renderWidth, renderHeight);
    let bloomWidth = renderWidth;
    let bloomHeight = renderHeight;
    for (const target of bloomTargets) {
      bloomWidth = Math.max(1, Math.round(bloomWidth / 2));
      bloomHeight = Math.max(1, Math.round(bloomHeight / 2));
      target.setSize(bloomWidth, bloomHeight);
    }
    return true;
  };

  const draw = () => {
    if (!ready || !settings.current.active || contextLost) return;
    const state = settings.current;
    const audioStrength = state.audioSource && !state.reduced && !state.paused
      ? clamp(finite(state.audioStrength, 1), 0, 2) : 0;
    if (performance.now() - lastColorCheck > 1000) {
      lastColorCheck = performance.now();
      syncColors();
    }
    const fade = 1 - (1 - introProgress) ** 3;
    const introSpread = (1 - fade) ** 2;
    const zoom = clamp(finite(state.zoom, 1.8), 0.2, 10);
    const orbitRadius =
      clamp(finite(state.orbSize, 0.75), 0.01, 5) *
      (1 + 0.8 * introSpread) *
      (1 - 0.5 * clamp(gulpOffset, -0.6, 1.4)) *
      (1 + (audioResponse.orbScale - 1) * audioStrength);
    const deterministic = Number.isFinite(state.deterministicTime);
    fieldUniforms.uTime.value = deterministic
      ? state.deterministicTime!
      : 0.5 * elapsed - 2.2 * introSpread;
    fieldUniforms.uZoom.value = zoom;
    fieldUniforms.uCount.value = clamp(Math.round(finite(state.particleCount, 13)), 1, 30);
    fieldUniforms.uOrbSize.value = orbitRadius;
    fieldUniforms.uGlow.value = Math.max(finite(state.glow, 0.08) + audioResponse.glowAdd * audioStrength, 0);
    fieldUniforms.uContrast.value = clamp(finite(state.contrast, 3), 0.1, 12);
    fieldUniforms.uSplits.value = clamp(finite(state.mirrorSplits, 2), 1, 16);
    fieldUniforms.uWarp.value = Number(!!state.warpEnabled);
    fieldUniforms.uDistFade.value = Math.max(finite(state.distanceFade, 0.35), 0);
    fieldUniforms.uColorShift.value.set(
      finite(state.colorShiftR, -6),
      finite(state.colorShiftG, -6),
      finite(state.colorShiftB, -6),
    );
    fieldUniforms.uColorRate.value = finite(state.colorSpeed, 0.2);
    fieldUniforms.uFade.value = fade;
    const renderHeight = fieldTarget.height;
    const sphereRadius = state.warpEnabled
      ? 0.96 * orbitRadius ** 0.64
      : 0.9 * orbitRadius;
    compositeUniforms.uCenter.value.set(fieldTarget.width / 2, renderHeight / 2);
    compositeUniforms.uRadius.value = (sphereRadius * renderHeight) / (2 * zoom);
    compositeUniforms.uLine.value = 1.25 * pixelRatio;
    compositeUniforms.uRing.value = clamp(finite(state.ringIntensity, 1) + audioResponse.ringAdd * audioStrength, 0, 4) * fade;
    compositeUniforms.uAlpha.value = clamp(finite(state.opacity, 1), 0, 1);
    compositeUniforms.uFrame.value = deterministic ? 0 : frame % 64;
    const bloom =
      clamp(finite(state.bloom, 1) + audioResponse.bloomAdd * audioStrength, 0, 4) *
      (compositeUniforms.uInk.value > 0.5 ? 0.6 : 1);
    compositeUniforms.uBloomStrength.value = 0.06 * bloom;
    const firstBloom = pixelRatio >= 1.5 ? 2 : 1;
    const bloomLevels = firstBloom + 4;
    compositeUniforms.uBloom.value = bloomTargets[firstBloom].texture;

    triangle.material = fieldMaterial;
    renderer.setRenderTarget(fieldTarget);
    renderer.render(scene, camera);
    let previous = fieldTarget;
    triangle.material = downsampleMaterial;
    for (let level = 0; level < bloomLevels; level++) {
      const target = bloomTargets[level];
      downsampleMaterial.uniforms.uFirst.value = Number(previous === fieldTarget);
      downsampleMaterial.uniforms.uSource.value = previous.texture;
      downsampleMaterial.uniforms.uTexel.value.set(1 / previous.width, 1 / previous.height);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      previous = target;
    }
    triangle.material = upsampleMaterial;
    for (let level = bloomLevels - 1; level > firstBloom; level--) {
      upsampleMaterial.uniforms.uSource.value = bloomTargets[level].texture;
      upsampleMaterial.uniforms.uTexel.value.set(
        1 / bloomTargets[level].width,
        1 / bloomTargets[level].height,
      );
      renderer.setRenderTarget(bloomTargets[level - 1]);
      renderer.render(scene, camera);
    }
    triangle.material = compositeMaterial;
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);
    frame++;
  };

  const schedule = () => {
    if (destroyed || contextLost || !visible || !settings.current.active || ownerDocument.hidden || animationFrame) return;
    animationFrame = requestAnimationFrame(tick);
  };

  const tick = (timestamp: number) => {
    animationFrame = 0;
    if (destroyed || contextLost || !visible || !settings.current.active || ownerDocument.hidden) {
      lastTimestamp = 0;
      lastPaintTimestamp = 0;
      return;
    }
    const state = settings.current;
    const fps = Number.isFinite(state.maxFps) ? clamp(state.maxFps!, 5, 120) : 0;
    if (fps && lastPaintTimestamp && timestamp - lastPaintTimestamp < 1000 / fps - 0.5) {
      schedule();
      return;
    }
    lastPaintTimestamp = timestamp;
    const delta = fps && lastTimestamp && timestamp - lastTimestamp <= 500
      ? Math.min(Math.max((timestamp - lastTimestamp) / 1000, 0), 0.25)
      : lastTimestamp && timestamp - lastTimestamp < 100
        ? Math.min(Math.max((timestamp - lastTimestamp) / 1000, 0), 0.05)
        : 1 / 60;
    lastTimestamp = timestamp;
    const audioEnabled = !!state.audioSource && !state.reduced && !state.paused && state.audioStrength > 0;
    if (audioEnabled) {
      audioResponse = audioController.update(state.audioSource!.getFrame(), performance.now(), delta);
      if (audioResponse.impulse > 0) impulse(audioResponse.impulse * clamp(finite(state.audioStrength, 1), 0, 2));
    } else {
      audioController.reset();
      audioResponse = audioController.update(null, performance.now(), 0);
    }
    const hoverTarget = state.cursorInteraction && !state.reduced && isHovered ? 1 : 0;
    hover += (hoverTarget - hover) * (1 - Math.exp(-delta / 0.6));
    if (Math.abs(hoverTarget - hover) < 0.0005) hover = hoverTarget;
    const animating =
      !state.reduced && !state.paused && !Number.isFinite(state.deterministicTime);
    if (animating) {
      const hoverSpeed = 1 + 0.5 * clamp(finite(state.cursorIntensity, 1), 0, 3) * hover;
      const audioSpeed = 1 + (audioResponse.speedScale - 1) * clamp(finite(state.audioStrength, 1), 0, 2);
      elapsed += delta * clamp(finite(state.speed, 1), 0, 10) * hoverSpeed * audioSpeed;
    }
    if (state.intro && !state.reduced) {
      if (introStart < 0) introStart = timestamp;
      introProgress = clamp((timestamp - introStart) / 1000 / 2.6, 0, 1);
    } else {
      introProgress = 1;
    }
    let remaining = delta;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 120);
      gulpVelocity += (-56 * gulpOffset - 6.3 * gulpVelocity) * step;
      gulpOffset += gulpVelocity * step;
      remaining -= step;
    }
    if (Math.abs(gulpOffset) + Math.abs(gulpVelocity) < 0.0004) {
      gulpOffset = 0;
      gulpVelocity = 0;
    }
    draw();
    const unsettled = hover !== hoverTarget || gulpOffset !== 0 || introProgress < 1;
    if ((animating || unsettled || (audioEnabled && audioResponse.level > 0)) && !ownerDocument.hidden) {
      animationFrame = requestAnimationFrame(tick);
    } else {
      lastTimestamp = 0;
    }
  };

  const impulse = (strength: number) => {
    gulpVelocity = Math.min(gulpVelocity + 6.5 * strength, 14);
  };
  const pointerDown = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        'a,button,input,textarea,select,label,summary,[role=button],[contenteditable=true]',
      )
    )
      return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pendingPointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
  };
  const pointerUp = (event: PointerEvent) => {
    const down = pendingPointer;
    pendingPointer = null;
    if (
      !down ||
      down.id !== event.pointerId ||
      Math.hypot(event.clientX - down.x, event.clientY - down.y) > 10 ||
      performance.now() - down.time > 600
    )
      return;
    const state = settings.current;
    if (!state.cursorInteraction || state.reduced || state.paused) return;
    impulse(clamp(finite(state.cursorIntensity, 1), 0, 3));
    schedule();
  };
  const pointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || isHovered) return;
    isHovered = true;
    schedule();
  };
  const pointerLeave = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    isHovered = false;
    schedule();
  };
  const pointerCancel = () => {
    pendingPointer = null;
  };
  const visibilityChanged = () => {
    lastTimestamp = 0;
    lastPaintTimestamp = 0;
    if (ownerDocument.hidden) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      audioController.reset();
      audioResponse = audioController.update(null, performance.now(), 0);
      return;
    }
    schedule();
  };
  const contextWasLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  };
  const contextWasRestored = () => {
    contextLost = false;
    colorKey = '';
    schedule();
  };
  const resizeObserver = new ResizeObserver(() => {
    if (resize()) {
      draw();
      schedule();
    }
  });
  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      lastTimestamp = 0;
      lastPaintTimestamp = 0;
      if (!visible) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      schedule();
    },
    { rootMargin: '120px' },
  );

  root.addEventListener('pointerdown', pointerDown);
  root.addEventListener('pointerup', pointerUp);
  root.addEventListener('pointermove', pointerMove);
  root.addEventListener('pointerleave', pointerLeave);
  root.addEventListener('pointercancel', pointerCancel);
  ownerDocument.addEventListener('visibilitychange', visibilityChanged);
  canvas.addEventListener('webglcontextlost', contextWasLost);
  canvas.addEventListener('webglcontextrestored', contextWasRestored);
  resizeObserver.observe(root);
  intersectionObserver.observe(root);
  if (settings.current.intro && !settings.current.reduced) introProgress = 0;
  elapsed = 3 * Number(settings.current.reduced);
  resize();
  syncColors();

  const syncAudioSource = () => {
    const next = settings.current.audioSource;
    if (next === observedAudioSource) return;
    unsubscribeAudio?.();
    observedAudioSource = next;
    audioController.reset();
    audioResponse = audioController.update(null, performance.now(), 0);
    unsubscribeAudio = next?.subscribe(() => {
      if (!settings.current.paused && !settings.current.reduced) schedule();
    }) ?? null;
  };
  syncAudioSource();

  return {
    sync: () => {
      audioController.configure(rendererAudioOptions(settings.current.audioOptions));
      syncAudioSource();
      lastColorCheck = -10;
      resize();
      lastTimestamp = 0;
      lastPaintTimestamp = 0;
      if (!settings.current.active) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        audioController.reset();
        audioResponse = audioController.update(null, performance.now(), 0);
        return;
      }
      if (!animationFrame && visible) {
        draw();
        schedule();
      }
    },
    gulp: (strength) => {
      const state = settings.current;
      if (state.reduced) return;
      impulse(clamp(finite(strength ?? state.cursorIntensity, 1), 0, 3));
      schedule();
    },
    replay: () => {
      if (settings.current.reduced) return;
      introStart = -1;
      introProgress = 0;
      lastTimestamp = 0;
      schedule();
    },
    destroy: () => {
      destroyed = true;
      unsubscribeAudio?.();
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      root.removeEventListener('pointerdown', pointerDown);
      root.removeEventListener('pointerup', pointerUp);
      root.removeEventListener('pointermove', pointerMove);
      root.removeEventListener('pointerleave', pointerLeave);
      root.removeEventListener('pointercancel', pointerCancel);
      ownerDocument.removeEventListener('visibilitychange', visibilityChanged);
      canvas.removeEventListener('webglcontextlost', contextWasLost);
      canvas.removeEventListener('webglcontextrestored', contextWasRestored);
      geometry.dispose();
      fieldMaterial.dispose();
      downsampleMaterial.dispose();
      upsampleMaterial.dispose();
      compositeMaterial.dispose();
      fieldTarget.dispose();
      bloomTargets.forEach((target) => target.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}

const BlackHole = forwardRef<BlackHoleHandle, BlackHoleProps>(function BlackHole(
  {
    width = '100%',
    height = '100%',
    className,
    style,
    children,
    speed = 1,
    zoom = 1.8,
    particleCount = 13,
    orbSize = 0.75,
    glow = 0.08,
    contrast = 3,
    mirrorSplits = 2,
    warpEnabled = true,
    distanceFade = 0.35,
    colorShiftR = -6,
    colorShiftG = -6,
    colorShiftB = -6,
    colorSpeed = 0.2,
    colors,
    backgroundColor = '#000000',
    opacity = 1,
    bloom = 1,
    ringIntensity = 1,
    cursorInteraction = true,
    cursorIntensity = 1,
    intro = true,
    paused = false,
    dpr = 2,
    deterministicTime,
    onError,
    audioSource = null,
    audioStrength = 1,
    audioOptions,
    active = true,
    maxFps,
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<RenderController | null>(null);
  const onErrorRef = useRef(onError);
  const [error, setError] = useState<string | null>(null);
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  const settings: RenderSettings = {
    speed,
    zoom,
    particleCount,
    orbSize,
    glow,
    contrast,
    mirrorSplits,
    warpEnabled,
    distanceFade,
    colorShiftR,
    colorShiftG,
    colorShiftB,
    colorSpeed,
    colors: colors ?? null,
    backgroundColor,
    opacity,
    bloom,
    ringIntensity,
    cursorInteraction,
    cursorIntensity,
    intro,
    paused,
    dpr,
    reduced,
    deterministicTime,
    audioSource,
    audioStrength,
    audioOptions,
    active,
    maxFps,
  };
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
    onErrorRef.current = onError;
    controllerRef.current?.sync();
  });

  useEffect(() => {
    const root = rootRef.current;
    const layer = layerRef.current;
    if (!root || !layer) return;
    const controller = createRenderer(root, layer, settingsRef);
    controllerRef.current = controller;
    if (!controller) {
      const message = '当前浏览器无法启用 WebGL 2，请打开硬件加速后刷新页面。';
      setError(message);
      onErrorRef.current?.(message);
    } else {
      setError(null);
    }
    return () => {
      controller?.destroy();
      controllerRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      gulp: (strength) => controllerRef.current?.gulp(strength),
      replay: () => controllerRef.current?.replay(),
    }),
    [],
  );

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', width, height, ...style }}
    >
      <div ref={layerRef} aria-hidden="true" style={{ position: 'absolute', inset: 0 }} />
      {error && (
        <div
          role="status"
          style={{ position: 'relative', zIndex: 1, padding: 24, color: 'inherit' }}
        >
          {error}
        </div>
      )}
      {children && <div style={{ position: 'relative', zIndex: 10 }}>{children}</div>}
    </div>
  );
});

export default BlackHole;
