# V3 视觉探索验证 · 2026-10-28

## 范围

仅网页视觉预览。用户指出首个 V3 几乎不动，该图像反馈方案已撤掉；当前为图像引导的移动亮丝、烟尾、局部材质形变与同源黑核边缘光影。不是录音、声音反馈或 Android 真机验收。

## 通过

- `npm run build:luminous`：TypeScript 与构建通过，原有大包体提示仍在，见 `build.txt`。
- `npm test`：20 项上游音频/预设测试通过，见 `upstream-tests.txt`；不代替 native 录音测试。
- 17 项渲染生命周期检查：单 canvas、持续动画、四场景切换、冻结、减少动态效果、手机/桌面布局与浏览器错误检查，见 `lifecycle.json`。
- 7 项示例交互：轻点暂停/继续、长按返回、示例进度与备注、冻结中切换场景、实际 WEBGL_lose_context 恢复，见 `interactions.json`。
- 10 项 V1/V2/V3 切换检查：选中态、原 canvas 复用、实际版本绘制及无 shader 错误，见 `switch.json`。
- 1 项定向 GPU 检查：context 丢失/恢复后切换模式、场景并销毁渲染器，无 GL 警告或错误，见 `context.json`。本轮修正了恢复后释放旧上下文目标的两条警告。

## 动态证据

实际 canvas.captureStream 录制超过一分钟，源画布 786×1704，裁去空白的展示版为 786×900。短预览是原视频第 4–18 秒的片段，没有增加图像分辨率、生成补帧或循环拼接。

本地媒体均在 `output/playwright/`：

- `luminous-continuous-v3-dpr2.mp4`：完整原始画布录屏。
- `luminous-continuous-v3-detail.mp4`：完整动态的裁切展示版。
- `luminous-continuous-v3-preview.mp4`：14 秒展示片段。

`media.json` 保存大小、SHA256 与 AVFoundation 的源视频观察。源编码帧率只是录制文件的元数据，不是手机呈现 FPS；导出设定的 60fps 也不是性能通过的证据。

以精确时间容差提取 0.1–63.1 秒共 64 帧，在不含 UI 的光流区域检查。每个相邻采样秒均有可见像素变化，64 帧均不相同，见 `motion-samples.json`。该检查用于排除趋于静止，不能证明电影质感、所有时刻不重复或运动方向。V1/V2 的原 shader 没有改动。

## 尚未通过的验收

- 宏观构图仍依赖原设计图；整体烟雾形态的演化未达到参考网页全部表现。
- 最终美学以用户观看动态后的判断为准，不能由像素差代替。
- 小米 14 上本版额外发光 pass 的帧率、温升和功耗未测。
- 背景测试未能建立真实隐藏状态，因此不计作通过；故障和修复过程见 `investigation-notes.md`。
- 未更新 APK、未接声音反馈、未改录音文件或数据操作。

检查脚本位于本目录的 `*-check.js`；在端口 5177 的本地 Vite 预览启动后，可以通过 Playwright CLI 的 run-code 执行。脚本中的交互均是本地示例页。
