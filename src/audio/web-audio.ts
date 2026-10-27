import { createAudioFeatureStore, measureFrequencyBands, measurePcmFeatures, type AudioFeatureFrame, type AudioFeatureSource, type AudioFeatureStore } from './features.js';

export type AudioSourceState = 'idle' | 'starting' | 'running' | 'suspended' | 'ended' | 'error' | 'disposed';
export interface AudioSourceStatus { state: AudioSourceState; reason?: string; error?: unknown }
export interface AudioScheduler { request(callback: FrameRequestCallback): number; cancel(handle: number): void }
const defaultScheduler: AudioScheduler = { request: callback => requestAnimationFrame(callback), cancel: handle => cancelAnimationFrame(handle) };

export interface WebAudioAnalyserOptions {
  context: AudioContext;
  node?: AudioNode;
  stream?: MediaStream;
  store?: AudioFeatureStore;
  fftSize?: number;
  autoSample?: boolean;
  resumeContext?: boolean;
  now?: () => number;
  scheduler?: AudioScheduler;
}

function errorReason(error: unknown) {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission-denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'no-input-device';
  if (name === 'NotReadableError') return 'device-unavailable';
  if (name === 'NotSupportedError') return 'unsupported';
  return 'audio-start-failed';
}

/** A borrowed input/context. Only the analyser side branch belongs to this object. */
export class WebAudioAnalyserSource implements AudioFeatureSource {
  readonly store: AudioFeatureStore;
  private readonly options: WebAudioAnalyserOptions;
  private readonly scheduler: AudioScheduler;
  private readonly now: () => number;
  private status: AudioSourceStatus = { state: 'idle' };
  private readonly statusListeners = new Set<() => void>();
  private analyser: AnalyserNode | null = null;
  private input: AudioNode | null = null;
  private pcm: Float32Array<ArrayBuffer> | null = null;
  private frequency: Float32Array<ArrayBuffer> | null = null;
  private requestId: number | null = null;
  private active = false;
  private disposed = false;
  private generation = 0;
  private pending: Promise<void> | null = null;
  private removeListeners: (() => void)[] = [];

  constructor(options: WebAudioAnalyserOptions) {
    if (!!options.node === !!options.stream) throw new TypeError('Supply exactly one node or stream.');
    if (options.node && options.node.context !== options.context) throw new TypeError('The AudioNode must belong to the supplied AudioContext.');
    this.options = options;
    this.now = options.now ?? (() => performance.now());
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.store = options.store ?? createAudioFeatureStore({ now: this.now });
  }

  getFrame = () => this.store.getFrame();
  subscribe = (listener: () => void) => this.store.subscribe(listener);
  getStatus = () => this.status;
  subscribeStatus = (listener: () => void) => { this.statusListeners.add(listener); return () => { this.statusListeners.delete(listener); }; };

  private setStatus(state: AudioSourceState, reason?: string, error?: unknown) {
    this.status = Object.freeze({ state, ...(reason ? { reason } : {}), ...(error ? { error } : {}) });
    for (const listener of this.statusListeners) listener();
  }

  start(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Audio source is disposed.'));
    if (this.pending) return this.pending;
    if (this.active) {
      if (this.options.context.state !== 'running' && this.options.resumeContext !== false) return this.options.context.resume();
      return Promise.resolve();
    }
    const generation = ++this.generation;
    this.active = true;
    this.setStatus('starting');
    const pending = this.startInternal(generation);
    this.pending = pending;
    void pending.then(() => { if (this.pending === pending) this.pending = null; }, () => { if (this.pending === pending) this.pending = null; });
    return pending;
  }

