import type { Asset, Card, Settings } from './types';
import { domain } from './content';
import { qrRenderer } from './qr';
import { download } from '../lib';
import { dict, fmt } from '../i18n';

/**
 * Compose a minimalist black-and-white sheet of QR codes and download it as PNG.
 * Cards with rawContent get a freshly rendered QR; mini-program cards fall back
 * to their preserved original image. Returns the number of exported codes.
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
  const footerH = 72;
  const canvas = document.createElement('canvas');
  canvas.width = margin * 2 + cols * cellW + (cols - 1) * gap;
  canvas.height = margin + headerH + rows * cellH + (rows - 1) * gap + footerH + margin - 48;
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
  ctx.textAlign = 'center';
  ctx.fillStyle = '#b3b5b8';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText(t.sheet.footer, canvas.width / 2, canvas.height - 34);
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('合集图片生成失败'))), 'image/png'),
  );
  download(blob, (fileName ?? title) + t.sheet.fileNameSuffix);
  return bitmaps.length;
}
