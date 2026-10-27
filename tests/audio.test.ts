// npm test compiles src with rootDir=src, then uses Node 24's TypeScript stripping.
// No microphone or device access is performed by these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAudioFeatureStore, measurePcmFeatures, measureFrequencyBands, normalizeAudioLevel,
  AudioReactiveController, WebAudioAnalyserSource, createMicrophoneAudioSource,
} from '../work/audio-test-build/audio/index.js';

const close = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const frame = (rms: number, timestampMs: number, extra = {}) => ({ rms, peak: rms, low: 0, mid: 0, high: 0, timestampMs, ...extra });

test('known PCM full-scale sine, DC, silence, clipping and corrupt samples', () => {
  const sine = Float32Array.from({ length: 4800 }, (_, i) => Math.sin(2 * Math.PI * 1000 * i / 48000));
  close(measurePcmFeatures(sine).rms, Math.SQRT1_2, 1e-7);
  close(measurePcmFeatures(sine).peak, 1);
  assert.deepEqual(measurePcmFeatures([0.5, 0.5, 0.5, 0.5]), { rms: 0.5, peak: 0.5 });
  assert.deepEqual(measurePcmFeatures([]), { rms: 0, peak: 0 });
  assert.deepEqual(measurePcmFeatures([2, -3, NaN, Infinity]), { rms: Math.SQRT1_2, peak: 1 });
});

test('FFT dB bins yield linear amplitude and invalid bins yield silence', () => {
  const spectrum = new Float32Array(1024).fill(-40);
  const bands = measureFrequencyBands(spectrum, 48000, 2048);
  close(bands.low, 0.01); close(bands.mid, 0.01); close(bands.high, 0.01);
  spectrum.fill(-Infinity);
  assert.deepEqual(measureFrequencyBands(spectrum, 48000, 2048), { low: 0, mid: 0, high: 0 });
});

test('store uses receipt clock, missing bands are zero, rejects disorder/future-invalid values', () => {
  let now = 100;
  const store = createAudioFeatureStore({ now: () => now });
  let updates = 0;
  const unsubscribe = store.subscribe(() => updates++);
  assert.equal(store.push({ rms: 0.2 }), true);
  assert.deepEqual(store.getFrame(), frame(0.2, 100));
  assert.equal(store.push({ rms: 1, timestampMs: 99 }), false);
  assert.equal(store.push({ timestampMs: NaN }), false);
  assert.equal(store.push({ rms: 1, timestampMs: Date.now() }), false);
  now = 120;
  store.push({ rms: NaN, peak: Infinity, low: -3, mid: 8 });
  assert.deepEqual(store.getFrame(), frame(0, 120, { mid: 1 }));
  assert.equal(updates, 2);
  store.clear();
  assert.equal(store.getFrame(), null);
  assert.equal(updates, 3);
  unsubscribe();
  assert.equal(store.getSubscriberCount(), 0);
});

test('silent identity is exact; normalization is monotonic and dBFS-gated', () => {
  const mapper = new AudioReactiveController();
  assert.deepEqual(mapper.update(frame(0, 0), 0, 1 / 60), {
    level: 0, glowAdd: 0, bloomAdd: 0, ringAdd: 0, orbScale: 1, speedScale: 1, transient: 0, impulse: 0,
  });
  assert.equal(normalizeAudioLevel(10 ** (-60 / 20)), 0);
  assert.ok(normalizeAudioLevel(0.01) < normalizeAudioLevel(0.05));
  assert.ok(normalizeAudioLevel(0.05) < normalizeAudioLevel(0.2));
  assert.equal(normalizeAudioLevel(1), 1);
  assert.equal(normalizeAudioLevel(NaN), 0);
});

