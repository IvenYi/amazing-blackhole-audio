# 迁移到你的录音应用

当前 Classic 声音 Demo 可作为已认可基线。本指南迁移共享视觉和音频分析入口；它没有实现你的原生录音器、录音文件、AI 服务或三平台安装包。Android/macOS/Windows 的宿主方案与权限见 [PLATFORMS.md](./PLATFORMS.md)。

## 1. 按固定结构复制

建议目标目录如下，保留层级即可沿用模块内部的相对 import：

```text
src/features/black-hole/
  components/
    BlackHole.tsx             ← src/components/BlackHole.tsx
    black-hole-shaders.ts     ← src/components/black-hole-shaders.ts
    RecordingBlackHole.tsx    ← 可选的状态包装器
  audio/                     ← 整个 src/audio/，保留所有 .ts 文件与 index.ts
  presets.ts                 ← src/presets.ts，共享预设 API
  recording-visual-config.ts  ← 应用级的唯一调参/状态外观配置入口
  examples/
    RecorderBlackHole.tsx     ← src/examples/RecorderBlackHole.tsx，可接真实宿主状态
  index.ts                   ← src/index.ts，统一公开导出
```

推荐把上面的整套文件一起复制，保留统一导出。若只直接使用 BlackHole，可以省略 RecordingBlackHole、应用配置、examples 和顶层 index.ts，改用文件路径导入；但 BlackHole 本身引用 audio barrel，即使暂时不接声音也要复制整个 `audio/`。使用顶层 index.ts 或 RecorderBlackHole 时，不能遗漏它们引用的状态包装器及配置文件。

预设从 `presets.ts` 的真实函数取得，不存在 `<BlackHole preset="classic" />` 这一参数。`getBlackHolePreset()` 返回完整视觉 props，切回 Classic 会清除之前的自定义染色；它不控制录音状态、音频源和画质。渲染器使用组件内定位样式，Demo 页面的样式文件不是组件依赖。

依赖需要 `react`、`react-dom`、`three`；本仓库验证版本为 React/React DOM 19.3.1、Three 0.181.0。迁移时保持 Three 与其类型版本一致，已有 React 项目使用一份相容的 React/React DOM，完成目标项目编译验证。TypeScript 项目还需 React 对应类型及 `@types/three@0.181.0`。

```sh
npm install three@0.181.0
npm install -D @types/three@0.181.0
```

以上命令假定目标项目已有 React、React DOM、TypeScript 与对应 React 类型。新建项目可参考本仓库 package.json 的完整版本；无需安装 OGL、Tailwind 或另外一个音频可视化库来运行这些组件。

## 2. 先挂静态 Classic，再接指标

以下可作为 `src/RecordingVisual.tsx` 的内容。Next.js App Router 保留第一行 `'use client'`，在客户端组件边界内调用这些依赖浏览器的模块；普通 Vite 项目也可保留该指令。不要在服务端或模块加载时创建 AudioContext/申请麦克风。

```tsx
'use client';

import BlackHole from './features/black-hole/components/BlackHole';
import { getBlackHolePreset } from './features/black-hole/presets';
import type { AudioFeatureSource } from './features/black-hole/audio';

export function RecordingVisual({ source, visible = true }: {
  source?: AudioFeatureSource;
  visible?: boolean;
}) {
  return <div style={{ height: 360 }}>
    <BlackHole {...getBlackHolePreset('classic')}
      width="100%" height="100%" audioSource={source}
      audioStrength={1} active={visible} />
  </div>;
}
```

先不传 source 检查外观，再接入源；父容器必须有可计算高度，`height="100%"` 不会为无高度的祖先创建高度。组件应在挂载时即可取得非零尺寸；折叠布局展开后会通过 ResizeObserver 更新。

`audioOptions` 可直接传入上面的 BlackHole，例子见 [AUDIO_TUNING.md](./AUDIO_TUNING.md)。组件 API、预设实际参数与录音 Classic → 转写其他预设的完整代码分别见 [COMPONENT_API.md](./COMPONENT_API.md)、[PRESETS_AND_STATES.md](./PRESETS_AND_STATES.md)。

