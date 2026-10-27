# 声音响应调参

Classic 的当前声音 Demo 已获用户认可，可作为迁移基线。轻柔、平衡、明显三档分别使用 `audioStrength={0.55}`、`{1}`、`{1.6}`；这些只改变声音增量，不切换视觉预设。修改映射后仍需用真实人声、静音和环境噪声验证。组件外观参数见 [COMPONENT_API.md](./COMPONENT_API.md)，录音与转写切换见 [PRESETS_AND_STATES.md](./PRESETS_AND_STATES.md)。

## 1. 数据怎样变成动效

RMS 输入是归一化 PCM 的幅度，0–1；不把 dB、百分比或 0–255 值直接传给 `rms`。当前公式如下，`clamp01` 将结果限制到 0–1：

```text
db = 20 × log10(clamp01(rms))
rms = 0 或 db ≤ noiseGateDb 时，target = 0
否则 target = clamp01((db - noiseGateDb) / max(1, fullScaleDb - noiseGateDb)) ^ responseExponent
target 再乘以数据新鲜度；随后经过 attack/release 平滑得到 level。
```

默认门限是 -55 dBFS，达到 -12 dBFS 时响应达到满值；这里的 `fullScaleDb` 是动效满响应参考，不是把数字音频的满幅定义改成 -12 dBFS。默认指数 1.35：大于 1 会让中弱音更弱，小于 1 会提起中弱音。近似例：RMS 0.001 → 门限下为零；0.01 → level 目标约 0.24；0.1 → 约 0.76；0.25 → 接近 1。这些是稳定输入的公式值，不是所有麦克风的实测读数。

平滑使用 `current += (target-current) × (1-exp(-dt/tau))`。65 ms attack / 320 ms release 是时间常数，不表示在该时间内完成变化；约 3 个时间常数完成 95% 的变化。弱音响应不足先检查输入幅度与门限，再调视觉增量。

| 输入 | 当前实际用途 |
| --- | --- |
| `rms` | 决定 level；驱动光晕、bloom、圆环、收缩、流速及瞬态 |
| `low` | 仅影响收缩权重：`bassWeight = 0.75 + 0.25 × clamp01(low × 4)`；缺省 low=0 仍保留 75% 收缩权重 |
| `peak`、`mid`、`high` | 目前保留作分析/仪表数据，不直接控制视觉；不能声称高频改变颜色或 peak 直接触发吞噬 |

瞬态来自 RMS 的 25 ms 快包络与主包络之差，`transient=clamp01(max(0,fast-level)×2.5)`。它上穿 0.18、距离上次冲量至少 600 ms 且非长间隔恢复时，才给一次小弹簧冲量；持续大声不会每 600 ms 自动重复触发。

## 2. 全部 `audioOptions`：16 项

正式应用优先修改 `recording-visual-config.ts` 的 `RECORDING_VISUAL_CONFIG.audioStrength/audioOptions`，由现成 RecorderBlackHole 接入组件。自建包装器则直接传 `BlackHole.audioOptions?: AudioReactiveOptions`；无需改 shader 或组件源码。组件在同步 props 时调用 controller 的 `configure()`，更新配置而不清空已有包络、时钟和冲量冷却状态。它是重新按 partial 解析默认，不是保留旧字段的 patch：本次省略的项回到默认值；更换配置不会重新申请麦克风。

“有限”表示不是 NaN 或 Infinity。违反硬性规则的输入回到对应默认值；orbContraction 超过 0.3 时钳到 0.3。除表内明确上限外，当前实现没有额外硬上限；过大的合法值仍可能让画面刺眼或变化过快，建议从默认值小幅调整。

| 参数 | 默认 / 单位 | 硬性规则 | 数值增减的效果 |
| --- | --- | --- | --- |
| `attackSeconds` | 0.065 s | 有限且 >0，否则回默认 | 增大：起音更慢更柔；减小：更跟手，也更容易显出抖动 |
| `releaseSeconds` | 0.32 s | 有限且 >0 | 增大：尾部更长；减小：静音回落更快 |
| `noiseGateDb` | -55 dBFS | 有限；无硬上下限 | 提高到 -45：更能排除底噪，也会漏掉轻声；降低到 -60：更敏感 |
| `fullScaleDb` | -12 dBFS | 有限；无硬上下限 | 降到 -18：较轻的声音也可达到满响应；提高到 -6：同样声音反应更弱 |
| `responseExponent` | 1.35，无量纲 | 有限且 >0 | 增大：中弱音更弱、强弱反差更大；减小：轻声更明显 |
| `staleAfterMs` | 180 ms | 有限且 >0 | 指标超过此年龄才开始降低新鲜度；增大容忍更慢的桥接，也更容易保留旧声音 |
| `staleFadeMs` | 180 ms | 有限且 >0 | 新鲜度线性淡到零的时长；增大丢帧后的回落更缓 |
| `futureToleranceMs` | 40 ms | 有限且 >0 | 容忍同一时钟域的小幅未来时间戳；增大只改变时钟容忍，不提高灵敏度 |
| `maxDeltaSeconds` | 独立 controller 0.1 s；BlackHole 内置 0.25 s | 有限且 >0 | 限制一次平滑积分的 dt；不是 FPS 上限。通常保持宿主默认，勿用于改变手感 |
| `glowAmount` | 0.045，glow 增量 | 有限且 ≥0；负数/无效值回默认 | 增大：声起时粒子光晕更明显；0 关闭该增量 |
| `bloomAmount` | 0.8，bloom 增量 | 有限且 ≥0 | 增大：声音带来的泛光更强；0 关闭；最终 bloom 参数限制到 0–4 |
| `ringAmount` | 0.8，ringIntensity 增量 | 有限且 ≥0 | 增大：边缘圆环更随声音变亮；最终 ringIntensity 限制到 0–4 |
| `orbContraction` | 0.1，半径收缩比例 | 有限且 ≥0，最大钳到 0.3 | 增大：声音带来的收缩更明显；0 关闭。另受 level、bassWeight、audioStrength 影响 |
| `speedAmount` | 0.25，速度倍率增量 | 有限且 ≥0 | 增大：声音时流动加速更多；0 保持基础流速。固定 shader 时间测试中看不到该流速变化 |
| `impulseAmount` | 0.12，弹簧输入强度 | 有限且 ≥0 | 增大：起音时“吞噬/回弹”更明显；0 关闭声音冲量。0.12 是强度，不是 120 ms |
| `impulseCooldownMs` | 600 ms | 有限且 >0 | 增大：连续起音更难重复弹动；减小：更密集。设 0 会回默认，禁用请设 impulseAmount=0 |

