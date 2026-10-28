# Black Hole

> 声渊设计稿还原分支：新增 `/luminous.html` 交互预览与 `/comparison.html` 并排对照。实现方式、限制及验证见 [LUMINOUS-DESIGN.md](LUMINOUS-DESIGN.md)。原版入口和声音 API 保持独立。

本轮增加声音反馈 Demo：运行 `npm run dev` 打开本地地址，先点击 **运行声音测试**，再比较 **轻柔 / 平衡 / 明显** 三档。测试信号为 8 秒循环、不会外放；也可由你点击 **启用麦克风** 授权实时预览。仅本地分析，不保存或上传声音。录音文件、真实转写和总结服务尚未接入，页面相关状态明确标为演示。

完整交接入口见 [组件文档索引](docs/README.md)。逐项参数见 [组件 API](docs/COMPONENT_API.md)，声音细调见 [声音调参](docs/AUDIO_TUNING.md)，录音 Classic／转写换样式见 [预设与状态](docs/PRESETS_AND_STATES.md)，迁移步骤见 [MIGRATION](docs/MIGRATION.md)。平台说明见 [PLATFORMS](docs/PLATFORMS.md)。

自动测试：`npm test`。文档完整性与代码示例检查：`npm run check:docs`。当前 Classic 预设已确认，作为后续迁移基线；默认声音总强度保持 1。

以 React Bits Pro 的 [Black Hole 预览](https://pro.reactbits.dev/docs/components/black-hole) 为依据整理的独立 React / TypeScript 组件。目标是复现渲染、动画和交互；不还原原作者的注释、变量名与项目结构。

## 打开演示

构建后的 `dist/black-hole.html` 是单文件离线演示，双击即可用浏览器打开，不需要开发服务器或网络连接。包括八种原演示预设、全部核心参数、明暗背景、暂停、重播、吞噬、代码复制及固定时间预览。某些浏览器会限制 file:// 页面的剪贴板权限；遇到提示可在代码页手动选择，或用下面的本地服务。

环境：Node.js 24（见 `.nvmrc`）和 npm。测试直接执行 TypeScript 文件，建议沿用此版本。克隆仓库并进入项目后启动开发模式：

```powershell
npm ci
npm run dev
```

打开终端显示的本地地址，通常为 `http://127.0.0.1:5173/`。

```powershell
npm run typecheck
npm run build
npm run preview
```

`build` 同时输出正常静态站点和 `dist/black-hole.html`。本项目无需后端。运行页面不请求官方组件脚本，也不依赖远程图片、字体或服务。

## 集成到 React 项目

按 [迁移清单](docs/MIGRATION.md) 保留目录复制组件、**整个 `src/audio/`**、共享预设与配置。只复制两个渲染文件已经不足以运行当前版本。推荐直接使用 `src/examples/RecorderBlackHole.tsx`，在 `src/recording-visual-config.ts` 中调整声音和各状态样式。安装与参考实现相同版本的 Three：

```powershell
npm install three@0.181.0
npm install -D @types/three@0.181.0
```

```tsx
import { useRef } from 'react';
import { BlackHole, type BlackHoleHandle } from './src';

export default function Example() {
  const blackHole = useRef<BlackHoleHandle>(null);
  return (
    <div style={{ height: 600, position: 'relative' }}>
      <BlackHole ref={blackHole} backgroundColor="#0A0A0A">
        <button onClick={() => blackHole.current?.gulp()}>触发吞噬</button>
      </BlackHole>
    </div>
  );
}
```

在 Next.js 中，将使用组件的入口设为客户端组件。容器需有明确高度。`children` 显示在效果上方，交互子元素不会触发背景点击吞噬。组件卸载时释放 GPU 资源，并处理 resize、标签隐藏、屏幕外暂停、WebGL 上下文丢失与系统减少动态效果偏好。

`ref.gulp(strength?)` 触发弹簧收缩，`ref.replay()` 重播入场。`onError(message)` 接收 WebGL 初始化失败。正常使用不传 `deterministicTime`。

## 参数默认值

| 参数 | 默认 |
| --- | --- |
| width / height | 100% / 100% |
| speed / zoom | 1 / 1.8 |
| particleCount / orbSize | 13 / 0.75 |
| glow / contrast | 0.08 / 3 |
| mirrorSplits / warpEnabled | 2 / true |
| distanceFade | 0.35 |
| colorShiftR / G / B | -6 / -6 / -6 |
| colorSpeed | 0.2 |
| colors | undefined，使用颜色循环 |
| backgroundColor | #000000；演示页使用官方深色主题 #0A0A0A |
| opacity / bloom / ringIntensity | 1 / 1 / 1 |
| cursorInteraction / cursorIntensity | true / 1 |
| intro / paused | true / false |
| dpr | 2，上限受实际设备像素比约束 |

## 复现与验证依据

- 核心参考是官方预览正常下发的 JavaScript；五段 GLSL、分级 bloom、OKLab 颜色处理、光子环、浅底墨迹模式和动画常数按实际实现整理。
- REA 6.8.0 实际完成公开脚本的静态分析，识别模块和依赖，并生成本地 Evidence。没有运行 setup，也没有修改全局 Codex MCP 配置。
- 非 Pro [DavidHDev/react-bits](https://github.com/DavidHDev/react-bits) 的 Galaxy、Orb、Particles 用于核对 WebGL 生命周期模式。其免费库没有相同 Black Hole，渲染公式没有用相近组件替代。
- 源码对应的组件仍有其上游来源与许可。本项目没有为上游代码另行声明开源许可。

详细研究、浏览器 QA 页面与独立原版基准保存在开发时的本地 `work/`，未提交到 GitHub，也不进入生产构建。`scripts/verify-shaders.mjs`、`scripts/compare-captures.py` 需要这些额外材料；`VERIFICATION.md` 中的浏览器 QA 地址与结果路径是历史验证记录，不能直接在新克隆的仓库中复跑。组件、声音 Demo、`npm test`、`npm run check:docs` 与构建不依赖这些历史材料；测试和文档检查所需的 `work/` 内容会自动生成。历史固定帧测试直接比较 GPU 的 RGBA 缓冲，同时检查每个 pass 的 uniforms；有损截图不作为像素相等的依据。

测试只覆盖记录中的浏览器、GPU 和用例，不能由此保证所有显卡、浏览器或未测试输入都逐像素相同。具体通过结果见 `VERIFICATION.md`。