test('attack/release envelopes agree at 30, 60 and 144 fps for equal elapsed time', () => {
  const run = (fps: number) => {
    const mapper = new AudioReactiveController();
    let result;
    for (let step = 1; step <= fps; step++) {
      const now = step * 1000 / fps;
      result = mapper.update(frame(0.1, now), now, 1 / fps);
    }
    const attack = result!.level;
    for (let step = 1; step <= fps; step++) {
      const now = 1000 + step * 1000 / fps;
      result = mapper.update(frame(0, now), now, 1 / fps);
    }
    return [attack, result!.level];
  };
  const at30 = run(30), at60 = run(60), at144 = run(144);
  close(at30[0], at60[0], 1e-12); close(at30[0], at144[0], 1e-12);
  close(at30[1], at60[1], 1e-12); close(at30[1], at144[1], 1e-12);
});

test('stale/future frames decay; background gaps cannot retain loudness or emit a restart impulse', () => {
  const mapper = new AudioReactiveController();
  for (let i = 1; i <= 60; i++) mapper.update(frame(0.2, i * 1000 / 60), i * 1000 / 60, 1 / 60);
  const afterGap = mapper.update(frame(0.2, 1000), 20000, 19);
  assert.equal(afterGap.level, 0);
  assert.equal(afterGap.impulse, 0);
  assert.equal(afterGap.orbScale, 1);
  const future = new AudioReactiveController().update(frame(1, 5000), 100, 1 / 60);
  assert.equal(future.level, 0);
});

test('balanced visual response is bounded and transient impulses respect 600ms cooldown', () => {
  const mapper = new AudioReactiveController();
  const impulses: number[] = [];
  let result;
  for (let step = 1; step <= 180; step++) {
    const now = step * 1000 / 60;
    const loud = step % 18 < 9 ? 0.8 : 0;
    result = mapper.update(frame(loud, now, { low: 0.5 }), now, 1 / 60);
    if (result.impulse > 0) impulses.push(now);
    assert.ok(result.glowAdd <= 0.045 && result.bloomAdd <= 0.8 && result.ringAdd <= 0.8);
    assert.ok(result.orbScale >= 0.9 && result.speedScale <= 1.25 && result.impulse <= 0.12);
  }
  assert.ok(impulses.length > 0);
  for (let i = 1; i < impulses.length; i++) assert.ok(impulses[i] - impulses[i - 1] >= 600 - 1e-6);
});

test('constructor and configure resolve the same numeric options, zero overrides and invalid values', () => {
  const options = { attackSeconds: 0.04, releaseSeconds: 0.7, glowAmount: 0, bloomAmount: 0.4, orbContraction: 0.9, speedAmount: 0, impulseAmount: 0, noiseGateDb: -48, maxDeltaSeconds: 0.25, responseExponent: NaN };
  const constructed = new AudioReactiveController(options);
  const configured = new AudioReactiveController();
  configured.configure(options);
  for (let step = 1; step <= 120; step++) {
    const now = step * 1000 / 60;
    const input = frame(step % 40 < 20 ? 0.15 : 0, now, { low: 0.5 });
    assert.deepEqual(configured.update(input, now, 1 / 60), constructed.update(input, now, 1 / 60));
  }
});

test('changing glow during input preserves envelopes, clock and existing impulse cooldown', () => {
  const baseline = new AudioReactiveController();
  const configured = new AudioReactiveController();
  let initialImpulse = 0;
  for (let step = 1; step <= 18; step++) {
    const now = step * 1000 / 60;
    const input = frame(step < 5 || step > 12 ? 0.8 : 0, now);
    if (step === 5) configured.configure({ glowAmount: 0.09 });
    const expected = baseline.update(input, now, 1 / 60);
    const actual = configured.update(input, now, 1 / 60);
    initialImpulse = Math.max(initialImpulse, step < 5 ? expected.impulse : 0);
    assert.equal(actual.level, expected.level);
    assert.equal(actual.transient, expected.transient);
    assert.equal(actual.impulse, expected.impulse);
    assert.equal(actual.bloomAdd, expected.bloomAdd);
    close(actual.glowAdd, expected.glowAdd * (step < 5 ? 1 : 2));
  }
  assert.ok(initialImpulse > 0);
});