建议保持 `noiseGateDb < fullScaleDb ≤ 0`，两者至少相差 1 dB。代码为分母设了最小值 1，防止除零，但不会自动替你纠正颠倒的门限。

最终增量近似为 `glow += level×glowAmount×audioStrength`，bloom、ring 同理；半径倍率为 `1-level×orbContraction×bassWeight×audioStrength`；时间推进倍率为 `1+level×speedAmount×audioStrength`。基础预设与 props 先决定无声音外观，声音只叠加这些增量。`audioStrength` 为 0–2，0 关闭响应；`paused` 或 reduced-motion 也会抑制响应。

## 3. 可复制的目标配置

以下 import 以接入文件放在 `src/`、模块迁至 `src/features/black-hole/` 为例，目录见 [MIGRATION.md](./MIGRATION.md)。配置可直接展开给 BlackHole；它们是可继续试调的起点，不替代已认可的 Classic 默认基线。

```ts
import type { BlackHoleProps } from './features/black-hole/components/BlackHole';

type AudioProps = Pick<BlackHoleProps, 'audioStrength' | 'audioOptions'>;

// 保留光流，减少跳动，适合长时录音。
export const calmRecording = {
  audioStrength: 0.55,
  audioOptions: { impulseAmount: 0, speedAmount: 0.1, orbContraction: 0.06, releaseSeconds: 0.45 },
} satisfies AudioProps;

// 轻声仍可感知；底噪也会更明显，须用真实麦克风确认。
export const quietSpeech = {
  audioStrength: 1.6,
  audioOptions: { noiseGateDb: -58, fullScaleDb: -18, responseExponent: 1.1, attackSeconds: 0.05 },
} satisfies AudioProps;

// 减轻泛白，突出边缘和轻微收缩。
export const clearerRing = {
  audioStrength: 1,
  audioOptions: { glowAmount: 0.03, bloomAmount: 0.3, ringAmount: 1, orbContraction: 0.12 },
} satisfies AudioProps;
```

应用形式：`<BlackHole {...getBlackHolePreset('classic')} {...quietSpeech} audioSource={features} />`。`getBlackHolePreset` 从迁移目录的 `presets.ts` 导入。基础 bloom 已很高时，即使调小 `bloomAmount`，无声时仍会明亮；这时按组件 API 调基础 `bloom`。

推荐顺序：先看真实 RMS/静音噪声 → 固定 Classic、选 strength 档位 → 调 gate/fullScale/exponent → 调 attack/release → 分别调 glow/bloom/ring/收缩 → 最后调 speed 和 impulse。一次只改一组，用同一段声音比较。轻声不足不要先同时放大所有 amount；背景嘶声让画面持续动时先提高门限。

## 4. 指标时钟、丢帧与资源

原生录音桥用同一采集流计算指标，约 20–30 Hz 推入 `createAudioFeatureStore()`；不要再启动浏览器麦克风。`push({ rms, peak, low, mid, high })` 省略 timestampMs，默认记录页面的接收时刻 `performance.now()`。显式时间戳必须属于同一时钟域：store 拒绝倒退、负数、非有限值，以及比接收时刻超前超过默认 100 ms 的帧，失败返回 false；controller 还有独立的默认 40 ms 未来容忍。不要直接传 Date.now 或 Android/另一进程的单调时钟。

输入停止但保留最后帧时，默认 180 ms 后新鲜度开始下降，360 ms 时目标归零，随后仍有 release 尾部；这不表示画面在 360 ms 时已经完全静止。`clear()` 立即清空输入、让目标归零，再经过 release 回到基线。更换会话要 clear，避免上一段声音残留。

要让尾部自然回落，应保持同一个 audioSource 引用并发送 RMS=0 或调用 store.clear。将 audioSource 改成 null/另一个对象会重置控制器，audioStrength=0 会立即关闭声音增量；它们与“保留声音源、让 release 衰减”不同。RecordingBlackHole 切出 recording 时会移除源，因此不会自动保留跨状态声音尾音。

BlackHole 不拥有声音源。`WebAudioAnalyserSource` 借用 node/stream/context，停止与销毁只移除自己的分析支路；`createMicrophoneAudioSource` 才释放自己申请的流和自建 context。`active={false}` 或卸载视觉不应停止宿主录音。所有权和原生后台录音边界见 [INTEGRATION.md](./INTEGRATION.md) 与 [PLATFORMS.md](./PLATFORMS.md)。

本文配置片段与迁移目录下的实际模块一起通过 TypeScript 检查；它们是可编译的公开 API 用法，不表示每种调参方案都已完成声音手感或真机验证。
