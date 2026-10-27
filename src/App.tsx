import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { type BlackHoleHandle } from './components/BlackHole';
import RecordingBlackHole from './components/RecordingBlackHole';
import AudioInputPanel, { type AudioDemoBinding } from './demo/AudioInputPanel';
import { defaults, presets, settingsForPreset, type PresetName, type Settings } from './settings';

type NumericKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
type BooleanKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
type RangeDefinition = { key: NumericKey; label: string; min: number; max: number; step: number };

const orbitControls: RangeDefinition[] = [
  { key: 'speed', label: '速度', min: 0, max: 3, step: 0.05 },
  { key: 'zoom', label: '视野', min: 0.5, max: 4, step: 0.05 },
  { key: 'particleCount', label: '粒子数量', min: 1, max: 30, step: 1 },
  { key: 'orbSize', label: '轨道半径', min: 0.1, max: 2, step: 0.01 },
  { key: 'glow', label: '粒子亮度', min: 0, max: 0.3, step: 0.005 },
  { key: 'contrast', label: '对比度', min: 0.5, max: 8, step: 0.1 },
  { key: 'distanceFade', label: '距离衰减', min: 0, max: 1, step: 0.01 },
];
const lightControls: RangeDefinition[] = [
  { key: 'bloom', label: '辉光', min: 0, max: 4, step: 0.05 },
  { key: 'ringIntensity', label: '光子环', min: 0, max: 4, step: 0.05 },
  { key: 'opacity', label: '不透明度', min: 0, max: 1, step: 0.01 },
];
const colorControls: RangeDefinition[] = [
  { key: 'colorShiftR', label: '红色相位', min: -10, max: 10, step: 0.1 },
  { key: 'colorShiftG', label: '绿色相位', min: -10, max: 10, step: 0.1 },
  { key: 'colorShiftB', label: '蓝色相位', min: -10, max: 10, step: 0.1 },
  { key: 'colorSpeed', label: '变色速度', min: 0, max: 1, step: 0.01 },
];

