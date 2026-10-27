import { forwardRef } from 'react';
import RecordingBlackHole, { type RecordingVisualState } from '../components/RecordingBlackHole';
import type { BlackHoleHandle } from '../components/BlackHole';
import type { AudioFeatureSource } from '../audio';
import { getBlackHolePreset } from '../presets';
import { RECORDING_VISUAL_CONFIG } from '../recording-visual-config';

export interface RecorderBlackHoleProps {
  state: RecordingVisualState;
  audioSource?: AudioFeatureSource | null;
  visible?: boolean;
  quality?: 'mobile' | 'desktop';
  height?: string | number;
}

/** Ready to connect to the host's actual recorder and AI state. Does not start recording. */
const RecorderBlackHole = forwardRef<BlackHoleHandle, RecorderBlackHoleProps>(function RecorderBlackHole(
  { state, audioSource, visible = true, quality = 'desktop', height = 480 }, ref,
) {
  const appearance = getBlackHolePreset(
    RECORDING_VISUAL_CONFIG.presetByState[state],
    RECORDING_VISUAL_CONFIG.visualOverridesByState[state],
  );
  return <RecordingBlackHole {...appearance} ref={ref}
    state={state} audioSource={audioSource} active={visible} quality={quality} height={height}
    audioStrength={RECORDING_VISUAL_CONFIG.audioStrength}
    audioOptions={RECORDING_VISUAL_CONFIG.audioOptions} />;
});

export default RecorderBlackHole;
