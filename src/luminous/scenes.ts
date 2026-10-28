export type LuminousScene = 'home' | 'recording' | 'paused' | 'playback';
export const LUMINOUS_SCENES: Record<LuminousScene, { energy: number; speed: number }> = {
  home: { energy: 1, speed: 1 },
  recording: { energy: 1, speed: 1 },
  paused: { energy: .65, speed: .12 },
  playback: { energy: 1, speed: 1 },
};