test('changing release preserves the current envelope and changes only its subsequent decay', () => {
  const baseline = new AudioReactiveController();
  const configured = new AudioReactiveController();
  let before;
  for (let step = 1; step <= 12; step++) {
    const now = step * 1000 / 60;
    const input = frame(0.15, now);
    before = baseline.update(input, now, 1 / 60);
    configured.update(input, now, 1 / 60);
  }
  configured.configure({ releaseSeconds: 0.8 });
  const stationary = configured.update(frame(0.15, 200), 200, 0);
  assert.equal(stationary.level, before!.level);
  assert.equal(stationary.transient, before!.transient);
  const ordinaryDecay = baseline.update(frame(0, 250), 250, 0.05);
  const slowerDecay = configured.update(frame(0, 250), 250, 0.05);
  assert.ok(slowerDecay.level > ordinaryDecay.level);
  assert.ok(slowerDecay.level < before!.level);
});

test('runtime zero visual overrides preserve the active level and configure() restores default options', () => {
  const configured = new AudioReactiveController();
  const baseline = new AudioReactiveController();
  for (let step = 1; step <= 6; step++) {
    const now = step * 1000 / 60;
    const input = frame(0.1, now);
    configured.update(input, now, 1 / 60); baseline.update(input, now, 1 / 60);
  }
  configured.configure({ glowAmount: 0, bloomAmount: 0, ringAmount: 0, orbContraction: 0, speedAmount: 0, impulseAmount: 0 });
  const input = frame(0.1, 100);
  const zero = configured.update(input, 100, 0);
  assert.ok(zero.level > 0);
  assert.equal(zero.glowAdd, 0); assert.equal(zero.bloomAdd, 0); assert.equal(zero.ringAdd, 0);
  assert.equal(zero.orbScale, 1); assert.equal(zero.speedScale, 1); assert.equal(zero.impulse, 0);
  configured.configure();
  assert.deepEqual(configured.update(frame(0.1, 120), 120, 0.02), baseline.update(frame(0.1, 120), 120, 0.02));
});

class FakeTrack extends EventTarget {
  readyState = 'live';
  stops = 0;
  stop() { this.stops++; this.readyState = 'ended'; }
  end() { this.readyState = 'ended'; this.dispatchEvent(new Event('ended')); }
}
const fakeStream = (track = new FakeTrack()) => ({ getTracks: () => [track], getAudioTracks: () => [track], track });
class FakeNode {
  context: FakeContext;
  connections: unknown[] = [];
  disconnected: unknown[] = [];
  constructor(context: FakeContext) { this.context = context; }
  connect(node: unknown) { this.connections.push(node); return node; }
  disconnect(node?: unknown) { this.disconnected.push(node); }
}
class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  smoothingTimeConstant = 0;
  pcmBuffers: unknown[] = [];
  get frequencyBinCount() { return this.fftSize / 2; }
  getFloatTimeDomainData(buffer: Float32Array) { this.pcmBuffers.push(buffer); buffer.fill(0.25); }
  getFloatFrequencyData(buffer: Float32Array) { buffer.fill(-40); }
}
class FakeContext extends EventTarget {
  state = 'running';
  sampleRate = 48000;
  closes = 0;
  analysers: FakeAnalyser[] = [];
  inputs: FakeNode[] = [];
  createAnalyser() { const analyser = new FakeAnalyser(this); this.analysers.push(analyser); return analyser; }
  createMediaStreamSource(_stream: unknown) { const node = new FakeNode(this); this.inputs.push(node); return node; }
  async resume() { this.state = 'running'; this.dispatchEvent(new Event('statechange')); }
  async close() { this.closes++; this.state = 'closed'; this.dispatchEvent(new Event('statechange')); }
  suspendForTest() { this.state = 'suspended'; this.dispatchEvent(new Event('statechange')); }
}
const scheduler = () => {
  const jobs = new Map<number, FrameRequestCallback>();
  let id = 0;
  return { jobs, request: (callback: FrameRequestCallback) => { jobs.set(++id, callback); return id; }, cancel: (handle: number) => { jobs.delete(handle); }, step: () => { const frame = [...jobs.values()]; jobs.clear(); for (const callback of frame) callback(0); } };
};

