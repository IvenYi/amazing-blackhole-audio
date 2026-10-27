---
version: alpha
colors:
  primary: '#c4b5fd'
  canvas: '#09090b'
  surface: '#111113'
  raised: '#19191c'
  border: '#27272c'
  text: '#ededf0'
  muted: '#a1a1aa'
  accent: '#c4b5fd'
typography:
  body:
    fontFamily: 'Arial, Microsoft YaHei, sans-serif'
    fontSize: '14px'
    lineHeight: '1.65'
  code:
    fontFamily: 'Consolas, monospace'
    fontSize: '12px'
    lineHeight: '1.8'
rounded:
  panel: '12px'
  control: '6px'
spacing:
  desktopPage: '44px'
  mobilePage: '18px'
  columns: '28px'
components:
  preview:
    height: '620px'
    backgroundColor: '{colors.canvas}'
  controls:
    width: '276px'
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
---

# Black Hole

## Overview
以 React Bits Pro Black Hole 的渲染效果、动画与交互为验收依据。此项目是组件及单页预览工具，不重制官方文档站的导航和商标。主角始终是黑洞画布；参数面板保持低对比、紧凑、可键盘操作。用户明确不要求原始注释、变量名与文件结构。

## Colors
以上颜色由 `src/styles.css` 的根变量实现，是演示页的唯一主题来源。黑洞颜色由组件参数和 shader 决定，不能用 CSS 滤镜改变。演示默认背景与原站深色主题一致，为 `#0A0A0A`；组件 API 默认背景为 `#000000`。

## Typography
正文和中文控件使用系统字体，代码与数字使用 Consolas。标题紧凑，参数值对齐。无需外部字体请求。

## Layout
桌面为流体画布与 276px 参数栏；760px 以下堆叠，页面自然滚动。全屏纯画布单独占满视口。参数滚动容器使用根 scrollbar tokens，所有控件可达。

## Elevation & Depth
边界使用细线，无装饰性投影；光晕仅由黑洞实际渲染产生。

## Shapes
外层预览和参数面板 12px 圆角，控件 6px；不添加无关背景装饰。

## Components
`BlackHole.tsx` 负责 GPU 和交互生命周期；`black-hole-shaders.ts` 负责渲染公式；`settings.ts` 负责示例默认值和预设；`App.tsx` 负责演示状态。预设使用系统原生 select，接受操作系统弹出菜单样式。范围输入使用原生 range，布尔项使用原生 checkbox。所有操作用 button、导航用 a，并有可见焦点。代码复制失败使用页内 status。

声音反馈 Demo 增加紧凑输入面板，沿用同一表面、文字与焦点 tokens。首次加载不请求麦克风；“运行声音测试”为不外放的生成音源，“启用麦克风”由用户单独点击授权。状态预览明确标注演示，不表示真实录音文件或 AI 任务已经启动。声音显示只影响黑洞的光环、光流速度与轨道，GLSL 公式保持原样。反馈强度三档为轻柔 0.55、平衡 1、明显 1.6，待用户通过 Demo 确认。

## Do's and Don'ts
保持 five-pass shader 流程、颜色空间、辉光层级与弹簧参数；默认运行不使用固定时间。对照使用可选 deterministicTime 并关闭 intro、暂停和鼠标响应。固定帧功能是检查工具，不改变正常动画。尊重 reduced-motion，正确释放 GPU 资源。不要以图片、视频或近似免费组件替代实时黑洞。
