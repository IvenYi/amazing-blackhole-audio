# 声音驱动黑洞：实现与接入

本模块共享 React + Three/WebGL2 黑洞、音频特征分析及录音状态 UI。当前交付不包含原生后台录音、持久录音文件或转录/总结服务。平台实施路径见 [PLATFORMS.md](./PLATFORMS.md)；没有执行三平台打包与真机验证。

## 1. 模块边界

```text
用户点击开始 → 录音引擎 → 编码/本地文件 → 可选且经用户选择的 AI 任务
                    └→ RMS / peak / bands → 特征源 → 黑洞渲染循环
```

录音引擎持有麦克风、编码器、文件和权威会话状态。黑洞只读特征：隐藏页面、卸载组件或 WebGL context 丢失都不能停止原生录音。浏览器入口用于实际捕获与分析声音；要长期后台录音，按平台文档实现原生服务/helper 和文件持久化。

不传 `audioSource` 时保留原黑洞参数、着色器与时间逻辑；`audioStrength={0}` 关闭声音增量。声音只给既有参数叠加有限变化，避免直接重置原设计。`active={false}` 仅停止视觉工作，不是录音停止命令；`paused` 也只属于视觉参数。

| 接口 | 用途 |
| --- | --- |
| `BlackHole.audioSource?: AudioFeatureSource` | 提供 `getFrame()` 与 `subscribe()`，由渲染循环读取 |
| `audioStrength?: number` | 0–2，默认 1；调整声音影响强度 |
| `audioOptions?: AudioReactiveOptions` | 16 项声音映射参数；应用中统一由 recording-visual-config.ts 配置 |
| `active?: boolean` | 默认 true；宿主隐藏窗口/页面时关闭视觉 |
| `maxFps?: number` | 默认不限；移动端建议先测试 30 |
| `createAudioFeatureStore()` | 返回 `push/getFrame/subscribe/clear`，供原生指标注入 |

`AudioReactiveController.update()` 在渲染循环执行门限、attack/release、过期衰减和限幅，不在音频采样回调里逐次 `setState`。音量主要影响光晕、bloom、环亮度和轻微半径变化，速度变化保持有限；low 目前只影响收缩权重，peak/mid/high 不直接映射视觉，不能解释成音高、说话人或情绪。Classic 当前声音 Demo 已获用户认可；轻柔/平衡/明显分别为 audioStrength 0.55/1/1.6。后续可经 audioOptions 自调，改变后须以实际声音验证，完整参数见 [AUDIO_TUNING.md](./AUDIO_TUNING.md)，迁移步骤见 [MIGRATION.md](./MIGRATION.md)。

## 2. 已有/未来原生录音引擎接入

桥只传归一化指标，建议 20–30 Hz。`rms` 是归一化 PCM 的均方根；`peak` 是绝对峰值；`low/mid/high` 是幅度尺度的频段能量，范围均为 0–1，不传 dB、0–255 仪表值或整段 PCM。分析同一采集流；不要为了动效再开第二路麦克风。

Web 分析器频段为 20–250 Hz、250–2000 Hz、2000–12000 Hz（上限受 Nyquist 限制），按 FFT bin 平均功率再开平方。原生尽量使用同一约定。仅有 RMS 时也可响应；缺省频段按零处理。

原生消息示例：`{"rms":0.16,"peak":0.48,"low":0.08,"mid":0.14,"high":0.02}`。宿主校验消息来源、类型、有限数值与会话 ID，再推送 store；不要通过 JSON 传连续原始 PCM。接收端省略 `timestampMs`，store 使用本地 `performance.now()`；不要直接传 Unix 时间、Android elapsedRealtime 或另一进程的单调时钟值。若自行传时间戳，必须先转换至页面同一时间域，按序发送。

以下是项目根目录接入文件的 TypeScript/TSX 调用示例；只连接指标与视觉，不实现原生 transport 或录音器。示例校验状态见本文末尾。

