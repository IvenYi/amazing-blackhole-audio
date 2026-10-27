import test from 'node:test';
import assert from 'node:assert/strict';
import { getBlackHolePreset } from '../work/audio-test-build/presets.js';
import { RECORDING_VISUAL_CONFIG } from '../work/audio-test-build/recording-visual-config.js';
import { AudioReactiveController } from '../work/audio-test-build/audio/index.js';

test('switching from coloured or unwarped styles to Classic clears previous style state', () => {
  let current = { ...getBlackHolePreset('violet') };
  assert.deepEqual(current.colors, ['#FFFFFF', '#5227FF']);
  current = { ...current, ...getBlackHolePreset('orbit') };
  assert.equal(current.warpEnabled, false);
  assert.equal(current.colors, undefined);
  current = { ...current, ...getBlackHolePreset('classic') };
  assert.equal(current.warpEnabled, true);
  assert.equal(current.colors, undefined);
  assert.equal(current.bloom, 1);
  assert.equal(current.particleCount, 13);
});

test('preset overrides win without contaminating later calls or returned colour arrays', () => {
  const custom = getBlackHolePreset('violet', { bloom: 0.4, backgroundColor: 'transparent' });
  custom.colors![1] = '#FF0000';
  const later = getBlackHolePreset('violet');
  assert.equal(custom.bloom, 0.4);
  assert.equal(custom.backgroundColor, 'transparent');
  assert.equal(later.bloom, 1.2);
  assert.equal(later.colors![1], '#5227FF');
});

test('visual presets do not overwrite host state, audio input, dimensions or quality', () => {
  for (const name of ['classic', 'halo', 'kaleido', 'orbit', 'aurora', 'violet', 'ember', 'frost'] as const) {
    const preset = getBlackHolePreset(name);
    for (const key of ['state', 'paused', 'audioSource', 'audioStrength', 'audioOptions', 'active', 'dpr', 'maxFps', 'width', 'height', 'tint']) {
      assert.equal(Object.hasOwn(preset, key), false, `${name} must not include ${key}`);
    }
  }
});

test('application handoff configuration retains Classic and the accepted balanced audio mapping', () => {
  assert.ok(Object.values(RECORDING_VISUAL_CONFIG.presetByState).every(name => name === 'classic'));
  assert.equal(RECORDING_VISUAL_CONFIG.audioStrength, 1);
  const original = new AudioReactiveController({ maxDeltaSeconds: 0.25 });
  const configured = new AudioReactiveController(RECORDING_VISUAL_CONFIG.audioOptions);
  for (let index = 0; index < 120; index++) {
    const now = index * 1000 / 60;
    const rms = index < 60 ? 0.04 : 0;
    const frame = { rms, peak: rms, low: 0.01, mid: 0, high: 0, timestampMs: now };
    assert.deepEqual(configured.update(frame, now, 1 / 60), original.update(frame, now, 1 / 60));
  }
});
