# nice-qrcode-home 实施计划

> 状态：**待实施** · 制定日期：2026-09-19
>
> 开源的二维码/网址收集导航主页。纯前端静态站（零成本部署 GitHub Pages / Vercel），数据存本地 IndexedDB，极简黑白风格（Notion / Linear 质感）。
>
> 核心卖点：**几乎所有部件支持自定义 + 极其自由的模块化扩展接口**。

## 已确认的关键决策

| 决策项 | 结论 |
|---|---|
| 部署形态 | 纯前端静态站，数据存浏览器 IndexedDB + JSON 导出/导入备份；数据层做成 Adapter 接口，未来可平滑接入同步后端 |
| 前端框架 | React 18 + TypeScript + Vite |
| 视觉风格 | 极简黑白（亮/暗主题 + 自定义系统） |

## 一、技术栈与开源组件选型

| 用途 | 选型 | 协议 | 说明 |
|---|---|---|---|
| 构建 | Vite + React 18 + TypeScript | MIT | |
| 样式 | Tailwind CSS v4 | MIT | 黑白主题走 CSS variables，用户自定义 = 改变量 |
| 组件基座 | shadcn/ui（源码进项目，随意改） | MIT | 契合"所有部件可自定义" |
| 状态 | zustand（+persist） | MIT | cards / groups / settings / ui 四个 store |
| 本地存储 | Dexie.js（IndexedDB） | Apache-2.0 | 图片存 Blob，不受 localStorage 5MB 限制 |
| 二维码解码 | nimiq/qr-scanner + jsQR | MIT | 三层解码管线（见第二节） |
| 二维码生成 | qr-code-styling | MIT | 圆点/方块/渐变/logo 精美样式 |
| 拖拽排序 | @dnd-kit | MIT | |
| 动画 | motion（framer-motion） | MIT | 弹窗/排序过渡，轻量使用 |
| 图标 | lucide-react | ISC | |
| 测试 | vitest | MIT | 解码管线、数据层单测 |
| 可选 | vite-plugin-pwa | MIT | 离线可用 + 可安装为主页（M6 可选） |

选型调研结论（2026-09）：

- 静态图片解码 jsQR 最优（API 简单、鲁棒），摄像头实时扫码 nimiq/qr-scanner（WASM，自带静态图 `scanImage` 与摄像头两套能力，原生 `BarcodeDetector` 可用时优先走原生）→ 组成三层管线。
- 微信/支付宝**圆形花码（小程序码）为私有格式**，开源解码器（jsQR / zxing 系）无法解析其内容 → 采用"原图保留 + 平台标注"策略（见第二节）。

## 二、核心策略：解码与识别

### 三层解码管线（DecoderPipeline，逐层尝试，全部懒加载）

1. 原生 `BarcodeDetector`（Chrome / Android，最快）
2. `nimiq/qr-scanner`（WASM，静态图 + 摄像头实时扫码共用一个库）
3. `jsQR`（对破损/小图更鲁棒，含缩放、反色重试）

### 小程序码策略

- 方形标准二维码（含 `mp.weixin.qq.com`、`weixin://`、`alipays://` 链接）→ 正常解码 + 自动识别平台类型 + 可用 qr-code-styling 重新生成
- 圆形花码解码失败 → 检测圆形特征，提示"疑似小程序码" → **保留原图**作为卡片的二维码资产 + 用户选择平台标注 → 卡片直接展示原图供微信/支付宝扫码，附"请用 XX 扫一扫"提示

### 元数据识别（MetadataProvider 可插拔链）

- 图标：直连 `origin/favicon.ico`（国内可达）→ DuckDuckGo icons → Google s2 → 字母头像兜底（`<img>` 加载无 CORS 问题，黑白字母头像契合风格）
- 标题/描述：直连 fetch → r.jina.ai reader → 手动输入兜底；提供方可在设置中配置/关闭

## 三、模块化接口（"极其自由"的落点）

代码级扩展点，全部接口化 + 文档化（docs/architecture.md）：

- **`DataAdapter`**：`list / save / delete / export / import`，默认 LocalAdapter(Dexie)，预留未来 REST / WebDAV 同步适配器
- **`MetadataProvider`**：`fetchMeta(url)` 提供方链可插拔、可配置
- **`DecoderPipeline`**：解码器注册制，`decode(image) → string | null`
- **`QrRenderer`**：qr-code-styling 封装 + 样式预设；小程序码自动回退原图模式
- **`cardActions` 注册表**：卡片操作按钮（跳转/二维码/复制/分享/编辑/删除内置，预留 `registerCardAction()`）
- **设置项 schema 驱动**：新设置项声明式注册进设置面板
- **主题全走 CSS variables**：强调色/背景/圆角/密度自定义即改变量

## 四、数据模型（Dexie 表）