  private async startInternal(generation: number) {
    try {
      const context = this.options.context;
      if (context.state === 'closed') throw new Error('The supplied AudioContext is closed.');
      const analyser = context.createAnalyser();
      this.analyser = analyser;
      analyser.fftSize = this.options.fftSize ?? 2048;
      analyser.smoothingTimeConstant = 0;
      this.pcm = new Float32Array(analyser.fftSize);
      this.frequency = new Float32Array(analyser.frequencyBinCount);
      this.input = this.options.node ?? context.createMediaStreamSource(this.options.stream!);
      this.input.connect(analyser);
      const stateChanged = () => this.handleContextState();
      context.addEventListener('statechange', stateChanged);
      this.removeListeners.push(() => context.removeEventListener('statechange', stateChanged));
      for (const track of this.options.stream?.getAudioTracks() ?? []) {
        const ended = () => {
          if (this.options.stream!.getAudioTracks().every(candidate => candidate.readyState === 'ended')) {
            this.active = false;
            this.generation++;
            this.cleanupGraph();
            this.store.clear();
            this.setStatus('ended', 'input-ended');
          }
        };
        track.addEventListener('ended', ended);
        this.removeListeners.push(() => track.removeEventListener('ended', ended));
      }
      if (this.options.stream && !this.options.stream.getAudioTracks().some(track => track.readyState !== 'ended')) throw new Error('The supplied stream has no live audio tracks.');
      if (context.state !== 'running' && this.options.resumeContext !== false) await context.resume();
      if (!this.active || generation !== this.generation) return;
      this.handleContextState();
    } catch (error) {
      if (generation !== this.generation) return;
      this.active = false;
      this.cleanupGraph();
      this.store.clear();
      this.setStatus('error', errorReason(error), error);
      throw error;
    }
  }

  private handleContextState() {
    if (!this.active) return;
    if (this.options.context.state === 'running') {
      this.setStatus('running');
      this.schedule();
    } else {
      if (this.requestId !== null) this.scheduler.cancel(this.requestId);
      this.requestId = null;
      this.store.clear();
      if (this.options.context.state === 'closed') {
        this.active = false;
        this.cleanupGraph();
        this.setStatus('ended', 'context-closed');
      } else this.setStatus('suspended', String(this.options.context.state));
    }
  }

  private schedule() {
    if (!this.active || this.options.autoSample === false || this.requestId !== null || this.options.context.state !== 'running') return;
    this.requestId = this.scheduler.request(() => {
      this.requestId = null;
      this.sample();
      this.schedule();
    });
  }

  /** Buffers are allocated once per start; this method also supports explicit render-loop polling. */
  sample(): AudioFeatureFrame | null {
    if (!this.active || !this.analyser || !this.pcm || !this.frequency || this.options.context.state !== 'running') return null;
    if (this.options.stream && !this.options.stream.getAudioTracks().some(track => track.readyState !== 'ended')) {
      this.active = false;
      this.generation++;
      this.cleanupGraph();
      this.store.clear();
      this.setStatus('ended', 'input-ended');
      return null;
    }
    this.analyser.getFloatTimeDomainData(this.pcm);
    this.analyser.getFloatFrequencyData(this.frequency);
    this.store.push({ ...measurePcmFeatures(this.pcm), ...measureFrequencyBands(this.frequency, this.options.context.sampleRate, this.analyser.fftSize), timestampMs: this.now() });
    return this.store.getFrame();
  }

  private cleanupGraph() {
    if (this.requestId !== null) this.scheduler.cancel(this.requestId);
    this.requestId = null;
    for (const remove of this.removeListeners.splice(0)) remove();
    if (this.input && this.analyser) { try { this.input.disconnect(this.analyser); } catch { /* The host may have already removed this side branch. */ } }
    this.analyser?.disconnect();
    this.analyser = null;
    this.input = null;
    this.pcm = null;
    this.frequency = null;
  }

  stop() {
    if (this.disposed) return;
    this.generation++;
    this.active = false;
    this.pending = null;
    this.cleanupGraph();
    this.store.clear();
    this.setStatus('idle');
  }

  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.setStatus('disposed');
    this.statusListeners.clear();
  }
}

export interface MicrophoneAudioSourceOptions {
  store?: AudioFeatureStore;
  context?: AudioContext;
  constraints?: MediaTrackConstraints | boolean;
  fftSize?: number;
  autoSample?: boolean;
  now?: () => number;
  scheduler?: AudioScheduler;
  /** Dependency injection for tests or a host's existing permission boundary. */
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createContext?: () => AudioContext;
}

export class MicrophoneAudioSource implements AudioFeatureSource {
  readonly store: AudioFeatureStore;
  private readonly options: MicrophoneAudioSourceOptions;
  private status: AudioSourceStatus = { state: 'idle' };
  private readonly listeners = new Set<() => void>();
  private source: WebAudioAnalyserSource | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private unsubscribeStatus: (() => void) | null = null;
  private pending: Promise<void> | null = null;
  private generation = 0;
  private disposed = false;