```tsx
import BlackHole from './src/components/BlackHole';
import { createAudioFeatureStore } from './src/audio';

export const features = createAudioFeatureStore();
type Metrics = { rms: number; peak?: number; low?: number; mid?: number; high?: number };

// 只由已完成来源/类型校验的宿主桥调用；20–30 Hz 即可。
export function receiveMetrics(m: Metrics) {
  features.push({ rms: m.rms, peak: m.peak, low: m.low, mid: m.mid, high: m.high });
}

export function RecordingVisual({ recording, visible }: { recording: boolean; visible: boolean }) {
  return <BlackHole height="100%" audioSource={recording ? features : undefined}
    audioStrength={1} active={visible} maxFps={30} dpr={1} />;
}
```

会话停止、切换或重建时调用 `features.clear()`；重新挂载页面先向宿主查询当前会话，再订阅。音频指标可以丢弃旧帧，录音状态和文件完成事件不能丢失。网络/AI 使用独立通道，音频 store 不上传任何内容。

## 3. 浏览器麦克风入口

只能在用户点击“启用麦克风/开始”后申请权限；不在组件挂载、页面加载或定时任务中启动采集。使用 HTTPS 或 localhost，拒绝、无设备、设备被占用分别给可恢复状态；停止时释放本入口拥有的资源。WebAudio 的分析节点提供时域与频域数据，本身不负责文件编码与持久化。[Media Capture 规范](https://www.w3.org/TR/mediacapture-streams/)、[Web Audio AnalyserNode](https://www.w3.org/TR/webaudio/#AnalyserNode)

`createMicrophoneAudioSource({ store?, context?, constraints?, fftSize?, autoSample? })` 创建惰性声音源。仅调用 `start()` 才请求麦克风，`start()` 的 Promise 由点击处理函数捕获并展示错误。`stop()` 和 `dispose()` 释放自有麦克风 tracks、关闭工厂自建的 AudioContext；传入的 context 不被关闭。`stop()` 后可重新开始，`dispose()` 后对象不再可用。

已有 Web Audio 节点/流使用 `new WebAudioAnalyserSource({ context, node?, stream?, store?, fftSize?, autoSample?, resumeContext? })`，其中 `node` 与 `stream` 恰选一个。调用 `start/stop/dispose` 管理分析支路；借用的流不停止 tracks，借用 context 不关闭或暂停，不把麦克风接到 destination 播放。`resumeContext` 默认 true，若共享引擎自行管理 context，可设为 false。两者都实现 `getFrame/subscribe`，并提供 `getStatus/subscribeStatus`；`sample()` 用于关闭自动采样后的手动分析。

浏览器 demo 的授权与声音分析成功，不代表 Android 锁屏录音或桌面关窗录音已实现；这些使用原生录音路径。

## 4. 状态由真实事件驱动

`RecordingBlackHole` 支持 `idle/recording/paused/transcribing/summarizing/complete/error`。宿主在录音引擎确认开始/暂停/恢复后更新状态，声音源仅在 `recording` 响应。转录、总结分别在真实任务开始、成功或失败时更新；没有后端进度时显示不定进度，不能靠计时器自动完成或假百分比。`complete` 必须有实际已完成结果，`error` 保留已录文件与重试入口。

默认仅本机采集分析；是否上传、上传哪个文件、使用哪项 AI 服务必须由产品流程另行明确选择。页面退出只关闭视觉订阅；用户明确停止后，录音引擎完成文件落盘再回传停止结果。

## 5. 代码校验边界

上面的完整 TSX 片段已提取并通过当前项目 TypeScript 配置检查（2026-10-27）。统一复查命令为 `npm run check:docs`：脚本校验参数覆盖和相对文档链接，提取完整 TS/TSX 代码块，并对原目录与真实复制的迁移目录执行类型检查；仅调整项目根目录示例的相对 import 路径。它证明调用与当前导出兼容，不证明原生 transport 已实现。平台 XML/plist 是配置示意；原生录音器、安装包及三平台真机检查尚未完成。其余实际执行的验证以根目录 README 为准。
