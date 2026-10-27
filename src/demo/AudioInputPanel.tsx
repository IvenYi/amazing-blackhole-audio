import { useEffect, useRef, useState } from 'react';
import { createMicrophoneAudioSource, type AudioFeatureSource, type AudioSourceStatus } from '../audio';
import { createTestAudioSession, type TestPattern } from './test-signal';
import type { RecordingVisualState } from '../components/RecordingBlackHole';

export interface AudioDemoBinding {
  source: AudioFeatureSource | null;
  strength: number;
  state: RecordingVisualState;
}
interface Session {
  source: AudioFeatureSource;
  dispose(): void;
  unsubscribe?(): void;
  setPattern?(value: TestPattern): void;
  getPhase?(): string;
}
const statusText: Record<string, string> = {
  'permission-denied': '麦克风权限未获允许。可在浏览器站点设置中允许后重试。',
  'no-input-device': '没有检测到麦克风，请连接输入设备后重试。',
  'device-unavailable': '麦克风暂时无法使用，请检查是否被其他程序独占。',
  'unsupported': '当前环境无法使用麦克风预览，请通过 localhost 或 HTTPS 打开。',
};

export default function AudioInputPanel({ onChange }: { onChange(binding: AudioDemoBinding): void }) {
  const [mode, setMode] = useState<'off' | 'test' | 'microphone'>('off');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('可先用测试音源比较反馈，再启用麦克风。');
  const [error, setError] = useState('');
  const [strength, setStrength] = useState(1);
  const [state, setState] = useState<RecordingVisualState>('recording');
  const [pattern, setPattern] = useState<TestPattern>('speech');
  const [meter, setMeter] = useState({ rms: 0, peak: 0, phase: '未启用声音' });
  const session = useRef<Session | null>(null);
  const generation = useRef(0);
  const testAbort = useRef<AbortController | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const stop = () => {
    generation.current++;
    testAbort.current?.abort();
    testAbort.current = null;
    const current = session.current;
    session.current = null;
    current?.unsubscribe?.();
    current?.dispose();
    setMode('off');
    setPending(false);
    setError('');
    setMeter({ rms: 0, peak: 0, phase: '未启用声音' });
    setMessage('声音输入已停止，黑洞恢复原版参数。');
    onChangeRef.current({ source: null, strength, state });
  };

  useEffect(() => {
    onChangeRef.current({ source: session.current?.source ?? null, strength, state });
  }, [strength, state, mode]);
  useEffect(() => () => {
    generation.current++;
    testAbort.current?.abort();
    session.current?.unsubscribe?.();
    session.current?.dispose();
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const frame = session.current?.source.getFrame();
      setMeter({ rms: frame?.rms ?? 0, peak: frame?.peak ?? 0, phase: session.current?.getPhase?.() ?? (mode === 'microphone' ? '麦克风输入' : '未启用声音') });
    }, 160);
    return () => window.clearInterval(timer);
  }, [mode]);

  const start = async (next: 'test' | 'microphone') => {
    stop();
    const token = ++generation.current;
    setPending(true);
    setMessage(next === 'microphone' ? '等待麦克风授权，可随时取消。' : '正在启动测试音源…');
    try {
      if (next === 'test') {
        const abort = new AbortController();
        testAbort.current = abort;
        const test = await createTestAudioSession(abort.signal);
        if (testAbort.current === abort) testAbort.current = null;
        if (token !== generation.current) { test.stop(); return; }
        test.setPattern(pattern);
        session.current = { source: test.source, dispose: test.stop, setPattern: test.setPattern, getPhase: test.getPhase };
      } else {
        const source = createMicrophoneAudioSource();
        session.current = { source, dispose: () => source.dispose() };
        const statusChanged = () => {
          if (token !== generation.current) return;
          const status: AudioSourceStatus = source.getStatus();
          if (status.state === 'suspended') setMessage('声音分析已暂停；点击麦克风可重新启用。');
          if (status.state === 'ended' || status.state === 'error') {
            stop();
            setError(statusText[status.reason ?? ''] ?? '声音输入已中断，请重新启用。');
          }
        };
        session.current.unsubscribe = source.subscribeStatus(statusChanged);
        await source.start();
        if (token !== generation.current) { source.dispose(); return; }
      }
      setMode(next);
      setState('recording');
      setError('');
      setMessage(next === 'test' ? '8 秒循环：静音 → 轻声 → 正常说话 → 重音 → 停顿。测试音不外放。' : '仅在本机分析麦克风，不保存、不上传，也不外放。');
      onChangeRef.current({ source: session.current!.source, strength, state: 'recording' });
    } catch (caught) {
      if (token !== generation.current) return;
      const reason = session.current && 'getStatus' in session.current.source
        ? (session.current.source as ReturnType<typeof createMicrophoneAudioSource>).getStatus().reason : '';
      stop();
      setError(statusText[reason ?? ''] ?? (caught instanceof Error ? caught.message : '声音输入启动失败，请重试。'));
    } finally {
      if (token === generation.current) setPending(false);
    }
  };

  return <section className="audio-panel" aria-label="声音反馈 Demo">
    <div className="audio-panel-heading"><div><h2>让声音进入黑洞</h2><p>先比较声音反馈，录音与 AI 状态稍后接入你的 App。</p></div><span className={`audio-indicator ${mode !== 'off' ? 'is-live' : ''}`}>{mode === 'test' ? '测试音源' : mode === 'microphone' ? '麦克风已启用' : '原版效果'}</span></div>
    <div className="audio-actions">
      <button type="button" className="audio-primary" disabled={pending} onClick={() => void start('test')}>运行声音测试</button>
      <button type="button" className="audio-secondary" disabled={pending} onClick={() => void start('microphone')}>启用麦克风</button>
      <button type="button" className="audio-secondary" disabled={mode === 'off' && !pending} onClick={stop}>{pending ? '取消' : '停止声音'}</button>
    </div>
    <div className="audio-feedback-row"><span>反馈强度</span><div className="audio-strength" role="group" aria-label="反馈强度">{[['轻柔', 0.55], ['平衡', 1], ['明显', 1.6]].map(([label, value]) => <button type="button" key={label} aria-pressed={strength === value} onClick={() => setStrength(Number(value))}>{label}</button>)}</div>
      <div className="audio-meter" role="meter" aria-label="输入音量" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.max(-60, 20 * Math.log10(Math.max(meter.rms, 0.001)))}>
        <span style={{ width: `${Math.min(100, Math.max(0, (20 * Math.log10(Math.max(meter.rms, 0.001)) + 60) / 60 * 100))}%` }} />
      </div><output className="audio-db" aria-live="off">{meter.rms > 0.001 ? `${(20 * Math.log10(meter.rms)).toFixed(0)} dBFS` : '静音'}</output>
    </div>
    {mode !== 'off' && <div className="audio-demo-options">
      {mode === 'test' && <label htmlFor="test-pattern">音色<select id="test-pattern" value={pattern} onChange={event => { const value = event.target.value as TestPattern; setPattern(value); session.current?.setPattern?.(value); }}><option value="speech">模拟说话</option><option value="bass">低频对照</option><option value="treble">高频对照</option><option value="silence">静音对照</option></select></label>}
      <label htmlFor="recording-state">预览状态<select id="recording-state" value={state} onChange={event => setState(event.target.value as RecordingVisualState)}><option value="recording">声音响应</option><option value="paused">暂停</option><option value="transcribing">转写中（演示）</option><option value="summarizing">总结中（演示）</option><option value="complete">完成（演示）</option></select></label>
      <span className="audio-phase" data-testid="audio-phase">{meter.phase}</span>
    </div>}
    <p className={error ? 'audio-message is-error' : 'audio-message'} role="status">{error || message}</p>
  </section>;
}
