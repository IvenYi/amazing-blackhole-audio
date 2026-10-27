# Black Hole 组件交接文档

当前迁移基线：**Classic 外观，声音总强度 1（平衡）**。录音、转写和总结页面可以共用同一个组件实例；先接真实状态与声音数据，再按产品需要调整。当前工程提供实时可视化和声音分析，不包含音频文件录制、AI 服务或原生安装包。

## 从哪里开始

| 要做的事 | 阅读入口 | 代码入口 |
| --- | --- | --- |
| 将组件放入已有录音 App | [迁移步骤](MIGRATION.md) | `src/index.ts`、`src/examples/RecorderBlackHole.tsx` |
| 查每个外观和行为参数 | [组件 API](COMPONENT_API.md) | `src/components/BlackHole.tsx` |
| 调整声音敏感度、收缩、回弹和回落 | [声音调参](AUDIO_TUNING.md) | `src/recording-visual-config.ts` |
| 录音用 Classic，转写改用其他风格 | [预设与状态](PRESETS_AND_STATES.md) | `src/presets.ts`、`src/recording-visual-config.ts` |
| 接现有录音引擎的 RMS/频段 | [声音接入](INTEGRATION.md) | `src/audio/features.ts` |
| Android / macOS / Windows 的宿主方案 | [平台接入](PLATFORMS.md) | 由目标 App 实现原生录音与桥接 |

## 推荐的接法

优先使用 `RecorderBlackHole` 示例封装。它已经把共享预设、声音配置和状态封装接到一起。App 负责提供真实 `state` 与 `audioSource`，不用搬运 Demo 的参数面板或模拟音源。

```tsx
import { RecorderBlackHole, type AudioFeatureSource, type RecordingVisualState } from './src';

export function RecorderScreen({ state, source, visible }: {
  state: RecordingVisualState;
  source: AudioFeatureSource;
  visible: boolean;
}) {
  return <RecorderBlackHole state={state} audioSource={source}
    visible={visible} quality="desktop" height={480} />;
}
```

Android 先用 `quality="mobile"` 测试，桌面可用 `quality="desktop"`。这是视觉画质设置，不承担后台录音职责。

## 调整时只改哪几个地方

1. 改外观预设：`RECORDING_VISUAL_CONFIG.presetByState`。
2. 改整体声音反馈：`RECORDING_VISUAL_CONFIG.audioStrength`。
3. 改声音细节：`RECORDING_VISUAL_CONFIG.audioOptions`。
4. 只微调某一状态的外观：`RECORDING_VISUAL_CONFIG.visualOverridesByState`。

不要通过修改 GLSL 来完成上述调整。当前默认值维持已确认的外观与声音映射；应用层配置是后续产品调整入口。配置热更新与 React prop 更新都不需要重建 WebGL 画布。

## 交付范围与验证

本目录的 TSX 示例会被 `npm run check:docs` 提取并做类型检查；`src/examples/RecorderBlackHole.tsx` 进入正常项目类型检查。`npm test` 检查声音分析、状态连续性及预设返回值；`npm run build` 生成演示。测试记录见根目录 [VERIFICATION.md](../VERIFICATION.md)。

三端的麦克风权限、持久文件、后台录音和 AI 接口要在录音 App 中实现。视觉组件不持有这些任务，也不会因为画布不可见而停止宿主录音。
