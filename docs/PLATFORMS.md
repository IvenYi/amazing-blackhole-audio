# Android、macOS、Windows 接入方案

核对日期：2026-10-27。本文是实施方案；本仓库没有完成三平台安装包、原生录音引擎、签名、公证或真机验证。平台片段均为配置示意，不能单独构建 App。共享组件的调用见 [INTEGRATION.md](./INTEGRATION.md)。

## 1. 技术栈选择

| 平台 | 推荐基准 | 录音归属 |
| --- | --- | --- |
| Android | Capacitor 或原生 Android 宿主，内嵌共享 React + Three 页面 | Kotlin 录音服务；需要后台录音时使用 microphone 前台服务 |
| macOS / Windows | Electron，随包固定 Chromium / Three 版本 | 主进程管理独立原生录音模块或 helper；页面仅接收指标 |
| 可选轻量桌面方案 | Tauri / 原生 WKWebView、WebView2 | 原生录音模块；共享相同指标协议 |

Electron 把 Chromium 与应用一起分发，便于控制本项目黑洞的渲染基线，但不同 GPU 仍需验证。[Electron 进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)。Tauri 使用系统 WebView：Windows 为 WebView2，macOS 为 WKWebView，Android 为系统 WebView；特别需要复核 WebKit 的着色器精度、半浮点目标和透明合成效果。[Tauri WebView 版本](https://v2.tauri.app/reference/webview-versions/)

本组件需要 WebGL2 / GLSL3；支持半浮点渲染目标时使用半浮点，否则退到 8 位纹理，后者可能改变高光。Android 先用 `dpr={1}`、`maxFps={30}` 测量持续运行功耗，再提高画质。这是建议的性能档位，不是已验证的设备承诺。

## 2. Android：前台开始，服务持续录音

Capacitor 负责网页与原生插件通信；它本身不会把浏览器录音变成可靠后台录音。可以实现应用内插件，将操作转交 Kotlin 服务。[Capacitor 自定义插件](https://capacitorjs.com/docs/plugins/creating-plugins)

需要频段时，建议由 `AudioRecord` 的同一份 PCM 同时计算指标并送编码/文件流程，避免再打开第二路麦克风。仅使用 `MediaRecorder` 时可直接录文件，但它的最大振幅不是完整频谱；频段指标应来自实际分析，不能编造。[AudioRecord](https://developer.android.com/reference/android/media/AudioRecord)、[MediaRecorder](https://developer.android.com/media/platform/mediarecorder)

对于目标 API 34+ 的 microphone 前台服务，合并以下声明。`RecorderService` 是待实现的原生服务，此处不是服务实现：

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
<!-- 放入 application 元素内 -->
<service
    android:name=".RecorderService"
    android:exported="false"
    android:foregroundServiceType="microphone" />
```

正确顺序是：用户在可见 Activity 点击开始 → 获得 `RECORD_AUDIO` 运行时权限 → 调用 `startForegroundService()` → 服务及时调用带 microphone 类型的 `ServiceCompat.startForeground()`、显示录音通知 → 开始采集。随后切后台时让服务持有采集与文件写入，WebView 不持有录音生命周期。[前台服务启动](https://developer.android.com/develop/background-work/services/fgs/launch)、[microphone 类型](https://developer.android.com/develop/background-work/services/fgs/service-types#microphone)

Android 12+ 一般禁止从后台启动前台服务；Android 14+ 在创建依赖 while-in-use 权限的服务时检查麦克风权限，后台即使 `checkSelfPermission()` 返回已授予，也不代表当前可创建 microphone 服务。不要设计开机广播、普通后台任务自动开启录音；少数官方豁免不作为本产品默认路径。[后台启动与 while-in-use 限制](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)

Android 13+ 的 `POST_NOTIFICATIONS` 是单独的通知权限；拒绝它不等于禁止启动 FGS，但 FGS 仍必须提供通知。按产品流程解释并请求通知权限，处理拒绝后的通知展示差异。[通知权限](https://developer.android.com/develop/ui/compose/notifications/notification-permission)。发布 Google Play 时还需按实际用途声明前台服务类型，见上述类型文档。

停止顺序：停止采集 → 完成编码器与文件尾部 → 持久化会话结果 → 移除前台状态并停止服务。不要把 Activity/WebView 销毁等同于用户停止录音；也不要承诺用户强停或系统终止后仍能继续采集。

## 3. macOS：用途说明、授权、entitlements、签名分别处理

`Info.plist` 必须包含真实用途说明；仅录麦克风不需要额外申请摄像头或系统音频权限。[Apple 麦克风用途说明](https://developer.apple.com/documentation/bundleresources/information-property-list/nsmicrophoneusagedescription)

```xml
<key>NSMicrophoneUsageDescription</key>
<string>用于录制你主动开始的语音，并在本机显示音量动效。</string>
```

签名时按分发形态配置，两个 entitlement 的用途不同：

| 形态 | 音频相关配置 |
| --- | --- |
| Hardened Runtime（例如 Developer ID 分发与公证） | `com.apple.security.device.audio-input = true` |
| 启用 App Sandbox（Mac App Store 要求） | `com.apple.security.device.microphone = true`；还需沙盒及实际文件访问配置 |

来源：[Hardened Runtime Audio Input](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input)、[App Sandbox Microphone](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.microphone)、[App Sandbox](https://developer.apple.com/documentation/security/app-sandbox)。这些是音频相关项，不是可覆盖 Electron 全部默认 entitlements 的完整文件；需保留所选打包工具正确生成的 Electron/helper 配置。

用户点击后，可通过 Electron `systemPreferences.getMediaAccessStatus('microphone')` 检查状态，未决定时请求 `askForMediaAccess('microphone')`。拒绝后展示系统设置入口，不循环弹窗；官方说明用户在设置改权限后需重启应用生效。[Electron 系统权限 API](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesaskformediaaccessmediatype-macos)

对外直接分发按 Electron 指南完成 Developer ID 签名与公证，Mac App Store 按其独立流程构建。签名、entitlement 和 TCC 用户授权不能互相替代；最终以打包后的 App 验证权限，而不是只测开发环境。[Electron 签名/公证](https://www.electronjs.org/docs/latest/tutorial/code-signing)、[Mac App Store 指南](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)

## 4. Windows 与桌面生命周期

Electron 使用 Web 麦克风接口时，同时处理 session 的 permission request/check，仅放行受信任应用来源、预期 frame 和音频类型；不要对所有 `media` 请求无条件放行。原生录音引擎不通过网页发起采集时，不需要为可视化再申请一份网页麦克风权限。[Electron Session](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler)

Windows 还需处理系统“隐私和安全性 → 麦克风 → 允许桌面应用访问麦克风”、无设备、设备被移除或默认输入切换，拒绝权限与设备故障分别显示。[Microsoft 麦克风权限](https://support.microsoft.com/en-us/windows/privacy/turn-on-app-permissions-for-your-microphone-in-windows)

若使用原生 Windows + WebView2：宿主可处理 `PermissionRequested` 的 Microphone 请求，并通过 Web Message 把指标送到页面。选择 Evergreen 时记录并回归测试实际 Runtime 版本；选择 Fixed Version 时自己负责随包更新。[权限事件](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.permissionrequested)、[消息桥](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/communicate-btwn-web-native)、[Runtime 分发](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version)

桌面录音引擎由主进程管理的模块/helper 持有；关闭录音页、隐藏窗口或 WebGL context 丢失只应影响视觉。窗口重建后查询会话快照再订阅指标。应用退出、系统睡眠、设备中断需明确停止/中断事件与已写入文件恢复策略；“后台录音”不表示进程退出或设备睡眠后继续工作。

## 5. 打包前的实际验收

三平台都验证：授权允许/拒绝/撤销、内置与外接麦克风、静音与削波、设备拔出、切后台/锁屏/关闭页面、长时录音文件可打开、崩溃后的已有片段恢复。再核对黑洞深浅底、透明底、不同 DPR、reduced-motion、GPU context 恢复与功耗。当前仓库提供共享视觉与音频分析入口；这些原生录音和安装包验收尚未执行。
