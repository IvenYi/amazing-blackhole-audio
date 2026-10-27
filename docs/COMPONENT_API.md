# 组件 API 与全部参数

本页以仓库实际 TypeScript 类型和运行时处理为准。导出入口为 `src/index.ts`。所有数值应传有限数字；表中的“运行范围”是组件实际限制，“建议起点”是便于调参的区间。默认值指未传参数的基础 `BlackHole`，不是 Demo 中每个控件的当前值。

## 1. 三种入口

| 入口 | 用途 | 特点 |
| --- | --- | --- |
| `BlackHole` | 基础渲染组件 | 完整外观、声音和调度参数，自行管理状态 |
| `RecordingBlackHole` | 录音状态封装 | 继承基础参数，增加 `state` 和可选 `quality` |
| `RecorderBlackHole` | 可直接迁移的示例封装 | 读取 `RECORDING_VISUAL_CONFIG`，自动按状态选预设 |

`BlackHole` 和 `RecordingBlackHole` **没有 `preset` 或 `tint` 参数**。预设要通过 `getBlackHolePreset()` 转成 props；染色直接使用 `colors`。Demo 的 `tint` 是面板开关，不是组件 API。

## 2. 容器与内容

| 参数 | 类型 / 默认 | 作用与使用方式 |
| --- | --- | --- |
| `width` | `string \| number` / `"100%"` | 根容器宽度。数字由 React 按 px 处理；字符串可用 `100%`、`100vw` |
| `height` | `string \| number` / `"100%"` | 根容器高度。使用百分比时，父容器必须有可计算的高度；最简单先传 `480` |
| `className` | `string` / 无 | 根容器的 CSS class，不要求 Tailwind |
| `style` | `CSSProperties` / 无 | 根容器内联样式，最后合并，可以覆盖 width/height。改 position/overflow 时需自行保持画布定位与裁剪正确 |
| `children` | `ReactNode` / 无 | 放在画布上方的内容层，如文字或按钮。按钮、链接、输入框等交互子元素不会触发背景点击吞噬 |

```tsx
import { BlackHole } from './src';

export function BackgroundWithContent() {
  return <BlackHole height={480} backgroundColor="#0A0A0A">
    <div style={{ padding: 24, color: '#fff' }}>声音正在被整理</div>
  </BlackHole>;
}
```

## 3. 光流、轨道与几何

| 参数 | 默认 | 运行范围 | 调整后的影响 / 建议起点 |
| --- | --- | --- | --- |
| `speed` | `1` | `0–10` | 基础轨道时间推进速度。大则流动更快；`0` 冻结轨道时间，但不会自动停止入场或弹簧。建议先 `0.4–1.5` |
| `zoom` | `1.8` | `0.2–10` | 视野范围，**越大黑洞看起来越小**，不是越大越放大。建议 `1.3–2.4` |
| `particleCount` | `13` | 先四舍五入，再限制 `1–30` | 参与光场的轨道粒子数量。更多通常更密、计算更重，不是细腻程度的唯一来源 |
| `orbSize` | `0.75` | `0.01–5` | 轨道尺度，同时影响核心环的大小。大则整体尺度变大；声音响应与吞噬会在此基础上乘缩放 |
| `mirrorSplits` | `2` | `1–16`，不自动取整 | 镜像分段数。建议使用整数；提高会产生更多对称结构。仅 `warpEnabled=true` 时参与镜像扭曲 |
| `warpEnabled` | `true` | 布尔值 | 开启弯曲、镜像光场；关闭后更接近直接的轨道光流，Orbit 预设使用关闭状态 |
| `distanceFade` | `0.35` | `≥0` | 光场累加项中距离权重的强度系数，实际参与 `dist × distanceFade`。增大会增强光场，并与 contrast 耦合；不是独立的空间衰减形状滑杆。0 会令该光场消失，但独立光子环仍可能可见；建议先在 `0–1` 内微调 |