function Icon({ name }: { name: 'play' | 'pause' | 'replay' | 'expand' | 'copy' | 'check' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'play' && <path d="m9 5 11 7-11 7V5Z" />}
    {name === 'pause' && <><path d="M8 5v14M16 5v14" /></>}
    {name === 'replay' && <><path d="M3 10a9 9 0 1 1 2.5 8M3 4v6h6" /></>}
    {name === 'expand' && <><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" /></>}
    {name === 'copy' && <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>}
    {name === 'check' && <path d="m5 12 4 4L19 6" />}
  </svg>;
}

function Range({ definition, settings, onChange }: {
  definition: RangeDefinition; settings: Settings; onChange: (key: NumericKey, value: number) => void;
}) {
  const { key, label, min, max, step } = definition;
  const value = settings[key];
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return <div className="range-field">
    <label htmlFor={key}>{label}<output htmlFor={key}>{value.toFixed(decimals)}</output></label>
    <input id={key} type="range" min={min} max={max} step={step} value={value}
      style={{ '--range-fill': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      onChange={event => onChange(key, Number(event.target.value))} />
  </div>;
}

function Toggle({ name, label, checked, onChange }: {
  name: string; label: string; checked: boolean; onChange: (checked: boolean) => void;
}) {
  return <label className="toggle-field" htmlFor={name}><span>{label}</span>
    <input id={name} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
  </label>;
}

function getInitialState() {
  const params = new URLSearchParams(window.location.search);
  const presetValue = params.get('preset') ?? 'classic';
  const preset: PresetName = presetValue in presets ? presetValue as PresetName : 'classic';
  const background = params.get('bg') === 'light' ? '#FFFFFF' : '#0A0A0A';
  const values = settingsForPreset(preset, background);
  const encodedSettings = params.get('settings');
  if (encodedSettings) {
    try {
      const restored = JSON.parse(encodedSettings) as Record<string, unknown>;
      for (const key of Object.keys(values) as (keyof Settings)[]) {
        const value = restored[key];
        if ((typeof value === typeof values[key] && (typeof value !== 'number' || Number.isFinite(value))) ||
          (key === 'colors' && Array.isArray(value) && value.length === 2 && value.every(channel => typeof channel === 'string'))) {
          Object.assign(values, { [key]: value });
        }
      }
    } catch { /* Malformed preview links fall back to the named preset. */ }
  }
  if (params.has('time')) {
    values.intro = false;
    values.paused = true;
    values.cursorInteraction = false;
  }
  return { params, preset, values };
}

export default function App() {
  const [initial] = useState(getInitialState);
  const [settings, setSettings] = useState<Settings>(initial.values);
  const [preset, setPreset] = useState<string>(initial.preset);
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [copyStatus, setCopyStatus] = useState('');
  const [fixedFrame, setFixedFrame] = useState(initial.params.has('time'));
  const [frameTime, setFrameTime] = useState(Number(initial.params.get('time') ?? 4) || 0);
  const [audio, setAudio] = useState<AudioDemoBinding>({ source: null, strength: 1, state: 'recording' });
  const onAudioChange = useCallback((binding: AudioDemoBinding) => setAudio(binding), []);
  const blackHole = useRef<BlackHoleHandle>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasOnly = initial.params.get('view') === 'canvas';
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'preview' : event.key === 'End' ? 'code' : tab === 'preview' ? 'code' : 'preview';
    setTab(next);
    document.getElementById(`${next}-tab`)?.focus();
  };

  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(current => ({ ...current, [key]: value }));
    setPreset('custom');
  };
  const toggle = (key: BooleanKey, value: boolean) => change(key, value);
  const applyPreset = (name: PresetName) => {
    setPreset(name);
    setSettings(current => ({ ...settingsForPreset(name, current.backgroundColor), paused: current.paused, intro: current.intro }));
  };
  const reset = () => {
    setPreset('classic');
    setFixedFrame(false);
    setSettings({ ...defaults });
    blackHole.current?.replay();
  };

  const componentProps = { ...settings, colors: settings.tint ? settings.colors : undefined };
  const codeProps = Object.entries(componentProps).filter(([key]) => key !== 'tint');
  const usage = `import BlackHole from './components/BlackHole';\n\nexport default function Example() {\n  return (\n    <div style={{ height: 600, position: 'relative' }}>\n      <BlackHole\n${codeProps.filter(([, value]) => value !== undefined).map(([key, value]) => `        ${key}={${JSON.stringify(value)}}`).join('\n')}\n      />\n    </div>\n  );\n}\n`;

  const copyUsage = async () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(usage);
      setCopyStatus('已复制');
    } catch {
      setCopyStatus('复制未成功，请在代码页手动选择');
    }
    copyTimer.current = setTimeout(() => setCopyStatus(''), 3500);
  };

  const effect = <RecordingBlackHole {...componentProps} ref={blackHole}
    state={audio.source && !fixedFrame ? audio.state : 'idle'}
    audioSource={fixedFrame ? null : audio.source} audioStrength={audio.strength}
    quality={audio.source ? 'desktop' : undefined}
    deterministicTime={fixedFrame ? frameTime : undefined}
    intro={fixedFrame ? false : settings.intro}
    paused={fixedFrame || settings.paused}
    cursorInteraction={!fixedFrame && !audio.source && settings.cursorInteraction} />;

  if (canvasOnly) {
    return <main className="canvas-only" aria-label="黑洞纯画布预览">{effect}
      {!fixedFrame && <a className="back-link" href={window.location.pathname}>← 返回参数面板</a>}
    </main>;
  }

  return <main className="app-shell">
    <header className="page-header">
      <div className="heading"><span className="eyebrow">交互式背景</span><h1>Black Hole</h1>
        <p>烟雾般的光线绕过黑洞，汇成一道光子环。</p></div>
      <a className="reference-link" href="https://pro.reactbits.dev/docs/components/black-hole" target="_blank" rel="noreferrer">官方参考 ↗</a>
    </header>

    <div className="workspace">
      <section className="preview-column" aria-label="组件预览">
        {!canvasOnly && <AudioInputPanel onChange={onAudioChange} />}
        <div className="preview-toolbar">
          <div className="view-tabs" role="tablist" aria-label="预览或代码">
            <button type="button" role="tab" tabIndex={tab === 'preview' ? 0 : -1} onKeyDown={onTabKeyDown} aria-selected={tab === 'preview'} aria-controls="preview-panel" id="preview-tab" onClick={() => setTab('preview')}>预览</button>
            <button type="button" role="tab" tabIndex={tab === 'code' ? 0 : -1} onKeyDown={onTabKeyDown} aria-selected={tab === 'code'} aria-controls="code-panel" id="code-tab" onClick={() => setTab('code')}>代码</button>
          </div>
          <div className="toolbar-actions">
            <button type="button" className="icon-button" aria-label={settings.paused ? '播放动画' : '暂停动画'} title={settings.paused ? '播放' : '暂停'}
              disabled={fixedFrame} onClick={() => toggle('paused', !settings.paused)}><Icon name={settings.paused ? 'play' : 'pause'} /></button>
            <button type="button" className="icon-button" aria-label="重播入场动画" title="重播入场动画" disabled={fixedFrame} onClick={() => blackHole.current?.replay()}><Icon name="replay" /></button>
            <a className="icon-button" aria-label="打开纯画布预览" title="打开纯画布预览" href={`?view=canvas&settings=${encodeURIComponent(JSON.stringify(settings))}${fixedFrame ? `&time=${frameTime}` : ''}`}><Icon name="expand" /></a>
          </div>
        </div>

        <div className="stage" style={{ backgroundColor: settings.backgroundColor }} id="preview-panel" role="tabpanel" aria-labelledby="preview-tab" hidden={tab !== 'preview'}>
          {tab === 'preview' && effect}
        </div>
        <div className="code-panel" id="code-panel" role="tabpanel" aria-labelledby="code-tab" hidden={tab !== 'code'}>
          <div className="code-heading"><span>React · TypeScript</span><button type="button" className="text-button" onClick={copyUsage}><Icon name={copyStatus === '已复制' ? 'check' : 'copy'} />复制代码</button></div>
          <pre tabIndex={0}><code>{usage}</code></pre>
        </div>
        <div className="preview-footer">
          <span>{fixedFrame ? `固定时间 ${frameTime.toFixed(2)} 秒` : settings.paused || audio.state === 'paused' ? '已暂停' : audio.source ? '光环随音量变化 · 低频牵动轨道' : '移入加速 · 点击收缩回弹'}</span>
          <button type="button" className="text-button" disabled={fixedFrame} onClick={() => blackHole.current?.gulp(1)}>触发吞噬 <span aria-hidden="true">↗</span></button>
        </div>
        <p className="status" role="status">{copyStatus}</p>
        <div className="integration-note"><h2>放进你的页面</h2><p>为容器设置高度，即可作为背景使用。组件支持叠加内容，也可以通过 ref 调用重播和吞噬效果。</p>
          <div className="integration-actions"><code>npm install three@0.181.0</code><button type="button" className="text-button" onClick={() => setTab('code')}>查看当前参数代码 →</button></div>
        </div>
      </section>

      <aside className="controls" aria-label="黑洞参数">
        <div className="controls-heading"><h2>自定义</h2><button type="button" className="text-button" onClick={reset}>重置</button></div>
        <label className="preset-field" htmlFor="preset">预设
          <select id="preset" value={preset} onChange={event => applyPreset(event.target.value as PresetName)}>
            {preset === 'custom' && <option value="custom" disabled>自定义</option>}
            {Object.entries(presets).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
          </select>
        </label>
        <div className="color-field"><label htmlFor="backgroundColor">背景</label><input id="backgroundColor" type="color" value={settings.backgroundColor} onChange={event => change('backgroundColor', event.target.value)} /><span>{settings.backgroundColor.toUpperCase()}</span>
          <button type="button" className="theme-button" aria-label="切换明暗背景" title="切换明暗背景" onClick={() => change('backgroundColor', settings.backgroundColor.toLowerCase() === '#ffffff' ? '#0A0A0A' : '#FFFFFF')}>◐</button>
        </div>
        <Toggle name="tint" label="自定义染色" checked={settings.tint} onChange={value => toggle('tint', value)} />
        {settings.tint && <div className="tint-colors">{(['光核', '边缘'] as const).map((label, index) => <label key={label}>{label}<input aria-label={`${label}颜色`} type="color" value={settings.colors[index]} onChange={event => {
          const colors: [string, string] = [...settings.colors]; colors[index] = event.target.value; change('colors', colors);
        }} /></label>)}</div>}

        <div className="control-section">{orbitControls.map(definition => <Range key={definition.key} definition={definition} settings={settings} onChange={change} />)}</div>
        <div className="control-section">
          <Toggle name="warpEnabled" label="镜像扭曲" checked={settings.warpEnabled} onChange={value => toggle('warpEnabled', value)} />
          <Range definition={{ key: 'mirrorSplits', label: '镜像分段', min: 1, max: 8, step: 1 }} settings={settings} onChange={change} />
          {lightControls.map(definition => <Range key={definition.key} definition={definition} settings={settings} onChange={change} />)}
        </div>
        <details className="advanced"><summary>颜色循环</summary><div className="control-section">{colorControls.map(definition => <Range key={definition.key} definition={definition} settings={settings} onChange={change} />)}</div></details>
        <div className="control-section">
          <Toggle name="cursorInteraction" label="鼠标交互" checked={settings.cursorInteraction} onChange={value => toggle('cursorInteraction', value)} />
          <Range definition={{ key: 'cursorIntensity', label: '交互强度', min: 0, max: 3, step: 0.1 }} settings={settings} onChange={change} />
          <Toggle name="intro" label="入场动画" checked={settings.intro} onChange={value => toggle('intro', value)} />
        </div>
        <details className="advanced"><summary>画质与固定帧</summary><div className="control-section">
          <Range definition={{ key: 'dpr', label: '像素比上限', min: 1, max: 3, step: 0.25 }} settings={settings} onChange={change} />
          <Toggle name="fixedFrame" label="固定时间预览" checked={fixedFrame} onChange={setFixedFrame} />
          {fixedFrame && <div className="range-field"><label htmlFor="frameTime">动画时间 <output htmlFor="frameTime">{frameTime.toFixed(2)} s</output></label>
            <input id="frameTime" type="range" min="0" max="30" step="0.05" value={frameTime} onChange={event => setFrameTime(Number(event.target.value))} /></div>}
          <p className="field-help">固定时间用于比较画面，会停止动画和鼠标响应。</p>
        </div></details>
      </aside>
    </div>
    <footer className="page-footer"><span>Black Hole · React / WebGL</span><span>本地运行</span></footer>
  </main>;
}
