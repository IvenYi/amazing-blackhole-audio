# Classic 基线、其他预设与录音状态切换

当前配置对所有状态都使用 Classic；录音声音强度为 1。你可以先原样迁移，再只改转写或总结的外观。预设只描述外观，状态只描述引擎正在做什么，两者通过映射表连接。

## 1. 预设的正确使用方式

```tsx
import { BlackHole, getBlackHolePreset } from './src';

export function ClassicExample() {
  return <BlackHole {...getBlackHolePreset('classic')} height={480} />;
}

export function HaloExample() {
  return <BlackHole {...getBlackHolePreset('halo', { bloom: 1.1 })} height={480} />;
}
```

`getBlackHolePreset(name, overrides?)` 默认 name 为 classic。只接受下表八个名称；TypeScript 会检查名称。返回新的完整视觉 props，第二参数最后覆盖。它不包含 state、audioSource、audioOptions、paused、intro、cursorInteraction、dpr、maxFps 或容器大小，这些仍由宿主决定。

不要给 BlackHole 直接传 `preset="halo"`，也不要将 Demo 的 `Settings` 对象直接当成公开组件参数。`colors` 是真正的染色入口，`tint` 只是 Demo 开关。

## 2. 八种预设的具体值

Classic 基线：speed=1、zoom=1.8、particleCount=13、orbSize=0.75、glow=0.08、contrast=3、mirrorSplits=2、warpEnabled=true、distanceFade=0.35、colorShiftR/G/B=-6、colorSpeed=0.2、bloom=1、ringIntensity=1、opacity=1、backgroundColor=#0A0A0A、colors=undefined。

下表是相对 Classic 的**全部覆盖值**，未列出的字段恢复到 Classic。