`RecordingBlackHole` 在 `transcribing` 状态会额外将 speed 乘 `0.6`，在 `summarizing` 乘 `0.85`。例如传 `speed={0.8}`，转写时实际基础速度为 `0.48`；它之后还可能受到悬停或声音的乘数影响。详见 [状态表](PRESETS_AND_STATES.md)。

## 4. 亮度、光环与颜色

| 参数 | 默认 | 运行范围 | 调整后的影响 / 交互关系 |
| --- | --- | --- | --- |
| `glow` | `0.08` | `≥0` | 每个光场粒子的基础亮度，之后还会经过 contrast 与合成处理。增加容易让高光变实；建议先 `0.04–0.12` |
| `contrast` | `3` | `0.1–12` | 对光场应用的幂曲线。高值会更集中、带状更紧；效果与 glow 有耦合，不能把它当简单的全局曝光滑杆 |
| `bloom` | `1` | `0–4` | 多级辉光强度。`0` 关闭这部分加成；大则外围光晕更明显。浅色墨迹模式内部减为 `0.6` 倍 |
| `ringIntensity` | `1` | `0–4` | 核心边缘细光子环的亮度。声音的 ringAmount 在此基础上增加后限幅 |
| `opacity` | `1` | `0–1` | 画布最终输出透明度。`0` 不代表停止 GPU 工作；需要省电时使用 `active=false` |
| `colors` | 无 | `[string, string]` | 深底两色染色：第一个是亮核，第二个是暗边缘，通过 OKLab 过渡。浅底墨迹模式主要取两色中较强的色度决定墨迹色。提供有效两色后取代颜色循环；切回 Classic 时要清掉它 |
| `backgroundColor` | `"#000000"` | 推荐十六进制色、普通数值 rgb/rgba、`transparent` | 明确背景决定深色发光或浅色墨迹模式。亮度加权值超过 `0.55` 进入墨迹模式；Demo 与共享预设默认用 `#0A0A0A` |
| `colorShiftR` | `-6` | 有限数值 | 红通道颜色循环相位，推荐先 `-10–10`。不是直接的红色亮度；提供 colors 后主要的颜色表现改由染色控制 |
| `colorShiftG` | `-6` | 有限数值 | 绿通道颜色循环相位，含义同上 |
| `colorShiftB` | `-6` | 有限数值 | 蓝通道颜色循环相位，含义同上 |
| `colorSpeed` | `0.2` | 有限数值 | 颜色循环随时间变化的速度；`0` 不推进颜色，负数可反向。与轨道 speed 是不同维度 |

`backgroundColor="transparent"`、`"none"`、`"auto"` 或空串会沿父节点查找背景颜色，决定该用发光还是墨迹表现，但画布背景仍保持透明。为跨平台基线建议使用明确的十六进制色；普通 `rgb()`/`rgba()` 请使用 0–255 数值通道，不使用百分比写法。背景 alpha 不高于 `0.05` 时也走透明背景逻辑。

## 5. 指针、动画与调度

| 参数 | 类型 / 默认 | 行为 |
| --- | --- | --- |
| `cursorInteraction` | `boolean` / `true` | 鼠标移入逐渐加速；主指针短按触发吞噬。触屏短按也可触发，触屏移动不会触发悬停加速 |
| `cursorIntensity` | `number` / `1`，限制 `0–3` | 悬停与指针吞噬强度，也作为未传 gulp(strength) 时的默认强度 |
| `intro` | `boolean` / `true` | 挂载时播放约 2.6 秒的淡入与轨道展开；关闭时直接显示。切换外观预设不会自动重播 |
| `paused` | `boolean` / `false` | 冻结轨道时间并关闭声音响应。入场和已触发的弹簧仍可能继续；需要所有绘制停止用 active=false |
| `active` | `boolean` / `true` | 宿主控制视觉运行与否。false 时取消 rAF；恢复时重新调度，不停止输入 source、麦克风或宿主录音 |
| `dpr` | `number` / `2` | 像素比上限，限制 `0.5–3`，最终再与设备实际 DPR 取较小值。不是强制将低 DPR 设备超采样到更高值 |
| `maxFps` | `number` / 不限制 | 可选绘制帧率上限，有限值限制 `5–120`。**0 会被限制到 5，不表示不限**；不限请不传。显示器刷新率和负载仍决定实际帧率 |
| `deterministicTime` | `number` / 无 | 诊断用的着色器绝对时间，单位秒，并将 dither 帧设为 0。不会自己关闭入场、弹簧或声音，正常产品不必传 |
| `onError` | `(message:string)=>void` / 无 | WebGL 初始化失败时回调，同时显示内置文字。不是所有 GPU 错误的总回调；上下文丢失/恢复由内部监听处理 |