  constructor(options: MicrophoneAudioSourceOptions = {}) {
    this.options = options;
    this.store = options.store ?? createAudioFeatureStore({ now: options.now });
  }

  getFrame = () => this.store.getFrame();
  subscribe = (listener: () => void) => this.store.subscribe(listener);
  getStatus = () => this.status;
  subscribeStatus = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private setStatus(status: AudioSourceStatus) { this.status = Object.freeze(status); for (const listener of this.listeners) listener(); }

  start(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Microphone source is disposed.'));
    if (this.pending) return this.pending;
    if (this.source) return this.source.start();
    const generation = ++this.generation;
    this.setStatus({ state: 'starting' });
    const pending = this.startInternal(generation);
    this.pending = pending;
    void pending.then(() => { if (this.pending === pending) this.pending = null; }, () => { if (this.pending === pending) this.pending = null; });
    return pending;
  }

  private async startInternal(generation: number) {
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      context = this.options.context ?? (this.options.createContext ? this.options.createContext() : (() => {
        if (typeof AudioContext === 'undefined') throw Object.assign(new Error('Web Audio is unavailable.'), { name: 'NotSupportedError' });
        return new AudioContext();
      })());
      this.context = context;
      if (context.state === 'closed') throw new Error('The supplied AudioContext is closed.');
      // Call resume inside the start gesture, before waiting for the permission prompt.
      const resumed = (context.state === 'running' ? Promise.resolve() : context.resume()).then(() => null, error => error);
      const getUserMedia = this.options.getUserMedia ?? (constraints => {
        if (!globalThis.navigator?.mediaDevices?.getUserMedia) return Promise.reject(Object.assign(new Error('Microphone capture is unavailable in this context.'), { name: 'NotSupportedError' }));
        return navigator.mediaDevices.getUserMedia(constraints);
      });
      stream = await getUserMedia({ audio: this.options.constraints ?? true, video: false });
      if (this.disposed || generation !== this.generation) { this.releaseOwned(stream, context); return; }
      this.stream = stream;
      const resumeError = await resumed;
      if (this.disposed || generation !== this.generation) { this.releaseOwned(stream, context); return; }
      if (resumeError) throw resumeError;
      const source = new WebAudioAnalyserSource({ context, stream, store: this.store, fftSize: this.options.fftSize, autoSample: this.options.autoSample, resumeContext: false, now: this.options.now, scheduler: this.options.scheduler });
      this.source = source;
      this.unsubscribeStatus = source.subscribeStatus(() => {
        if (this.source === source && generation === this.generation) {
          const status = source.getStatus();
          if (status.state === 'ended') { this.cleanup(); this.store.clear(); }
          this.setStatus(status);
        }
      });
      await source.start();
      if (this.disposed || generation !== this.generation) source.dispose();
    } catch (error) {
      if (generation !== this.generation || this.disposed) {
        if (stream) this.releaseOwned(stream, context);
        else if (context) this.closeOwnedContext(context);
        return;
      }
      if (stream && stream !== this.stream) this.releaseOwned(stream, context);
      this.cleanup();
      this.store.clear();
      this.setStatus({ state: 'error', reason: errorReason(error), error });
      throw error;
    }
  }

  sample = () => this.source?.sample() ?? null;
  private closeOwnedContext(context: AudioContext) {
    if (!this.options.context && context.state !== 'closed') void context.close().catch(() => undefined);
  }
  private releaseOwned(stream: MediaStream, context: AudioContext | null) {
    for (const track of stream.getTracks()) if (track.readyState !== 'ended') track.stop();
    if (context) this.closeOwnedContext(context);
  }
  private cleanup() {
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = null;
    this.source?.dispose();
    this.source = null;
    if (this.stream) this.releaseOwned(this.stream, this.context);
    else if (this.context) this.closeOwnedContext(this.context);
    this.stream = null;
    this.context = null;
  }
  stop() {
    if (this.disposed) return;
    this.generation++;
    this.pending = null;
    this.cleanup();
    this.store.clear();
    this.setStatus({ state: 'idle' });
  }
  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.setStatus({ state: 'disposed' });
    this.listeners.clear();
  }
}

/** Constructing this object never requests permission. Invoke start from an explicit user action. */
export const createMicrophoneAudioSource = (options: MicrophoneAudioSourceOptions = {}) => new MicrophoneAudioSource(options);