test('borrowed node uses a private analyser branch, reuses sample buffers and never closes the host context', async () => {
  const context = new FakeContext();
  const node = new FakeNode(context);
  const source = new WebAudioAnalyserSource({ context, node, autoSample: false, now: () => 100 });
  await source.start();
  assert.equal(source.getStatus().state, 'running');
  assert.equal(source.sample()!.rms, 0.25);
  source.sample();
  assert.equal(context.analysers[0].pcmBuffers[0], context.analysers[0].pcmBuffers[1]);
  assert.deepEqual(node.connections, [context.analysers[0]]);
  source.stop();
  assert.deepEqual(node.disconnected, [context.analysers[0]]);
  assert.equal(context.closes, 0);
  assert.equal(source.getFrame(), null);
});

test('suspended context cancels sampling; borrowed track ending is observed without stopping host tracks', async () => {
  const context = new FakeContext();
  const stream = fakeStream();
  const clock = scheduler();
  const source = new WebAudioAnalyserSource({ context, stream, scheduler: clock, now: () => 100 });
  await source.start();
  assert.equal(clock.jobs.size, 1);
  clock.step(); assert.equal(source.getFrame()!.rms, 0.25);
  context.suspendForTest();
  assert.equal(source.getStatus().state, 'suspended');
  assert.equal(clock.jobs.size, 0);
  assert.equal(source.getFrame(), null);
  await context.resume();
  assert.equal(clock.jobs.size, 1);
  stream.track.end();
  assert.equal(source.getStatus().state, 'ended');
  source.dispose();
  assert.equal(stream.track.stops, 0);
  assert.equal(context.closes, 0);
});

test('concurrent mic starts share one request; stop releases a permission result that arrives late', async () => {
  const context = new FakeContext();
  const stream = fakeStream();
  let resolvePermission!: (stream: unknown) => void;
  let permissionCalls = 0;
  const microphone = createMicrophoneAudioSource({ createContext: () => context, autoSample: false,
    getUserMedia: () => { permissionCalls++; return new Promise(resolve => { resolvePermission = resolve; }); } });
  const first = microphone.start();
  const second = microphone.start();
  assert.equal(first, second);
  assert.equal(permissionCalls, 1);
  microphone.stop();
  resolvePermission(stream);
  await first;
  assert.equal(stream.track.stops, 1);
  assert.equal(context.closes, 1);
  assert.equal(context.analysers.length, 0);
  assert.equal(microphone.getStatus().state, 'idle');
});

test('permission rejection is reported and a later explicit mic retry can succeed', async () => {
  const contexts: FakeContext[] = [];
  const stream = fakeStream();
  let attempts = 0;
  const microphone = createMicrophoneAudioSource({ createContext: () => { const context = new FakeContext(); contexts.push(context); return context; }, autoSample: false,
    getUserMedia: async () => { if (++attempts === 1) throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' }); return stream; } });
  await assert.rejects(microphone.start(), /Denied/);
  assert.equal(microphone.getStatus().reason, 'permission-denied');
  assert.equal(contexts[0].closes, 1);
  await microphone.start();
  assert.equal(microphone.getStatus().state, 'running');
  microphone.dispose();
  assert.equal(stream.track.stops, 1);
  assert.equal(contexts[1].closes, 1);
});

test('mic owns only its newly obtained stream when using an existing host context', async () => {
  const context = new FakeContext();
  const stream = fakeStream();
  const microphone = createMicrophoneAudioSource({ context, getUserMedia: async () => stream, autoSample: false });
  await microphone.start();
  microphone.dispose();
  assert.equal(stream.track.stops, 1);
  assert.equal(context.closes, 0);
});