指针点击要求主指针、鼠标左键，按下到抬起位移不超过 10px、间隔不超过 600ms。系统 `prefers-reduced-motion: reduce` 会显示静态帧并抑制声音、悬停、gulp 与 replay；不要为录音状态绕过用户设置。

可靠的固定画面对照组合为 `intro=false`、`paused=true`、`cursorInteraction=false`、`audioSource=null`，再传 `deterministicTime`。页面隐藏或组件离屏也会停止 GPU 调度；这不保证 Web Audio 能在所有后台环境持续采样，原生录音需由宿主保障。

## 6. 声音入口

| 参数 | 类型 / 默认 | 作用 |
| --- | --- | --- |
| `audioSource` | `AudioFeatureSource \| null` / `null` | 只读声音帧。组件订阅更新、逐帧读取，不申请麦克风权限、不拥有录音流 |
| `audioStrength` | `number` / `1`，限制 `0–2` | 同时缩放亮度、光环、收缩、速度与重音增量。0 为关闭，Demo 三档为 0.55 / 1 / 1.6 |
| `audioOptions` | `AudioReactiveOptions` / 默认配置 | 精细调整门限、平滑和各视觉映射。缺省字段使用默认，传入新对象不会清掉当前包络或冷却；详细 16 项见 [声音调参](AUDIO_TUNING.md) |

`audioOptions` 每次作为完整的“默认值＋本次覆盖”解析，不是累积 patch。例如从 `{glowAmount:0.02}` 改为 `{releaseSeconds:0.5}`，glowAmount 会回默认 0.045，而不是继续保留 0.02。BlackHole 内置 maxDeltaSeconds 默认 0.25 秒；独立创建 AudioReactiveController 默认 0.1 秒。

## 7. ref 方法

| 方法 | 参数 | 行为与注意 |
| --- | --- | --- |
| `gulp(strength?)` | 可选数字，默认 cursorIntensity，限制 `0–3` | 给轨道弹簧一个冲量；0 不增加冲量。命令式 gulp 可在 paused 时运行弹簧，paused 只冻结轨道时间；减少动态效果时忽略 |
| `replay()` | 无 | 重置入场进度；intro=true 才有完整入场表现。不会将所有轨道的运行时间归零，也不会请求麦克风或重启录音 |

```tsx
import { useRef } from 'react';
import { BlackHole, type BlackHoleHandle } from './src';

export function ImperativeExample() {
  const visual = useRef<BlackHoleHandle>(null);
  return <div>
    <BlackHole ref={visual} height={400} />
    <button type="button" onClick={() => visual.current?.gulp(0.3)}>轻微回弹</button>
    <button type="button" onClick={() => visual.current?.replay()}>重播入场</button>
  </div>;
}
```

## 8. RecordingBlackHole 额外参数

继承上述全部基础参数和 ref 方法。

| 参数 | 类型 / 默认 | 作用 |
| --- | --- | --- |
| `state` | 必传 RecordingVisualState | idle / recording / paused / transcribing / summarizing / complete / error；控制声音接入、速度修正和暂停 |
| `quality` | 可选 `mobile \| desktop` / 不指定 | mobile 默认 dpr=1.25、maxFps=30；desktop 默认 dpr=2、maxFps=60；不指定则继承基础组件默认。显式 dpr/maxFps 优先 |