正式录音页优先从 `./features/black-hole` 导入已复制的 `RecorderBlackHole`，传 `state`、`audioSource`、`visible`、`quality` 和 `height`；`ref` 暴露 gulp/replay。它已把共享预设、RecordingBlackHole 与应用配置连好，不会自行开始录音。后续统一修改 `recording-visual-config.ts`：`presetByState` 选各状态外观，`visualOverridesByState` 做单状态微调，`audioStrength/audioOptions` 控制声音。当前所有状态默认 Classic、strength=1，并显式列出 16 项声音基线；把 `presetByState.transcribing` 改为真实预设名即可改变转写外观，具体示例见上述状态文档。

## 3. 接已有录音引擎：只交付指标

在负责当前录音会话的模块创建一份 store；页面或黑洞重绘时不要重建它。以下作为 `src/recordingFeatures.ts`：

```ts
import { createAudioFeatureStore } from './features/black-hole/audio';

export const recordingFeatures = createAudioFeatureStore();
export type RecorderMetrics = {
  rms: number; peak?: number; low?: number; mid?: number; high?: number;
};

// 原生桥完成来源、会话和类型校验后，以约 20–30 Hz 调用。
export function receiveRecorderMetrics(metrics: RecorderMetrics) {
  return recordingFeatures.push({
    rms: metrics.rms, peak: metrics.peak,
    low: metrics.low, mid: metrics.mid, high: metrics.high,
  });
}

export function clearRecorderMetrics() {
  recordingFeatures.clear();
}
```

把 `recordingFeatures` 作为上一例的 source。RMS/peak/bands 都是 0–1 幅度；无频谱时只给 RMS/peak 也可。这里故意不传 timestampMs，统一使用接收时钟；桥不能直接传 Unix 时间。指标可以取最新帧，录音开始/停止/文件已完成这些权威事件需要可靠交付。先处理引擎确认，再切 UI 状态，不由视觉反推“录音成功”。

已有 WebAudio 流时，用 `new WebAudioAnalyserSource({ context, stream })` 或 `{ context, node }`，恰选一个；分析既有流，不再调用 `createMicrophoneAudioSource()` 双开麦克风。只有需要本页面自行采集时，才由用户点击触发该工厂的 `start()`。完整权限与资源 API 见 [INTEGRATION.md](./INTEGRATION.md)。

## 4. 生命周期与迁移验收

| 动作 | 视觉模块 | 录音引擎 |
| --- | --- | --- |
| 页面/窗口隐藏 | `active=false`，停止视觉工作 | 根据用户的录音意图继续，由原生服务/helper 持有 |
| 显示页面 | `active=true`；查询真实会话再绑定状态和源 | 发送当前会话快照与新指标 |
| 卸载 BlackHole | 自动取消 RAF、监听、订阅与 GPU 资源 | 不因此停止采集或关闭借用资源 |
| 用户停止录音 | 切换真实引擎回报的状态、clear 指标 | 停采集、完成编码/落盘、回报成功或失败 |
| 切换转写/总结预设 | 修改展开的预设 props，保留状态来源 | 独立执行实际任务；无任务就不假进入进度 |

迁移后先验证无声 Classic，再验证声音、strength=0、暂停、隐藏恢复、换预设、停止后的回落；同时检查不同尺寸/DPR、深浅/透明背景、reduced-motion、无 WebGL2 时的错误状态。手机先测 `dpr={1}` 与 `maxFps={30}`，再按实机功耗和流畅度调整。

本文的 TSX/TS 是公开 API 接入例，原生 transport 和录音文件链路需由目标应用实现；它们不能单独构建 Android/macOS/Windows App。源码迁移后的 TypeScript 检查与目标平台的权限、后台、文件持久化检查分别执行，不把浏览器 Demo 通过写成真机集成完成。

执行 `npm run check:docs` 会把真实源码复制到 `work/doc-check/migrated/features/black-hole/`，以文中的原样 import 提取迁移片段及声音配置片段，与其他文档示例一起编译。本指南所示目录及示例已通过该检查（2026-10-27）。这验证了目录结构与公开 API 的类型兼容；目标项目仍需执行自己的构建和宿主验收。
