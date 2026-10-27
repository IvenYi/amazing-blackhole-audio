import type { BlackHoleProps } from './components/BlackHole';
import { BLACK_HOLE_PRESETS, getBlackHolePreset } from './presets';

export type Settings = Required<Pick<BlackHoleProps,
  'speed' | 'zoom' | 'particleCount' | 'orbSize' | 'glow' | 'contrast' |
  'mirrorSplits' | 'warpEnabled' | 'distanceFade' | 'colorShiftR' |
  'colorShiftG' | 'colorShiftB' | 'colorSpeed' | 'backgroundColor' |
  'opacity' | 'bloom' | 'ringIntensity' | 'cursorInteraction' |
  'cursorIntensity' | 'intro' | 'paused' | 'dpr'
>> & { tint: boolean; colors: [string, string] };

export const defaults: Settings = {
  speed: 1, zoom: 1.8, particleCount: 13, orbSize: 0.75, glow: 0.08,
  contrast: 3, mirrorSplits: 2, warpEnabled: true, distanceFade: 0.35,
  colorShiftR: -6, colorShiftG: -6, colorShiftB: -6, colorSpeed: 0.2,
  backgroundColor: '#0A0A0A', opacity: 1, bloom: 1, ringIntensity: 1,
  cursorInteraction: true, cursorIntensity: 1, intro: true, paused: false,
  dpr: 2, tint: false, colors: ['#FFFFFF', '#5227FF'],
};

export const presets = BLACK_HOLE_PRESETS;

export type PresetName = keyof typeof presets;

export function settingsForPreset(preset: PresetName, background = '#0A0A0A'): Settings {
  const { colors, ...visual } = getBlackHolePreset(preset, { backgroundColor: background });
  return { ...defaults, ...visual, tint: !!colors, colors: colors ?? ['#FFFFFF', '#5227FF'] };
}
