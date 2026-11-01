<p align="center"><img src="../docs/assets/github-banner.png" alt="AutoTap Macro — 录制、重放，按你的方式自动化。" width="100%"></p>

<p align="center"><strong>为浏览器日常操作、JavaScript 和实用网页工具打造的小小工作台。</strong></p>

<!-- Replace the Chrome Web Store homepage URL below with your extension listing URL. -->
<p align="center">
  <a href="https://play.google.com/store/apps/details?id=com.devsinexile.autotapmacro"><img src="../docs/assets/google-play-badge.svg" alt="在 Google Play 获取 Android 应用" width="220" height="64"></a>
  <a href="https://chromewebstore.google.com/"><img src="../docs/assets/chrome-web-store-badge.svg" alt="从 Chrome 应用商店安装" width="220" height="64"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.2-6c9a3e?style=flat-square" alt="版本 1.4.2">
  <img src="https://img.shields.io/badge/Chrome-138%2B-67563e?style=flat-square" alt="Chrome 138 及以上">
  <img src="https://img.shields.io/badge/Manifest-V3-67563e?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/storage-local-6c9a3e?style=flat-square" alt="本地存储">
</p>

<p align="center"><a href="../README.md">English</a> · <a href="README.es.md">Español</a> · <strong>简体中文</strong> · <a href="README.hi.md">हिन्दी</a> · <a href="README.ar.md">العربية</a> · <a href="README.fr.md">Français</a></p>

通过 Chrome 应用商店安装扩展，也可在本地加载。扩展界面为英语。

## 一个工作台，三种自动化方式

| 宏 | 用户脚本 | 网页工具 |
| --- | --- | --- |
| 录制点击、五个标准鼠标按钮、指针移动、按住操作、HTML 拖放、滚轮手势、输入和滚动。 | 编写或导入 `.js` / `.user.js` 文件。使用已支持的 GM API，在选定网站手动运行一次或自动运行。 | 用 CSS 选择器提取重复元素，预览表格，并导出 CSV 或 JSON。 |
| 编辑步骤、选择器和时间；设置循环、速度、等待、文本检查及错误处理。 | 使用独立脚本存储、网络请求、资源、菜单命令、通知、下载及剪贴板写入。 | 管理收藏与标签，修改内置示例，查看 Activity 活动记录，导出 JSON 备份。 |

录制时，轻量交互提示和单行操作轮播显示在紧凑、可移动的暂停／停止栏上方。扩展尊重系统的减少动态效果设置。除非你导出数据或脚本发出请求，数据都会保留在浏览器配置文件中。

<p align="center"><img src="../store/screenshot-macros-1280x800.png" alt="宏编辑器：已保存的操作流程、时间设置与可编辑步骤" width="100%"></p>

<details>
<summary><strong>查看另外四张截图</strong></summary>

| 实时录制 | JavaScript 编辑器 |
| --- | --- |
| ![示例网页上的录制反馈](../store/screenshot-recording-1280x800.png) | ![用户脚本编辑器](../store/screenshot-javascript-1280x800.png) |
| 脚本权限与兼容性 | 网页数据导出 |
| ![网络与附件设置](../store/screenshot-compatibility-1280x800.png) | ![数据提取预览](../store/screenshot-toolbox-1280x800.png) |

</details>

## 本地安装

1. 下载或克隆本仓库，使用 **Chrome 138 或更新版本**。
2. 打开 `chrome://extensions`，启用 **Developer mode**（开发者模式）。
3. 点击 **Load unpacked**（加载已解压的扩展程序），选择本仓库中的 **`chrome/`** 文件夹。
4. 打开普通 HTTP(S) 网站 → AutoTap 图标 → **Record this tab**。完成操作后点击 **Stop**。通过 **Open workshop** 编辑或重放宏。

更新时，请保留安装目录，替换其中的文件，然后在扩展卡片上点击 **Reload** 并刷新网站标签页。无需构建，也无需安装 Android 应用。

快捷键：**Alt+Shift+R** 开始录制，**Alt+Shift+X** 停止。可在 `chrome://extensions/shortcuts` 修改。

## 使用自己的 JavaScript

在 Chrome 的 AutoTap 扩展详情中启用 **Allow user scripts**。在工作台打开 **JavaScript**，创建或导入脚本，检查权限后点击 **Run once**。如需自动执行，请设置网站规则、启用自动运行并保存。导入的脚本默认关闭自动运行。

对 Tampermonkey 的兼容性为**部分兼容**：已实现的 API 同时提供传统 `GM_*` 和现代 `GM.*` 形式。声明的 `@require` / `@resource` 文件可从本地附加，或由你明确下载到草稿中审阅，不会静默下载或更新。详见英文[兼容性矩阵](../docs/COMPATIBILITY.md)。

## 隐私与使用边界

- 无账号、无内置分析服务、无扩展自营服务器。网站权限及原生功能权限按需申请。脚本可以访问你授权的网络端点。
- 跳过密码、文件及识别出的支付／一次性验证码字段。普通文本、脚本、日志和备份仍可能包含个人信息。
- 宏录制与数据提取只作用于顶层网页。页面导航会结束宏会话。不支持 Chrome 内部页面、Chrome 应用商店、shadow DOM，以及要求可信硬件事件的网站。
- 不支持 `unsafeWindow`、Cookie API、流式响应或脚本自动更新。**Stop** 用于停止宏；要清除任意脚本创建的定时器或监听器，请重新加载页面。

[扩展隐私政策](../store/PRIVACY.md) · [开发者网站](https://devs-in-exile.pages.dev/) · [输入与性能说明](../docs/PERFORMANCE.md)

## 也可在 Android 上使用

[Google Play 上的 AutoTap Macro](https://play.google.com/store/apps/details?id=com.devsinexile.autotapmacro) 可在 Android 应用中录制和重放点击。浏览器扩展与 Android 应用使用独立的集合和格式，不提供同步。

## 开发与素材

运行代码位于 `chrome/`，翻译位于 `i18n/`，横幅与徽章位于 `docs/assets/`。`store/` 包含五张 **1280 × 800** 截图，以及 **440 × 280 / 1400 × 560** 宣传图。

```sh
npm install
npm test
npm run test:browser
npm run assets
```

[构建、浏览器检查与打包](../docs/DEVELOPMENT.md) · [反馈问题](https://github.com/DevsInExile-Studio/AutoTapMacro-extension/issues) · [联系我们](mailto:DevsInExileStudio@outlook.com)
