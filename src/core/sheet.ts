import type { Asset, Card, Settings } from './types';
import { domain } from './content';
import { buildAppLink, contentHash, renderAppQr, type ManifestItem } from './app';
import { qrRenderer } from './qr';
import { download } from '../lib';
import { dict, fmt } from '../i18n';

/** Wrap a footer hint for canvas printing; the last line gets an ellipsis. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    if (line && ctx.measureText(line + char).width > maxWidth) {
      lines.push(line);
      if (lines.length === maxLines) {
        lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
        return lines;
      }
      line = '';
    }
    line += char;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Compose a minimalist black-and-white sheet of QR codes and download it as PNG.
 * Cards with rawContent get a freshly rendered QR; mini-program cards fall back
 * to their preserved original image. The footer carries the app QR whose link
 * also encodes a title manifest for one-tap re-import. Returns the export count.
 */
export async function exportQrSheet({
  title,
  cards,
  assets,
  style,
  fileName,
}: {
  title: string;
  cards: Card[];
  assets: Asset[];
  style: Settings['qrStyle'];
  fileName?: string;
}): Promise<number> {
  const bitmaps = (
    await Promise.all(
      cards.map(async (card) => {
        try {
          const asset = assets.find((a) => a.id === card.imageAssetId);
          const preferOriginal = card.type === 'mini' && asset;
          let blob: Blob | null = null;
          if (preferOriginal && asset) blob = asset.blob;
          else if (card.rawContent.trim()) {
            const renderer = await qrRenderer.create(card.rawContent, style);
            const data = await renderer.getRawData('png');
            if (data instanceof Blob) blob = data;
          } else if (asset) blob = asset.blob;
          if (!blob) return null;
          const bitmap = await createImageBitmap(blob);
          return { card, bitmap };
        } catch {
          return null;
        }
      }),
    )
  ).filter((x): x is { card: Card; bitmap: ImageBitmap } => x !== null);
  if (!bitmaps.length) return 0;
  const t = dict();
  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(bitmaps.length))));
  const rows = Math.ceil(bitmaps.length / cols);
  const margin = 72;
  const gap = 28;
  const cellW = 340;
  const cellH = 430;
  const qrSize = 270;
  const headerH = 128;
  const footerQr = 156;
  const footerH = 226;
  const gridBottom = margin + headerH + rows * cellH + (rows - 1) * gap;
  const canvas = document.createElement('canvas');
  canvas.width = margin * 2 + cols * cellW + (cols - 1) * gap;
  canvas.height = gridBottom + footerH + 48;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#17181a';
  ctx.textAlign = 'left';
  ctx.font = '600 34px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(title.slice(0, 30), margin, margin + 34);
  ctx.fillStyle = '#8b8e91';
  ctx.font = '16px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(
    fmt(t.sheet.count, { n: bitmaps.length }) + ' · ' + new Date().toLocaleDateString(t.htmlLang),
    margin,
    margin + 66,
  );
  ctx.strokeStyle = '#e9e9e6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, margin + headerH - 28);
  ctx.lineTo(canvas.width - margin, margin + headerH - 28);
  ctx.stroke();
  bitmaps.forEach(({ card, bitmap }, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * (cellW + gap);
    const y = margin + headerH + row * (cellH + gap);
    const scale = Math.min(qrSize / bitmap.width, qrSize / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, x + (cellW - w) / 2, y + (qrSize - h) / 2, w, h);
    bitmap.close();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#17181a';
    ctx.font = '600 20px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(card.title.slice(0, 18), x + cellW / 2, y + cellH - 88, cellW - 16);
    ctx.fillStyle = '#8b8e91';
    ctx.font = '14px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(
      card.rawContent
        ? card.type === 'web'
          ? domain(card.rawContent)
          : t.types[card.type]
        : t.sheet.original,
      x + cellW / 2,
      y + cellH - 58,
      cellW - 16,
    );
  });
  // Footer: divider, app QR and a two-line caption. The QR link doubles as the
  // title manifest that powers one-tap import of this exact sheet.
  ctx.beginPath();
  ctx.moveTo(margin, gridBottom + 16);
  ctx.lineTo(canvas.width - margin, gridBottom + 16);
  ctx.stroke();
  const items: ManifestItem[] = bitmaps
    .filter(({ card }) => card.rawContent.trim())
    .map(({ card }) => [card.title, contentHash(card.rawContent)]);
  const appBlob = await renderAppQr(buildAppLink(items), 400);
  const qrY = gridBottom + 44;
  if (appBlob) {
    const appBitmap = await createImageBitmap(appBlob);
    ctx.drawImage(appBitmap, margin, qrY, footerQr, footerQr);
    appBitmap.close();
  }
  const textX = margin + footerQr + 26;
  const maxTextW = canvas.width - margin - textX;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#17181a';
  ctx.font = '600 23px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(t.sheet.footer, textX, qrY + 64, maxTextW);
  ctx.fillStyle = '#8b8e91';
  ctx.font = '14px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
  wrapText(ctx, t.sheet.scanHint, maxTextW, 3).forEach((line, i) => {
    ctx.fillText(line, textX, qrY + 96 + i * 22);
  });
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('合集图片生成失败'))), 'image/png'),
  );
  download(blob, (fileName ?? title) + t.sheet.fileNameSuffix);
  return bitmaps.length;
}
