import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import LuminousBlackHole from './LuminousBlackHole';
import { LUMINOUS_SCENES, type LuminousScene } from './scenes';
import './style.css';

const names: Record<LuminousScene, string> = { home: '首页视界', recording: '录音聚拢', paused: '暂停收敛', playback: '回放环流' };
const params = new URLSearchParams(location.search);
const initial = params.get('scene') as LuminousScene;
const fixed = params.has('time') ? Number(params.get('time')) : undefined;
const records = [
  { title: '客户沟通', detail: '今天 10:42 · 24:18' },
  { title: '一个关于首页的想法', detail: '昨天 · 02:36' },
  { title: '产品命名', detail: '周一 · 05:12' },
];
function Icon({ name }: { name: 'back' | 'search' | 'more' | 'mic' | 'next' | 'previous' }) {
  const paths = {
    back: <path d="m15 4-8 8 8 8" />,
    search: <><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
    more: <><circle cx="12" cy="4" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="20" r="1"/></>,
    mic: <><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,
    previous: <><path d="M6 5v14"/><path d="m18 5-10 7 10 7Z" fill="currentColor" strokeLinejoin="round"/></>,
    next: <><path d="M18 5v14"/><path d="m6 5 10 7-10 7Z" fill="currentColor" strokeLinejoin="round"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">{paths[name]}</svg>;
}
function App() {
  const [scene, setScene] = useState<LuminousScene>(initial in LUMINOUS_SCENES ? initial : 'home');
  const [layout, setLayout] = useState(params.get('layout') ?? 'phone');
  const [running, setRunning] = useState(true);
  const [motion,setMotion]=useState<'ripple'|'continuous'|'flowing'>(params.get('motion')==='ripple'?'ripple':params.get('motion')==='flowing'?'flowing':'continuous');
  const [progress, setProgress] = useState(272);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [note, setNote] = useState('确认首页方向，下次讨论细节。');
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const cancelHold = () => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; };
  useEffect(() => cancelHold, []);
  const wide = layout === 'wide';
  const isHome = scene === 'home' && !wide;
  const isPlayback = scene === 'playback' || (wide && scene === 'home');
  const changeScene = (next: LuminousScene) => {
    cancelHold(); setScene(next); setPlaying(false);
    const url = new URL(location.href); url.searchParams.set('scene', next); history.replaceState(null, '', url);
  };
  const changeLayout = (next: string) => {
    setLayout(next); const url = new URL(location.href); url.searchParams.set('layout', next); history.replaceState(null, '', url);
  };
  const shownRecords = records.filter(record => record.title.includes(query));
  const start = <button className="primary" aria-label="开始录音演示" onClick={() => changeScene('recording')}><Icon name="mic"/>开始录音</button>;
  const search = <label className="search-box"><Icon name="search"/><input aria-label="搜索示例记录" placeholder="搜索记录" value={query} onChange={e => setQuery(e.target.value)}/></label>;
  return <main className={`lab ${params.has('embed') ? 'embedded' : ''}`}>
    <header className="lab-header"><a className="lab-brand" href="/luminous.html">声渊 <span>光流探索 {motion==='flowing'?'V2.1':motion==='continuous'?'V2':'V1'}</span></a><p>持续光流 · 黑核光影 · 示例内容</p><a href="/">原版对照 ↗</a></header>
    <nav className="scene-nav" aria-label="黑洞形态">{(Object.keys(names) as LuminousScene[]).map(key => <button key={key} aria-pressed={scene === key} onClick={() => changeScene(key)}>{names[key]}</button>)}</nav>
    <div className={`stage ${layout} scene-${scene}`}>
      <div className="art"><LuminousBlackHole scene={scene} active={running} motion={motion} deterministicTime={fixed}/></div>
      {layout !== 'canvas' && <>
        <div className="device-status" aria-hidden="true"><span>9:41</span><span className="device-indicators">◒ ◢ ▰</span></div>
        <header className={`app-header ${isHome ? 'is-home' : ''} ${isPlayback ? 'is-playback' : ''}`}>
          {wide ? <><span className="wordmark">声渊</span><nav className="desktop-tabs" aria-label="工作区"><span aria-current="page">全部记录</span><span>主题</span><span>回收站</span></nav>{search}{start}</> : <>
            {!isHome && <button className="icon-button back" aria-label="返回首页" onClick={() => changeScene('home')}><Icon name="back"/></button>}
            {!isPlayback && <span className="wordmark">声渊</span>}
            <div className="header-actions">{isHome && <button className="icon-button" aria-label="搜索示例记录" aria-expanded={searching} onClick={() => setSearching(!searching)}><Icon name="search"/></button>}<span className="more-mark" aria-hidden="true"><Icon name="more"/></span></div>
          </>}
        </header>
        {wide && <aside className="archive"><h2>最近记录</h2>{shownRecords.map((record, i) => <button className={i === 0 ? 'selected' : ''} key={record.title} onClick={() => changeScene('playback')}>{record.title}<small>{record.detail}</small></button>)}</aside>}
        {isHome ? <section className="home-content"><h1>此刻，想记录什么</h1>{start}<div className="recent"><div className="section-heading"><h2>最近记录</h2><span>全部 ›</span></div>{searching && search}{shownRecords.slice(0, 2).map(record => <button key={record.title} onClick={() => changeScene('playback')}><span>{record.title}<small>{record.detail}</small></span><span className="mini-play"><span className="play-symbol"/></span></button>)}</div></section>
          : isPlayback ? <>
            <section className="record-title"><h1>客户沟通</h1><p>今天 10:42 · 24分18秒</p></section>
            <section className="playback-content">
              <div className="progress"><input aria-label="示例播放进度" type="range" min="0" max="1458" value={progress} onChange={e => setProgress(Number(e.target.value))} style={{ '--progress': `${progress / 1458 * 100}%` } as CSSProperties}/><div className="times"><span>{String(Math.floor(progress / 60)).padStart(2, '0')}:{String(progress % 60).padStart(2, '0')}</span><span>24:18</span></div></div>
              <div className="transport"><button className="skip" aria-label="示例后退15秒" onClick={() => setProgress(Math.max(0, progress - 15))}><Icon name="previous"/></button><button className="orbit-button" aria-label={playing ? '暂停回放演示' : '播放演示（无音频）'} onClick={() => setPlaying(!playing)}>{playing ? <span className="pause-symbol"/> : <span className="play-symbol"/>}</button><button className="skip" aria-label="示例前进15秒" onClick={() => setProgress(Math.min(1458, progress + 15))}><Icon name="next"/></button><button className="rate" aria-label="示例播放速度" onClick={() => setRate(rate === 2 ? 1 : rate + .5)}>{rate.toFixed(1)}×</button></div>
              <div className="note"><div><h2>备注</h2><button onClick={() => setEditing(!editing)}>{editing ? '完成' : '编辑'}</button></div>{editing ? <textarea aria-label="示例备注" value={note} onChange={e => setNote(e.target.value)}/> : <p>{note}</p>}</div>
            </section>
          </> : <section className="capture-content"><p className="capture-status">{scene === 'paused' ? '已暂停' : '正在录音'}</p><p className="timer">03:24</p><button className="orbit-button" aria-label={scene === 'paused' ? '继续演示' : '暂停演示'} onPointerDown={event => {
            if (event.button !== 0) return; held.current = false; cancelHold(); event.currentTarget.setPointerCapture(event.pointerId);
            holdTimer.current = setTimeout(() => { held.current = true; changeScene('home'); }, 650);
          }} onPointerUp={cancelHold} onPointerCancel={cancelHold} onContextMenu={event => event.preventDefault()} onClick={() => { if (!held.current) changeScene(scene === 'paused' ? 'recording' : 'paused'); held.current = false; }}>{scene === 'paused' ? <span className="play-symbol"/> : <span className="pause-symbol"/>}</button><p className="gesture">轻点{scene === 'paused' ? '继续' : '暂停'} · 长按结束</p></section>}
        {!isHome && <p className="sample-caption">视觉预览 · 示例内容</p>}
        <div className="home-indicator" aria-hidden="true"/>
      </>}
    </div>
    <footer className="lab-controls"><div aria-label="动效版本">{([['ripple','V1 · 波纹'],['continuous','V2 · 已保存'],['flowing','V2.1 · 流动调整']] as const).map(([key,label])=><button key={key} aria-pressed={motion===key} onClick={()=>{setMotion(key);const url=new URL(location.href);url.searchParams.set('motion',key);history.replaceState(null,'',url);}}>{label}</button>)}</div><div aria-label="预览尺寸">{[['phone', '手机'], ['wide', '桌面'], ['canvas', '纯画面']].map(([key, label]) => <button key={key} aria-pressed={layout === key} onClick={() => changeLayout(key)}>{label}</button>)}</div><button aria-pressed={!running} onClick={() => setRunning(!running)}>{running ? '冻结画面' : '继续动画'}</button></footer>
    <p className="lab-note">V2 保持原样；V2.1 在相同光丝材质上增加光带形变、局部烟雾卷散和黑核受光。60Hz 上限 / DPR 上限 2。此页未连接录音、声音反馈和文件操作。</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
