# V2 光丝流动探索检查点

## 保存的版本

- V1：标签 `shengyuan-luminous-v1-ripple`，提交 `8a62bb29ebf9a096493f77bac31632dee0dc6434`。用户认可丝状与烟雾质感，认为动效像波纹进入暗核。该版本与原分支保持独立。
- V2：分支 `codex/shengyuan-filament-flow`。新增图像流向引导的细节输运原型，允许与 V1 切换比较。

当前目标是探索另一种运动形态，并非新一轮最终美学验收。

## 与 V1 的区别

V1 采样的设计图坐标固定，主要改变光丝上的明暗。V2 从设计图局部梯度的结构张量提取纹理方向，以向内旋流作方向约束，生成平滑速度图。GPU 沿该速度图回溯采样，移动实际的细丝与烟雾图像细节。

宏观低频辉光保留原位，移动细节和局部亮纹；暗核比例与页面构图保持稳定。处理后的材质先去掉图中界面区域再生成 mipmap，防止文字或设备框漏入。流向图使用 RG 通道存储速度，B 通道存储不规则亮纹，亮纹随相同速度场前进。

开发预览：

- `/luminous.html?scene=recording&motion=filament`：V2。
- `/luminous.html?scene=recording&motion=ripple`：保留的 V1 动效。
- `/flow-compare.html`：两侧都是实际运行的 WebGL 对照。

`npm run build:luminous` 输出仍在 `dist-luminous/`。`ripple-shader.ts` 保存 V1 shader；V1 模式使用原始材质而不是 V2 清理后的材质。

## 验证

本次运行原有 17 项渲染生命周期检查、7 项交互检查，另检查 V1/V2 切换保留同一 canvas、选中态和无 shader 错误。证据在 `verification/filament-v2/`。

V2 原生录屏为 786×1704，裁去空白的展示片为 786×900，路径 `output/playwright/luminous-filament-v2-detail.mp4`。V1 已交付短片没有覆盖。录制编码的帧率不是手机性能基准。

## 已知边界与新增要求

这是固定视角的材质输运。当前短时间的双相采样周期仍可能被看出来；原始设计图也限制了大范围烟雾形态变化。用户新增要求：黑核边缘光影与光流联动，以及更长的整体演化周期。当前原型尚未完成这两项，不能把它报告成已经达到参考网站的全部动态形态。

用户已明确提出不要局限于代码动画，应比较图生视频、离线渲染和混合方案。2026-10-28 要求优先使用 OpenAI 订阅内可用的最佳图生视频能力，减少额外试错费用。已核实 Sora 网页/App 与 API 分别于 2026-04-26、2026-09-24 停用；本轮未提交视频生成任务，也未启用其他按次付费服务。

完整视频样片要求在声渊项目根目录 `design/explorations/2026-10-28-blackhole/video-experiment/BRIEF.md`。用户随后明确授权用已登录的即梦与可灵各生成一条免费试片；Browser 插件交互报调试未连接，官方排障重试未恢复。用户随后停止排障，回到代码动画；没有继续要求重装插件。尚未提交任何视频生成；不能推定用户同意充值或新增付费。

## 代码路线继续

用户决定继续代码实现。V3 独立分支为 `codex/shengyuan-continuous-flow`，详见 [CONTINUOUS-FLOW.md](CONTINUOUS-FLOW.md)。首个趋于静止的图像反馈方案已撤掉，当前使用移动亮丝与烟尾以及同源边缘光影。V2 shader 与 V1 shader 未改动。
