import { WebAudioAnalyserSource } from '../audio';

export type TestPattern = 'speech' | 'bass' | 'treble' | 'silence';
export interface TestAudioSession {
  source: WebAudioAnalyserSource;
  setPattern(pattern: TestPattern): void;
  stop(): void;
  getPhase(): string;
}

/** Generated test tones are analysed locally and never connected to speakers. */
export async function createTestAudioSession(signal?: AbortSignal): Promise<TestAudioSession> {
  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.value = 0;
  const oscillators = [1, 2.03, 3.07].map((harmonic, index) => {
    const oscillator = context.createOscillator();
    const partial = context.createGain();
    partial.gain.value = [0.72, 0.2, 0.08][index];
    oscillator.frequency.value = 160 * harmonic;
    oscillator.connect(partial);
    partial.connect(gain);
    oscillator.start();
    return { oscillator, partial, harmonic };
  });
  const source = new WebAudioAnalyserSource({ context, node: gain });
  let stopped = false;
  let pattern: TestPattern = 'speech';
  let phase = '静音';
  const began = context.currentTime;
  const update = () => {
    if (stopped) return;
    const t = (context.currentTime - began) % 8;
    let amplitude = 0;
    if (pattern !== 'silence') {
      if (t < 1) phase = '静音';
      else if (t < 3) { phase = '轻声'; amplitude = 0.012; }
      else if (t < 5.3) { phase = '正常说话'; amplitude = 0.065; }
      else if (t < 6.2) { phase = '强调重音'; amplitude = 0.26; }
      else phase = '停顿';
      const syllable = 0.18 + 0.82 * Math.max(0, Math.sin(context.currentTime * Math.PI * 5)) ** 0.7;
      amplitude *= syllable;
    } else phase = '静音';
    gain.gain.setTargetAtTime(amplitude, context.currentTime, 0.018);
    const base = pattern === 'bass' ? 100 : pattern === 'treble' ? 3200 : 160;
    for (const { oscillator, harmonic } of oscillators) oscillator.frequency.setTargetAtTime(base * harmonic, context.currentTime, 0.03);
  };
  const timer = window.setInterval(update, 30);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener('abort', stop);
    window.clearInterval(timer);
    source.dispose();
    oscillators.forEach(({ oscillator, partial }) => { oscillator.stop(); oscillator.disconnect(); partial.disconnect(); });
    gain.disconnect();
    void context.close().catch(() => {});
  };
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) { stop(); throw new DOMException('Test signal cancelled.', 'AbortError'); }
  try { await source.start(); } catch (error) { stop(); throw error; }
  if (signal?.aborted) { stop(); throw new DOMException('Test signal cancelled.', 'AbortError'); }
  return { source, setPattern(value) { pattern = value; update(); }, stop, getPhase: () => phase };
}
