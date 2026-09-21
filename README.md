# nice·qrcode-home

一个极简黑白风格的网址与二维码收藏主页 —— 纯前端、开源、数据全部留在你的浏览器里。

**Try Out Online Here!** https://nice-qrcode-home.freddyhu2007.workers.dev/

## 特性

- **便捷导入**：粘贴网址 / 拖入或 Ctrl+V 粘贴二维码截图 / 摄像头扫码，支持批量
- **三层解码**：BarcodeDetector → qr-scanner → jsQR 逐层兜底；识别成功的二维码不保留原图，随时重新生成
- **小程序码**：微信 / 支付宝花码无法解码（私有格式），自动保留原图供扫码，标注为「小程序」类型
- **卡片管理**：分组、星标、标签、搜索过滤、拖拽排序、**多选批量操作**（星标 / 移动分组 / 删除）
- **二维码与分享**：三种样式，PNG / SVG 下载、复制图片、系统分享、分享卡，**一键导出整组二维码合集**
- **高度自定义**：明暗主题、强调色、背景、每行卡片数、圆角、密度、二维码尺寸
- **中英双语**：设置里一键切换语言
- **本地优先**：IndexedDB 存储，无账号、无同步、无遥测；JSON 备份一键导出 / 恢复
- **GSAP 微动效**：每个操作都有非线性动画反馈

## 快速开始

需要 Node.js 20+。

```sh
npm ci
npm run dev        # 开发服务器
npm test           # 单元测试
npm run build      # 产物输出到 dist/
```

首次打开是空空间，点击「先看看示例」可加入六个演示卡片。

## 部署

纯静态 SPA。`npm run build` 后把 `dist/` 上传到任意静态托管（Vercel / Netlify / GitHub Pages 均可）。生产环境建议 HTTPS（摄像头与剪贴板 API 需要）。

## 数据说明

- 数据存于当前浏览器、当前域名的 IndexedDB；清除浏览器数据会删除收藏，请定期导出备份
- 更换设备或域名时，通过「设置 → 数据与隐私」导出 / 恢复 JSON 备份
- 图片单张 ≤ 10 MB，一次最多导入 30 张

## 技术栈

React 18 · TypeScript · Vite · Dexie (IndexedDB) · zustand · qr-scanner + jsQR · qr-code-styling · dnd-kit · GSAP

## License

MIT

---

# nice-qrcode-home (English)

A minimalist black-and-white home for your links and QR codes — fully front-end, open source, and all data stays in your browser.

## Features

- **Easy import**: paste URLs, drop or Ctrl+V QR screenshots, or scan with the camera — batch supported
- **Three-layer decoding**: BarcodeDetector → qr-scanner → jsQR fallbacks; successfully decoded codes are re-generated on demand (no original images kept)
- **Mini-program codes**: WeChat / Alipay proprietary codes cannot be decoded — the original image is kept for scanning, tagged as "Mini program"
- **Card management**: groups, stars, tags, search & filters, drag-to-sort, **multi-select batch actions** (star / move / delete)
- **QR & sharing**: three styles, PNG / SVG download, copy image, system share, share cards, and **one-click group QR sheet export**
- **Highly customizable**: light/dark themes, accent color, background, cards per row, radius, density, QR size
- **Bilingual**: switch between 中文 and English in settings
- **Local-first**: IndexedDB storage — no accounts, no sync, no telemetry; one-click JSON backup & restore
- **GSAP micro-animations**: non-linear feedback on every interaction

## Quick Start

Requires Node.js 20+.

```sh
npm ci
npm run dev        # dev server
npm test           # unit tests
npm run build      # outputs dist/
```

The space starts empty — click "Try the samples" to add six demo cards.

## Deployment

A static SPA. Run `npm run build` and upload `dist/` to any static host (Vercel / Netlify / GitHub Pages). HTTPS is recommended in production (camera & clipboard APIs).

## Data Notes

- Data lives in the current browser and origin; clearing browser data deletes it — export backups regularly
- Move between devices or domains via JSON backup in Settings → Data & privacy
- Images up to 10 MB each, 30 per import

## Tech Stack

React 18 · TypeScript · Vite · Dexie (IndexedDB) · zustand · qr-scanner + jsQR · qr-code-styling · dnd-kit · GSAP

## License

MIT
