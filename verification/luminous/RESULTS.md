# 辉光黑洞视觉预览验证

日期：2026-10-28。范围：本地 Chrome / WebGL，独立分支 `codex/shengyuan-blackhole-design`。不是小米 14 的新版本实测。

## 通过的检查

- `npm run typecheck`、`npm run build:luminous`：通过。构建仍有 Three.js 引起的大 bundle 提示，无编译错误。
- 原版 `npm test`：20/20；原版 `npm run build` 和 `npm run check:docs`（13 段文档代码）通过。原版组件/声音逻辑未修改。
- [browser-lifecycle.js](browser-lifecycle.js)：17 项通过。覆盖可见动画、四种状态复用同一 canvas、冻结、减少动态效果、手机/桌面布局和 JS / shader 错误检查。结果：[luminous-checks-final.json](luminous-checks-final.json)。
- [browser-interactions.js](browser-interactions.js)：7 项通过。轻点暂停/继续、长按返回首页、示例进度、示例备注、冻结时切换状态、WebGL 丢失后恢复。结果：[luminous-interaction-checks-final.json](luminous-interaction-checks-final.json)。
- 实际渲染帧检查：4.49/4.51 秒、8.99/9.01 秒跨过两段输运的重置边界，光流区域平均 RGB 变化低于 1/255，无整帧亮度跳变。结果：[cycle-continuity.json](cycle-continuity.json)。
- 截断修复：移除基于非整数角度的亮度公式，最终流场不使用 `atan`；照片坐标保持固定，消除了整体摇摆。手机回放和桌面都使用横纵一致的缩放系数。

## 运行录屏

本机浏览器以 DPR 2 捕获 WebGL canvas，原始画面为 786×1704。展示短片仅裁去上下空白，尺寸 786×900，保留原始像素，没有放大，也没有做插值补帧。录屏保存于本地 `output/playwright/luminous-inflow-detail.mp4`；不随代码提交大视频。

录屏是浏览器实际运行结果。60 Hz 是绘制上限；录制与编码会掉帧，不能把视频文件的输出帧率或这次桌面结果当作小米 14 性能保证。

## 可复现方式

启动 Vite：`npm run dev -- --port 5177`。用 Playwright CLI 打开 `/luminous.html` 的普通动态页面，再通过 `run-code` 执行上述两份函数。`time=0` 是材质基准静帧；其他 `time=` 值可用于同一时间点截图。

## 范围与剩余验证

当前是“设计稿材质 + 程序流场”的固定视角预览。材质中的原始细丝与辉光保留，程序场输运密度，增加向内旋流与速度差；不是自由视角三维模拟。用户仍需依据动态表现判断电影质感。

示例界面没有连接录音、音频播放、文件数据或声音反馈。本次未修改 Android 项目、预览 APK 或现有录音。接入 Android 后仍需要小米 14 长时间流畅度、温升和耗电验证。