`cursorInteraction` 未显式传入时，只有 idle 为 true，其余状态为 false。显式传 true 会保留指针行为，可能与声音叠加；录音页面建议保持默认。

## 9. RecorderBlackHole 示例封装参数

| 参数 | 默认 | 作用 |
| --- | --- | --- |
| `state` | 必传 | 使用真实会话状态查找配置中的预设并传入 RecordingBlackHole |
| `audioSource` | 无 | 复用录音引擎的声音特征源 |
| `visible` | `true` | 传给基础组件 active，只控制视觉 |
| `quality` | `desktop` | 示例封装显式选择画质，Android 可传 mobile |
| `height` | `480` | 组件高度；可传数字或 CSS 字符串 |
| `ref` | 无 | 同 BlackHoleHandle：gulp/replay |

它主动读取 `src/recording-visual-config.ts`，因此无需把所有基础参数重复传入。需要逐项传所有 props 时，使用较底层的 RecordingBlackHole。

## 10. 声音数据、store 与测量函数

`AudioFeatureFrame` 包含 `rms`、`peak`、`low`、`mid`、`high`、`timestampMs`。前五项是 0–1 线性幅度，时间戳为当前页面 performance.now 时间域毫秒。rms 是主要驱动量，low 是收缩权重，peak/mid/high 当前不直接改变画面；保留它们用于仪表和将来扩展。

| API / 参数 | 默认 / 返回 | 说明 |
| --- | --- | --- |
| `createAudioFeatureStore({now?,maxFutureLeadMs?})` | 新 store | now 默认 performance.now；maxFutureLeadMs 默认 100ms、有限值下限 0。通常不用传这两项 |
| `store.push(partialFrame)` | boolean | 缺省幅度为 0，非法幅度变 0并限幅到0–1，peak 至少为 rms。缺省 timestamp 使用本地接收时间；拒绝非有限/负时间、乱序或超过 now+maxFutureLeadMs 的未来时间（默认允许超前100ms）。false 表示未接收 |
| `getFrame()` | 帧或 null | 返回当前最新帧，不隐式更新时间、不自动清除过期帧；衰减由 controller 负责 |
| `subscribe(listener)` | 取消函数 | push/clear 后同步通知，无需将每帧转换为 React state。调用返回函数取消监听 |
| `clear()` | void | 清除当前帧并通知，用于会话结束或切换；不会停止麦克风、编码器或任何原生任务 |
| `getSubscriberCount()` | number | 调试订阅释放，不是视觉配置 |
| `measurePcmFeatures(samples)` | `{rms,peak}` | 对归一化 PCM 计算均方根和绝对峰值；裁剪到-1–1，NaN/Infinity 计为静音，空输入为0 |
| `measureFrequencyBands(decibels,sampleRate,fftSize)` | `{low,mid,high}` | 输入每个 FFT bin 的 dB 值、采样率 Hz、FFT 大小。频段 20–250 / 250–2000 / 2000–12000Hz，受 Nyquist 限制；平均功率后开方返回幅度 |
| `normalizeAudioLevel(rms,noiseGateDb,fullScaleDb,exponent)` | 0–1 | 默认-55/-12/1.35，将实际幅度映射为视觉强度，公式见声音调参 |
| `new AudioReactiveController(options)` | 独立控制器 | 仅自定义渲染管线才需要直接使用；普通组件传 audioOptions 即可 |
| `controller.update(frame,nowMs,dtSeconds)` | AudioReactiveOutput | 输入当前帧或null、当前时间和秒单位步长；内部保持包络与冷却状态 |
| `controller.configure(options)` | void | 使用默认值加覆盖重新解析配置，保留当前包络、时钟和冷却，不等于 reset |
| `controller.reset()` | void | 清除包络、时钟、瞬态和冷却，恢复静音初始状态 |

`AudioReactiveOutput` 的全部字段为 `level/glowAdd/bloomAdd/ringAdd/orbScale/speedScale/transient/impulse`。前三种 Add 为增量、两种 Scale 为乘数；全静音时分别回到 0 与 1。`impulse` 是本次更新的一次性事件，不应每帧重复使用旧值。

