import { forwardRef } from 'react';
import BlackHole, { type BlackHoleHandle, type BlackHoleProps } from './BlackHole';

export type RecordingVisualState = 'idle' | 'recording' | 'paused' | 'transcribing' | 'summarizing' | 'complete' | 'error';
export interface RecordingBlackHoleProps extends BlackHoleProps {
  state: RecordingVisualState;
  quality?: 'mobile' | 'desktop';
}

/** The host owns recording and AI jobs. This wrapper reflects their reported state only. */
const RecordingBlackHole = forwardRef<BlackHoleHandle, RecordingBlackHoleProps>(function RecordingBlackHole(
  { state, quality, audioSource, paused, speed = 1, dpr, maxFps, cursorInteraction, ...props }, ref,
) {
  const processing = state === 'transcribing' || state === 'summarizing';
  return <BlackHole {...props} ref={ref}
    audioSource={state === 'recording' ? audioSource : null}
    speed={processing ? speed * (state === 'transcribing' ? 0.6 : 0.85) : speed}
    paused={paused || state === 'paused' || state === 'error'}
    cursorInteraction={cursorInteraction ?? state === 'idle'}
    dpr={dpr ?? (quality === 'mobile' ? 1.25 : quality === 'desktop' ? 2 : undefined)}
    maxFps={maxFps ?? (quality === 'mobile' ? 30 : quality === 'desktop' ? 60 : undefined)} />;
});

export default RecordingBlackHole;
