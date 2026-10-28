# V2.1 增量调整验证 · 2026-10-28

## 保存与删除

原 V3 最终亮丝版已改称 V2，保存分支 `codex/shengyuan-luminous-v2`、标签 `shengyuan-luminous-v2`、提交 `ce73910`。旧短周期 V2 的运行源码、选项、专用证据和独立分支已删除。V1 仍保留。

同一浏览器/GPU、固定时间 12 秒的 V2 截图，在版本改号及加入本轮增量后均逐像素一致，见 `v2-preservation.json` 与 `../luminous-v2/preservation.json`。覆盖的是指定视口/时间，不声称跨 GPU 等价。

## 当前通过

- TypeScript 与 `build:luminous` 通过，见 `build.txt`。Three 的现有大包体提示仍在。
- 20 项上游音频/预设测试通过，见 `upstream-tests.txt`；不是 Android 录音测试。
- 17 项生命周期检查通过，覆盖单 canvas、动态变化、四场景切换、冻结、减少动态效果、手机/桌面布局与错误检查，见 `lifecycle.json`。
- 7 项示例交互通过，覆盖轻点暂停/继续、长按返回、示例进度与备注、冻结中切换、真实 WebGL context 丢失/恢复，见 `interactions.json`。
- 10 项 V1/V2/V2.1 选中、实际绘制与同 canvas 切换检查通过，见 `switch.json`。
- 1 项定向恢复检查通过：丢失/恢复后切换保存版、增量版与场景，再销毁渲染器，未产生 GL 警告或错误，见 `context.json`。包括增量版新增的供光 mipmap 目标。

这些是明确标注的网页示例 UI，不能当成真实录音/存储/回放验证。原生文件、录音数据和 APK 未改动。

## 实际动态

原生 786×1704、DPR 2 的 canvas.captureStream 实录超过一分钟。明确使用 H.264，避免系统预览无法解码默认 VP9/MP4 的问题；未生成补帧、未放大画面、未拼接循环。

本地媒体在 `output/playwright/`：

- `luminous-v2-refined-dpr2.mp4`：原画布录屏。
- `luminous-v2-refined-detail.mp4`：完整动画裁去空白的 786×900 展示版。
- `luminous-v2-refined-preview.mp4`：原录屏第 4–18 秒的 14 秒片段。

`capture.json` 保存实际编码、尺寸、时间和粗粒度帧计数，`media.json` 保存媒体哈希与源视频观察。帧计数按每 60 帧更新，不用于解释每秒采样间的瞬时卡顿；文件 nominalFrameRate 和导出 60fps 均不是手机呈现 FPS。

按精确时间容差抽取 0.1–63.1 秒 64 帧，检查光流区域及低频光场均持续变化，并检查边缘光照随时间变化，见 `motion.json`。这只排除整体趋于静止，不代替光带流向、烟雾物理、美学或性能验收。

## 边界

- 用户否定的体积灰雾与程序化纤维重建已撤出。当前继续使用 V2 的原图细丝；效果来自原材质的输运、局部形变、薄雾卷散与受光，不是完整流体模拟。
- 美学仍以用户观看实际动态后的判断为准。
- 小米 14 对新增 mipmap 工作的帧率、温升和功耗未测。
- 本轮未重新验证实际后台停绘；已有 visibility 处理未改。先前多标签测试环境不能建立 document.hidden，未把它记作通过。