```ts
QrCard {
  id, type: 'web' | 'wechat-mini' | 'alipay-mini' | 'wechat-link' | 'alipay-link' | 'other',
  title, description?, url?, rawContent?,
  icon: { kind: 'favicon' | 'image' | 'letter', src?, letter? },
  imageAssetId?,        // 小程序码原图 → assets 表
  groupId?, tags[], color?, note?, sortOrder, createdAt, updatedAt
}
Group   { id, name, collapsed, sortOrder }
Settings(kv)：主题/强调色/背景/网格列数/密度/圆角/二维码样式/元数据源配置…
Assets  ：原始图片 Blob
```

导出/导入：单文件 JSON（cards + groups + settings + base64 图片），一键备份恢复。

## 五、功能与页面

1. **导入（多入口）**：粘贴 URL、上传图片、拖拽、Ctrl+V 截图直接粘贴、摄像头扫码、多行 URL/多图批量导入 → 解码 → 识别（favicon/标题 loading 态）→ 表单确认（标题/描述/图标/分组/标签/类型徽章）→ 保存
2. **主页**：顶栏（搜索、＋导入、设置）+ 分组区块 + 卡片网格；极简黑白：发丝边框、无阴影、等宽留白
3. **卡片**：图标 + 标题 + 描述 + 类型徽章；操作：跳转（新标签）、二维码、复制链接、编辑、删除；dnd-kit 组内拖拽排序，编辑弹窗可改分组
4. **搜索过滤**：标题/URL/标签实时过滤，按类型/分组筛选；Ctrl+K 命令面板（P2）
5. **二维码弹窗**：原图或重新生成的样式化二维码；下载 PNG/SVG、复制图片、复制链接、Web Share（移动端）、生成极简风分享卡（canvas 合成标题 + 域名 + 二维码）
6. **设置抽屉**：外观（亮/暗/跟随系统、强调色、背景、布局列数、密度、圆角）/ 二维码样式预设 / 元数据源 / 数据管理（导出/导入/清空 + 备份提醒）/ 关于
7. **中英文案集中管理**，v1 中文优先，预留 i18n

## 六、目录结构

```
nice-qrcode-home/
├─ docs/architecture.md      # 模块接口文档
├─ public/
├─ src/
│  ├─ components/{ui, card, import, qr, layout}/
│  ├─ core/
│  │  ├─ decode/            # barcodeDetector / qrScanner / jsqr / pipeline
│  │  ├─ metadata/          # MetadataProvider 接口 + 各实现
│  │  ├─ storage/           # DataAdapter 接口 + LocalAdapter(Dexie)
│  │  └─ types.ts
│  ├─ store/                # zustand: cards / groups / settings / ui
│  ├─ registry.ts           # cardActions、设置项、provider 注册表
│  ├─ hooks/  lib/  App.tsx  main.tsx
├─ LICENSE (MIT)  README.md (中英)  package.json
```

## 七、实施里程碑

- **M1 脚手架与地基**：Vite + React + TS + Tailwind + shadcn 初始化、黑白主题 token、Dexie 建表、zustand stores、类型定义
- **M2 导入与识别**：三层解码管线、导入弹窗全流程、MetadataProvider 链、类型自动识别、小程序码原图模式
- **M3 卡片与主页**：卡片网格、分组、搜索过滤、拖拽排序、编辑删除、批量导入
- **M4 二维码与分享**：二维码弹窗多样式、下载/复制/Web Share、分享卡合成
- **M5 自定义中心**：设置面板全套、JSON 导出导入、模块接口注册表 + architecture.md
- **M6 打磨发布**：README 中英 + MIT LICENSE、（可选）PWA、（可选）GitHub Pages 部署 workflow、vitest 单测（解码管线/数据层）、整体走查

## 八、风险与边界（已在方案内消化）

- 小程序码私有格式不可解码 → 原图保留 + 平台标注策略（第二节）
- 标题自动抓取受 CORS 限制 → 多级 provider + 手动兜底，均可配置
- Google / DDG 服务部分地区不可达 → 直连 favicon 优先 + 字母头像兜底
- 浏览器存储可能被清 → 导出备份 + 设置页提醒；DataAdapter 预留未来云同步

## 附：参考开源项目

- [nimiq/qr-scanner](https://github.com/nimiq/qr-scanner) — 浏览器二维码扫描（MIT）
- [cozmo/jsQR](https://github.com/cozmo/jsQR) — 纯 JS 二维码解码（MIT）
- [kozakdena/qr-code-styling](https://github.com/kozakdena/qr-code-styling) — 精美样式二维码生成（MIT）
- [shadcn/ui](https://ui.shadcn.com/) — 可复制粘贴的组件集（MIT）
- [dexie](https://github.com/dexie/Dexie.js) — IndexedDB 封装（Apache-2.0）
- [微信小程序码官方文档](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/qr-code.html) — 说明花码为私有格式