## 11. WebAudioAnalyserSource 构造参数

分析已有引擎的 AudioNode 或 MediaStream，**node/stream 必须恰好提供一个**。context/node/stream 为借用资源，stop/dispose 只清理自己的分析支路。

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `context` | 必传 AudioContext | 节点所属 context；不能是 closed，node.context 必须与它相同 |
| `node` | 无，与stream二选一 | 已有输入节点，将增加一条 analyser 支路，不断开宿主其他连接 |
| `stream` | 无，与node二选一 | 已有录音流，只读采集；dispose 不调用该流 tracks.stop |
| `store` | 自动创建 | 可共享已有 store。不要让多个不同会话同时写同一个 store |
| `fftSize` | `2048` | AnalyserNode FFT 大小；应为 32–32768 的2次幂。越大频率分辨率越细，但窗口延迟/计算量也增加 |
| `autoSample` | `true` | 自动 rAF 采样；false 时自行调用 sample，不要再同时开启第二个采样循环 |
| `resumeContext` | `true` | start 时尝试恢复非running context；已有引擎自行管理 context 时可 false |
| `now` | performance.now | 时钟注入，仅用于测试或统一时间域；与store及渲染循环保持一致 |
| `scheduler` | 浏览器 rAF/cancel | 自定义 request/cancel 调度器。普通集成不需传，不应承诺其可突破后台系统限制 |

## 12. createMicrophoneAudioSource 构造参数

函数与 `new MicrophoneAudioSource(options)` 等价，构造时不申请权限。只从明确的用户操作调用 start。

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `store` | 自动创建 | 输出 store |
| `context` | 自建 | 传入时借用且不关闭；不传时由该 source 自建并在stop/dispose释放 |
| `constraints` | `true` | 传给 getUserMedia 的 audio 字段，可给 MediaTrackConstraints；video 固定 false。录音App已有流时优先借用流，不额外开第二路 |
| `fftSize` | `2048` | 含义同上 |
| `autoSample` | `true` | 含义同上 |
| `now` | performance.now | 时钟注入，含义同上 |
| `scheduler` | 浏览器 rAF/cancel | 调度注入，含义同上 |
| `getUserMedia` | navigator.mediaDevices.getUserMedia | 高级依赖注入，遵守宿主权限边界；通常不传 |
| `createContext` | `new AudioContext()` | 没传 context 时使用的工厂，主要供测试/宿主适配，不传则正常自建 |

## 13. 两种声音源的共同方法与状态

| 方法/属性 | 说明 |
| --- | --- |
| `start():Promise<void>` | 开始分析；麦克风源会请求权限。并发调用共享正在进行的启动，失败需捕获并展示 |
| `stop():void` | 停止分析并 clear，状态回 idle；可再次 start。麦克风源释放自己获得的流和自建 context |
| `dispose():void` | 最终释放，自此不能重启；借用资源不被关闭 |
| `sample():AudioFeatureFrame\|null` | 手动取样；未运行/已结束等状态返回null。自动采样开启时不必额外调用 |
| `getFrame()/subscribe()` | 实现 AudioFeatureSource，供 BlackHole 消费 |
| `store` | 只读属性，返回持有的 AudioFeatureStore |
| `getStatus()` | 返回 AudioSourceStatus 对象，含state与可选reason/error |
| `subscribeStatus(listener)` | 状态变化同步通知，返回取消函数；它与音频帧订阅是两条独立通道 |

state 的全部值为 `idle/starting/running/suspended/ended/error/disposed`。reason 可能为 `permission-denied/no-input-device/device-unavailable/unsupported/audio-start-failed/input-ended/context-closed`，或 context 暂停状态字符串。把它们映射成产品提示，不要把 error 当成静音继续显示“录音中”。

声音源负责分析与所拥有资源的释放，**不负责 MediaRecorder 文件编码、原生后台服务、上传、转写、总结或会话持久化**。
