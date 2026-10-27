export interface AudioFeatureFrame {
  rms: number;
  peak: number;
  low: number;
  mid: number;
  high: number;
  /** Monotonic milliseconds in the same clock domain as performance.now(). */
  timestampMs: number;
}

export interface AudioFeatureSource {
  getFrame(): AudioFeatureFrame | null;
  subscribe(listener: () => void): () => void;
}

export interface AudioFeatureStore extends AudioFeatureSource {
  push(frame: Partial<AudioFeatureFrame>): boolean;
  clear(): void;
  getSubscriberCount(): number;
}

export const unit = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function createAudioFeatureStore(options: { now?: () => number; maxFutureLeadMs?: number } = {}): AudioFeatureStore {
  const now = options.now ?? (() => performance.now());
  const futureLead = options.maxFutureLeadMs !== undefined && Number.isFinite(options.maxFutureLeadMs) ? Math.max(0, options.maxFutureLeadMs) : 100;
  const listeners = new Set<() => void>();
  let current: AudioFeatureFrame | null = null;
  return {
    push(input) {
      const receivedAt = now();
      const timestampMs = input.timestampMs ?? receivedAt;
      if (!Number.isFinite(timestampMs) || !Number.isFinite(receivedAt) || timestampMs < 0 || timestampMs > receivedAt + futureLead || (current && timestampMs < current.timestampMs)) return false;
      const rms = unit(input.rms);
      current = Object.freeze({ rms, peak: Math.max(rms, unit(input.peak)), low: unit(input.low), mid: unit(input.mid), high: unit(input.high), timestampMs });
      for (const listener of listeners) listener();
      return true;
    },
    getFrame: () => current,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    clear() {
      if (!current) return;
      current = null;
      for (const listener of listeners) listener();
    },
    getSubscriberCount: () => listeners.size,
  };
}

/** PCM values outside full scale are clipped; invalid samples count as silence. */
export function measurePcmFeatures(samples: ArrayLike<number>): { rms: number; peak: number } {
  if (!samples.length) return { rms: 0, peak: 0 };
  let energy = 0;
  let peak = 0;
  for (let index = 0; index < samples.length; index++) {
    const value = Number.isFinite(samples[index]) ? Math.min(1, Math.max(-1, samples[index])) : 0;
    energy += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  return { rms: Math.sqrt(energy / samples.length), peak };
}

/** Mean FFT-bin power expressed as an amplitude, not a byte-scaled meter. */
export function measureFrequencyBands(decibels: ArrayLike<number>, sampleRate: number, fftSize: number) {
  const ranges = [[20, 250], [250, 2000], [2000, 12000]] as const;
  const values = ranges.map(([minimum, maximum]) => {
    const binHz = sampleRate / fftSize;
    const start = Math.max(0, Math.ceil(minimum / binHz));
    const end = Math.min(decibels.length, Math.ceil(Math.min(maximum, sampleRate / 2) / binHz));
    if (!Number.isFinite(binHz) || binHz <= 0 || end <= start) return 0;
    let power = 0;
    for (let index = start; index < end; index++) {
      const db = decibels[index];
      if (Number.isFinite(db)) power += 10 ** (Math.min(db, 0) / 10);
    }
    return unit(Math.sqrt(power / (end - start)));
  });
  return { low: values[0], mid: values[1], high: values[2] };
}