| 名称 | 视觉特点 | 完整覆盖值 |
| --- | --- | --- |
| `classic` | 当前确认的黑白光流基线 | 无覆盖 |
| `halo` | 更小、更集中的核心与更亮光环 | zoom=2.4、orbSize=0.6、glow=0.09、contrast=4、bloom=1.3、ringIntensity=1.6 |
| `kaleido` | 更多镜像结构 | zoom=2、particleCount=16、mirrorSplits=4 |
| `orbit` | 关闭镜像扭曲，更直接的轨道 | zoom=1.3、particleCount=9、contrast=3.2、distanceFade=0.28、warpEnabled=false、bloom=1.4 |
| `aurora` | 颜色循环有轻微通道差异 | colorShiftR=-5.5、colorShiftG=-5.8、colorShiftB=-6、colorSpeed=0.25 |
| `violet` | 白核与紫色边缘 | bloom=1.2、colors=[#FFFFFF,#5227FF] |
| `ember` | 暖色边缘 | contrast=3.5、bloom=1.2、colors=[#FFE7C2,#FF7A27] |
| `frost` | 冷蓝边缘与较密粒子 | particleCount=18、glow=0.07、colors=[#F0F7FF,#3F8CFF] |

`getBlackHolePreset('classic')` 会明确返回 `colors:undefined`。从 Violet 切回 Classic 时，必须用这种完整预设覆盖；只覆盖几个变化字段会让旧 colors 残留。

```tsx
import { useState } from 'react';
import { BlackHole, getBlackHolePreset, type BlackHolePresetName } from './src';

export function StyleSwitcher() {
  const [name, setName] = useState<BlackHolePresetName>('classic');
  return <div>
    <BlackHole {...getBlackHolePreset(name)} height={420} />
    <button type="button" onClick={() => setName('violet')}>紫色</button>
    <button type="button" onClick={() => setName('classic')}>恢复 Classic</button>
  </div>;
}
```

切换是 props 更新，保持同一 WebGL 实例和轨道时间，**没有内置预设间渐变或自动重播**。不要用变化的 React key 强制重建来实现普通切换；需要重播入场时显式调用 ref.replay。以后若增加平滑过渡，应在应用层对外观参数插值，不通过反复卸载组件实现。

## 3. 录音 Classic，转写 Halo，总结 Violet

可以直接采用下列完整状态映射，声音源仍只在 recording 生效。状态必须来自实际录音/AI 引擎事件；此示例不会创建转写服务。

```tsx
import {
  RecordingBlackHole, getBlackHolePreset,
  type AudioFeatureSource, type BlackHolePresetName, type RecordingVisualState,
} from './src';

const appearanceByState: Record<RecordingVisualState, BlackHolePresetName> = {
  idle: 'classic', recording: 'classic', paused: 'classic',
  transcribing: 'halo', summarizing: 'violet', complete: 'classic', error: 'classic',
};

export function StateDrivenVisual({ state, source, visible }: {
  state: RecordingVisualState;
  source: AudioFeatureSource;
  visible: boolean;
}) {
  return <RecordingBlackHole {...getBlackHolePreset(appearanceByState[state])}
    state={state} audioSource={source} audioStrength={1}
    active={visible} quality="desktop" height={480} />;
}
```

如果直接使用项目提供的 RecorderBlackHole，只需编辑 `src/recording-visual-config.ts` 的 `presetByState.transcribing` 为 `halo`、`presetByState.summarizing` 为 `violet`，其余保留 classic。默认配置没有替你改成其他预设。

## 4. 每个状态实际上会做什么

| state | 声音源 | 速度修正 | 暂停行为 | 默认指针交互 |
| --- | --- | --- | --- | --- |
| `idle` | 不传入基础组件 | ×1 | 继承传入 paused | 开启 |
| `recording` | 传入 audioSource | ×1，再叠加声音 speedScale | 继承传入 paused | 关闭 |
| `paused` | 不传入 | ×1 | 轨道暂停 | 关闭 |
| `transcribing` | 不传入 | ×0.6 | 继承传入 paused | 关闭 |
| `summarizing` | 不传入 | ×0.85 | 继承传入 paused | 关闭 |
| `complete` | 不传入 | ×1 | 继承传入 paused | 关闭 |
| `error` | 不传入 | ×1 | 轨道暂停 | 关闭 |

状态本身**不自动选择预设**，必须由上述映射或 RecorderBlackHole 的应用级配置选择。complete 当前没有自动闪光、自动 gulp 或结果卡片，error 也不会为你保存文件；这些应由录音 App 的真实流程实现。显式 cursorInteraction 可以覆盖表中默认值。

如果使用最基础的 BlackHole，所有这些状态规则都由调用方控制，它不会读取 state 字符串。

## 5. 单独微调一个状态

下面的转写样式使用 Halo，并将 bloom 降至 1.1。结果速度是 `0.8×0.6=0.48`，因为 wrapper 还会做转写速度修正。

```tsx
import { RecordingBlackHole, getBlackHolePreset } from './src';

export function SubtleTranscribingVisual() {
  return <RecordingBlackHole
    {...getBlackHolePreset('halo', { bloom: 1.1, speed: 0.8 })}
    state="transcribing" height={480} quality="desktop" />;
}
```

采用 RecorderBlackHole 时，在 `visualOverridesByState` 增加 transcribing 对象即可。外观覆盖不应放 paused、audioSource、active 或 quality：这些属于生命周期和输入，不是皮肤。

## 6. 配置与 JSX 的覆盖顺序

先展开 getBlackHolePreset，再在后面传宿主控制参数。需要覆盖预设时，使用第二参数，或在 JSX 中把明确的单项放在展开之后。不要先传背景、后展开完整预设，否则预设背景会覆盖它。

```tsx
import { BlackHole, getBlackHolePreset } from './src';

export function TransparentClassic() {
  return <div style={{ height: 480, background: '#0A0A0A' }}>
    <BlackHole {...getBlackHolePreset('classic', { backgroundColor: 'transparent' })}
      height="100%" />
  </div>;
}
```

质量与状态独立：quality=mobile 影响 DPR/帧率，不会把 Classic 变成另一个预设。显式 dpr/maxFps 的优先级高于 quality。
