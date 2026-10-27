import { unit, type AudioFeatureFrame } from './features.js';

export interface AudioReactiveOutput {
  level: number;
  glowAdd: number;
  bloomAdd: number;
  ringAdd: number;
  orbScale: number;
  speedScale: number;
  transient: number;
  impulse: number;
}

export interface AudioReactiveOptions {
  attackSeconds?: number;
  releaseSeconds?: number;
  noiseGateDb?: number;
  fullScaleDb?: number;
  responseExponent?: number;
  staleAfterMs?: number;
  staleFadeMs?: number;
  futureToleranceMs?: number;
  maxDeltaSeconds?: number;
  glowAmount?: number;
  bloomAmount?: number;
  ringAmount?: number;
  orbContraction?: number;
  speedAmount?: number;
  impulseAmount?: number;
  impulseCooldownMs?: number;
}

const positive = (value: number | undefined, fallback: number) =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;

function resolveOptions(options: AudioReactiveOptions): Required<AudioReactiveOptions> {
  return {
    attackSeconds: positive(options.attackSeconds, 0.065),
    releaseSeconds: positive(options.releaseSeconds, 0.32),
    noiseGateDb: Number.isFinite(options.noiseGateDb) ? options.noiseGateDb! : -55,
    fullScaleDb: Number.isFinite(options.fullScaleDb) ? options.fullScaleDb! : -12,
    responseExponent: positive(options.responseExponent, 1.35),
    staleAfterMs: positive(options.staleAfterMs, 180),
    staleFadeMs: positive(options.staleFadeMs, 180),
    futureToleranceMs: positive(options.futureToleranceMs, 40),
    maxDeltaSeconds: positive(options.maxDeltaSeconds, 0.1),
    glowAmount: options.glowAmount === 0 ? 0 : positive(options.glowAmount, 0.045),
    bloomAmount: options.bloomAmount === 0 ? 0 : positive(options.bloomAmount, 0.8),
    ringAmount: options.ringAmount === 0 ? 0 : positive(options.ringAmount, 0.8),
    orbContraction: options.orbContraction === 0 ? 0 : Math.min(0.3, positive(options.orbContraction, 0.1)),
    speedAmount: options.speedAmount === 0 ? 0 : positive(options.speedAmount, 0.25),
    impulseAmount: options.impulseAmount === 0 ? 0 : positive(options.impulseAmount, 0.12),
    impulseCooldownMs: positive(options.impulseCooldownMs, 600),
  };
}

export function normalizeAudioLevel(rms: number, noiseGateDb = -55, fullScaleDb = -12, exponent = 1.35) {
  const amplitude = unit(rms);
  if (!amplitude) return 0;
  const db = 20 * Math.log10(amplitude);
  if (db <= noiseGateDb) return 0;
  const fraction = unit((db - noiseGateDb) / Math.max(1, fullScaleDb - noiseGateDb));
  return fraction ** positive(exponent, 1.35);
}

/** One controller per renderer. Call update in the render loop, never in a React state setter. */
export class AudioReactiveController {
  private level = 0;
  private fast = 0;
  private lastNow: number | null = null;
  private lastImpulseAt = -Infinity;
  private transientWasHot = false;
  private options: Required<AudioReactiveOptions>;

  constructor(options: AudioReactiveOptions = {}) {
    this.options = resolveOptions(options);
  }

  /** Replace options (omitted keys use defaults), retaining envelope, clock and impulse cooldown state. */
  configure(options: AudioReactiveOptions = {}) { this.options = resolveOptions(options); }

  reset() { this.level = 0; this.fast = 0; this.lastNow = null; this.lastImpulseAt = -Infinity; this.transientWasHot = false; }

  update(frame: AudioFeatureFrame | null, nowMs: number, dtSeconds: number): AudioReactiveOutput {
    const config = this.options;
    const now = Number.isFinite(nowMs) ? Math.max(0, nowMs) : (this.lastNow ?? 0);
    const elapsed = this.lastNow === null ? Math.max(0, dtSeconds) : Math.max(0, (now - this.lastNow) / 1000);
    this.lastNow = now;
    const dt = Math.min(config.maxDeltaSeconds, Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0, elapsed);
    const resumedAfterGap = elapsed > 0.25;
    if (resumedAfterGap) {
      this.level *= Math.exp(-(elapsed - dt) / config.releaseSeconds);
      this.fast *= Math.exp(-(elapsed - dt) / 0.025);
    }
    const age = frame && Number.isFinite(frame.timestampMs) ? now - frame.timestampMs : Infinity;
    let target = 0;
    if (frame && age >= -config.futureToleranceMs) {
      const freshness = unit(1 - Math.max(0, age - config.staleAfterMs) / config.staleFadeMs);
      target = normalizeAudioLevel(frame.rms, config.noiseGateDb, config.fullScaleDb, config.responseExponent) * freshness;
    }
    const tau = target > this.level ? config.attackSeconds : config.releaseSeconds;
    this.level += (target - this.level) * (1 - Math.exp(-dt / tau));
    this.fast += (target - this.fast) * (1 - Math.exp(-dt / 0.025));
    if (target === 0 && this.level < 0.0001) this.level = 0;
    if (target === 0 && this.fast < 0.0001) this.fast = 0;
    const level = unit(this.level);
    const transient = unit(Math.max(0, this.fast - this.level) * 2.5);
    const hot = transient >= 0.18;
    let impulse = 0;
    if (!resumedAfterGap && hot && !this.transientWasHot && now - this.lastImpulseAt >= config.impulseCooldownMs) {
      impulse = config.impulseAmount * transient;
      this.lastImpulseAt = now;
    }
    this.transientWasHot = hot;
    const bassWeight = 0.75 + 0.25 * unit((frame?.low ?? 0) * 4);
    return {
      level,
      glowAdd: level * config.glowAmount,
      bloomAdd: level * config.bloomAmount,
      ringAdd: level * config.ringAmount,
      orbScale: 1 - level * config.orbContraction * bassWeight,
      speedScale: 1 + level * config.speedAmount,
      transient,
      impulse,
    };
  }
}
