import type { BlackHoleProps } from './components/BlackHole';

export type BlackHolePresetName = 'classic' | 'halo' | 'kaleido' | 'orbit' | 'aurora' | 'violet' | 'ember' | 'frost';
export type BlackHoleVisualPreset = Pick<BlackHoleProps,
  'speed' | 'zoom' | 'particleCount' | 'orbSize' | 'glow' | 'contrast' |
  'mirrorSplits' | 'warpEnabled' | 'distanceFade' | 'colorShiftR' |
  'colorShiftG' | 'colorShiftB' | 'colorSpeed' | 'colors' | 'backgroundColor' |
  'opacity' | 'bloom' | 'ringIntensity'
>;

const classic: BlackHoleVisualPreset = {
  speed: 1, zoom: 1.8, particleCount: 13, orbSize: 0.75, glow: 0.08,
  contrast: 3, mirrorSplits: 2, warpEnabled: true, distanceFade: 0.35,
  colorShiftR: -6, colorShiftG: -6, colorShiftB: -6, colorSpeed: 0.2,
  colors: undefined, backgroundColor: '#0A0A0A', opacity: 1, bloom: 1, ringIntensity: 1,
};

export const BLACK_HOLE_PRESETS = {
  classic: { label: 'Classic', values: {} },
  halo: { label: 'Halo', values: { zoom: 2.4, orbSize: 0.6, glow: 0.09, contrast: 4, bloom: 1.3, ringIntensity: 1.6 } },
  kaleido: { label: 'Kaleido', values: { zoom: 2, particleCount: 16, mirrorSplits: 4 } },
  orbit: { label: 'Orbit', values: { zoom: 1.3, particleCount: 9, contrast: 3.2, distanceFade: 0.28, warpEnabled: false, bloom: 1.4 } },
  aurora: { label: 'Aurora', values: { colorShiftR: -5.5, colorShiftG: -5.8, colorShiftB: -6, colorSpeed: 0.25 } },
  violet: { label: 'Violet', values: { bloom: 1.2, colors: ['#FFFFFF', '#5227FF'] } },
  ember: { label: 'Ember', values: { contrast: 3.5, bloom: 1.2, colors: ['#FFE7C2', '#FF7A27'] } },
  frost: { label: 'Frost', values: { particleCount: 18, glow: 0.07, colors: ['#F0F7FF', '#3F8CFF'] } },
} satisfies Record<BlackHolePresetName, { label: string; values: BlackHoleVisualPreset }>;

/** Complete visual props, suitable for JSX spread. State, audio and quality remain host-owned. */
export function getBlackHolePreset(
  name: BlackHolePresetName = 'classic',
  overrides: BlackHoleVisualPreset = {},
): BlackHoleVisualPreset {
  const result: BlackHoleVisualPreset = { ...classic, ...BLACK_HOLE_PRESETS[name].values, ...overrides };
  if (result.colors) result.colors = [...result.colors];
  return result;
}
