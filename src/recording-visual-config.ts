import type { AudioReactiveOptions } from './audio';
import type { RecordingVisualState } from './components/RecordingBlackHole';
import type { BlackHolePresetName, BlackHoleVisualPreset } from './presets';

/** Application-level configuration. These values retain the accepted Classic / balanced baseline. */
export interface RecorderVisualConfig {
  presetByState: Record<RecordingVisualState, BlackHolePresetName>;
  visualOverridesByState: Partial<Record<RecordingVisualState, BlackHoleVisualPreset>>;
  audioStrength: number;
  audioOptions: AudioReactiveOptions;
}

export const RECORDING_VISUAL_CONFIG: RecorderVisualConfig = {
  presetByState: {
    idle: 'classic', recording: 'classic', paused: 'classic', transcribing: 'classic',
    summarizing: 'classic', complete: 'classic', error: 'classic',
  },
  visualOverridesByState: {},
  audioStrength: 1,
  audioOptions: {
    attackSeconds: 0.065, releaseSeconds: 0.32, noiseGateDb: -55, fullScaleDb: -12,
    responseExponent: 1.35, staleAfterMs: 180, staleFadeMs: 180, futureToleranceMs: 40,
    maxDeltaSeconds: 0.25, glowAmount: 0.045, bloomAmount: 0.8, ringAmount: 0.8,
    orbContraction: 0.1, speedAmount: 0.25, impulseAmount: 0.12, impulseCooldownMs: 600,
  },
};
