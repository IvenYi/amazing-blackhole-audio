# 验证记录

## 组件交接文档与配置接口

2026-10-27：用户接受当前 Classic 基线，要求可直接移入录音 App 的文档。新增公开 `audioOptions`、不清空包络的 controller.configure、共享 `getBlackHolePreset()`、统一导出与 `RecorderBlackHole` 示例。`recording-visual-config.ts` 集中各状态预设和声音参数，默认仍全 Classic、audioStrength=1，声音映射公式与 GLSL 未改。

- `npm run check:docs` 通过：13 个完整 TS/TSX 示例经实际类型检查；同时复制真实源码至迁移目录验证 import。35 个基础 props、2 个状态包装参数、5 个示例参数、16 项声音选项及两类音源的各9个构造参数均在对应文档中覆盖，无损坏的相对文档链接。
- `npm test` 20 项通过：增加运行中调参的连续性/冷却保持/零覆盖，预设切回 Classic 的染色与扭曲重置、颜色数组隔离、宿主状态不被预设覆盖，以及应用配置与原平衡反馈的一致性。
- `npm run build` 通过，包含项目类型检查和离线演示生成。Vite 仍提示 Three 主包超过500kB，不影响构建；当前 gzip 约212kB。
- 本轮没有更改用户接受的默认视觉或声音增量；新增配置通过 props 更新，保留 WebGL 实例和既有声音包络。当前文档不把预设切换描述为内置渐变，也不把 complete 状态描述为已实现自动脉冲。

平台原生录音、AI 服务、签名和真机验证范围仍以平台文档为准。

## 声音反馈 Demo 追加验证

2026-10-27：新增 `src/audio/`、`RecordingBlackHole` 与声音反馈面板；GLSL 五段源码未改。此版优先供用户确认动效手感，声音映射参数尚未定稿。

- `npm test` 12 项通过：已知 PCM/FFT、噪声门、静音严格 identity、不同帧率包络、过期与未来帧、后台恢复、600ms 重音冷却、缓冲复用、借用资源不释放、麦克风授权并发/迟到/重试。
- 浏览器实际生成 20 / 160 / 3200Hz 正弦波、gain=0.4，共采集 36 帧。RMS 约 0.282、peak 约 0.4，频段判定全部通过。未请求真实麦克风，未连接扬声器。结果见 `work/audio-qa/analyser-runtime.json`。
- GPU：零输入与无音频基准逐像素相同；强输入使 64,000 像素中的 57,066 像素变化；strength=0 完全回到原版；停止输入并衰减后也完全回到原版。四项均通过，见 `work/audio-qa/gpu-audio-results.json`。
- 与独立原始压缩实现再次比较：208,800 像素零差异，实际 uniforms 零差异；原 18 个动画/交互检查点再次全部通过。结果见 `work/audio-qa/original-preservation.json` 和 `motion-preservation.json`。
- 真实 Demo 的生成信号已进入音量表并驱动画面；三档强度可选择，麦克风只在用户点击后请求。390px 宽度下滚动宽度仍为 390px，无横向溢出。
- `npm run build` 与严格 UI 审查通过。运行时生成信号的测试与麦克风资源竞态 mock 不等同于真实硬件录音测试；本次未录制用户麦克风，也未实现持久录音文件、AI 服务或原生安装包。

新增 `active` 只停止视觉绘制，页面隐藏/离屏也停止 GPU 调度；不会停止借用的录音源。显式低帧率按真实帧间隔推进。测试信号可用 AbortSignal 立即取消，避免等待 AudioContext.resume 时留下资源。

以下为最初复刻阶段的基准记录。

验证日期：2026-10-27。环境：本机 Windows / Chrome / WebGL 2，React 19.3.1，Three 0.181.0。参考来源为官方页面正常下发的预览脚本，具体 URL 与来源哈希见 `work/component-analysis.md`、`work/visual-qa/shader-verification.json`。

## 渲染一致性

**17 / 17 组固定帧测试通过。** 两个独立渲染器在相同时间、相同尺寸、相同参数与同一 GPU 上直接读取 RGBA 缓冲，所有用例的差异像素数、最大通道误差和平均通道误差均为 0；各 pass 的实际 uniforms 与 viewport 也完全一致。每个用例均检查了画面非空，避免把两个空画布当成通过。

覆盖 Classic、Halo、Kaleido、Orbit、Aurora、Violet、Ember、Frost，深色、浅色和透明背景，多个 shader 时刻、320×640 竖屏，以及 1 / 1.25 / 1.5 / 2 像素比。包含奇数 CSS 尺寸 571×333，以检查绘图缓冲与 bloom 分辨率取整。

完整结果：`work/visual-qa/gpu-comparison.json`。

## 动画与交互

**18 / 18 个动态检查点通过，像素和实际渲染输入均零差异。** 独立基准保留原始核心代码原文、零替换。测试页仅为双方接管 requestAnimationFrame，以相同时间戳推进 761 帧，并保留 GPU 缓冲供读取。

覆盖入场开始、0.5 秒、1.5 秒、2.6 秒完成、持续动画、悬停 0.6 / 1.2 秒、移出、鼠标点击吞噬收缩／回弹／稳定、ref.gulp、ref.replay 开始／中间／结束、暂停、暂停一秒后和恢复播放。入场最初的空帧是预期；其他检查点均检查非空。

完整结果：`work/motion-qa/runtime-results.json`。独立基准哈希：`work/motion-qa/baseline-verification.json`。

## 工程与演示

- `npm run build` 通过，包含 TypeScript 检查、Vite 生产构建和单文件离线打包。
- 五段 GLSL 的源码长度及 SHA-256 全部一致；`node scripts/verify-shaders.mjs` 通过。
- 严格 UI 静态审查无错误或警告，结果在 `work/ui-audit.json`。
- `DESIGN.md` lint 无错误；部分 token 的跨 CSS 引用仅写在映射说明中，会产生未被组件字段引用的提示。
- 实际浏览器检查了暂停、预设切换、浅色墨迹显示、代码页、复制反馈和标签页键盘切换。
- 390px 窄屏实测：页面宽度与滚动宽度均为 390px，画布与参数面板均为 354px，没有横向溢出。
- 打包后的 `dist/black-hole.html` 包含全部脚本与样式，无外部资源引用。自动浏览器的 URL 安全策略禁止打开 file://，因此未由自动化完成双击文件的浏览器验证；演示页面本身已经在本地 HTTP 下验证，离线文件另做脚本语法与资源完整性检查。
- Vite 提示主包超过 500kB；其中包括 Three WebGL 渲染器，gzip 约 205kB。为保留可离线双击的单文件版本，当前不拆分运行时依赖。

## 对照工具

运行 `npm run dev` 后访问：

- `/work/visual-qa/index.html`：固定帧 GPU 缓冲对照。
- `/work/motion-qa/index.html`：点击按钮运行完整动画与交互对照。

测试专用的保留绘图缓冲、手动时间队列和诊断方法只作用于上述测试页面，不进入生产组件。

普通浏览器截图 API 实际返回 JPEG。有损压缩会在不同块位置产生小幅伪差，因此未用截图来证明逐像素一致；最终结论来自 WebGL 原始 RGBA 缓冲。

## 结论范围

已测试的 17 组固定帧与 18 个动态检查点均达到同一浏览器、GPU 和参数下的逐像素一致。此结论不声称覆盖所有显卡、浏览器或所有可能输入。组件自身保留原始动画、渲染流程和参数边界，并增加可选诊断时间与初始化错误回调。
