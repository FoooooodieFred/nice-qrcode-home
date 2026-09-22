import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Image, Link2, Share2 } from 'lucide-react';
import type QRCodeStyling from 'qr-code-styling';
import { Modal } from './Modal';
import { AssetImage } from './AssetImage';
import { useStore } from '../store';
import type { Card, Settings } from '../core/types';
import { qrRenderer } from '../core/qr';
import { copy, download, errorMessage } from '../lib';
import { domain } from '../core/content';
import { APP_URL, buildAppLink, contentHash, renderAppQr } from '../core/app';
import { gsap, reducedMotion } from '../anim';
import { fmt } from '../i18n';
import { useI18n } from '../useI18n';
export function QrModal({
  card,
  onClose,
  notify,
}: {
  card: Card;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const { assets, settings } = useStore();
  const t = useI18n();
  const asset = assets.find((a) => a.id === card.imageAssetId);
  const qrSize = Number(settings.extensions['qrSize'] ?? 272);
  const [original, setOriginal] = useState(!!asset && (!card.rawContent || card.type === 'mini'));
  const [style, setStyle] = useState<Settings['qrStyle']>(settings.qrStyle);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const qr = useRef<QRCodeStyling>();
  useEffect(() => {
    let active = true;
    setReady(false);
    setError('');
    qr.current = undefined;
    if (original) {
      setReady(true);
      return;
    }
    void qrRenderer
      .create(card.rawContent, style)
      .then(async (renderer) => {
        await renderer.getRawData('svg');
        if (active && container.current) {
          container.current.replaceChildren();
          renderer.append(container.current);
          qr.current = renderer;
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setError(t.qrDlg.tooLong);
      });
    return () => {
      active = false;
    };
  }, [card.rawContent, style, original]);
  useEffect(() => {
    if (ready && paper.current && !reducedMotion())
      gsap.fromTo(
        paper.current,
        { scale: 0.86, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.5,
          ease: 'back.out(1.5)',
          // 只清动画属性：clearProps:'all' 会把 React 设置的尺寸内联样式一并抹掉
          clearProps: 'transform,opacity',
        },
      );
  }, [ready, original, style]);
  async function png(): Promise<Blob> {
    if (original && asset) {
      const bitmap = await createImageBitmap(asset.blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      bitmap.close();
      return new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error(t.qrDlg.convertFailed))), 'image/png'),
      );
    }
    const data = await qr.current?.getRawData('png');
    if (!(data instanceof Blob)) throw new Error(t.qrDlg.notReady);
    return data;
  }
  async function action(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function shareCard() {
    const bitmap = await createImageBitmap(await png());
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f5f6f2';
    ctx.fillRect(0, 0, 640, 800);
    ctx.fillStyle = '#fff';
    ctx.fillRect(60, 60, 520, 680);
    ctx.drawImage(bitmap, 110, 100, 420, 420);
    bitmap.close();
    ctx.fillStyle = '#18241d';
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(card.title.slice(0, 24), 320, 582, 450);
    ctx.fillStyle = '#7c827b';
    ctx.font = '18px sans-serif';
    ctx.fillText(domain(card.rawContent), 320, 620, 460);
    // Footer: app QR (its link carries this card's title manifest) + caption.
    const link = card.rawContent
      ? buildAppLink([[card.title.slice(0, 40), contentHash(card.rawContent)]])
      : APP_URL;
    const appBlob = await renderAppQr(link, 240, '#18241d');
    const qrS = 84;
    const left = 320 - (qrS + 18 + 186) / 2;
    if (appBlob) {
      const app = await createImageBitmap(appBlob);
      ctx.drawImage(app, left, 646, qrS, qrS);
      app.close();
    }
    const textX = left + qrS + 18;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#18241d';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(t.brand, textX, 678);
    ctx.fillStyle = '#7c827b';
    ctx.font = '12px sans-serif';
    ctx.fillText(t.qrDlg.shareFooter, textX, 700, 186);
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error(t.qrDlg.shareFailed))), 'image/png'),
    );
    download(blob, card.title + '-分享卡.png');
  }
  return (
    <Modal title={t.qrDlg.title} subtitle={card.title} onClose={onClose}>
      <div className="modal-body qr-body">
        <div className="qr-paper" ref={paper} style={{ width: qrSize, height: qrSize }}>
          {original && asset ? (
            <AssetImage blob={asset.blob} alt={fmt(t.qrDlg.originalAlt, { name: card.title })} />
          ) : (
            <div ref={container} />
          )}
        </div>
        <h3>{card.title}</h3>
        <p className="muted">{card.type === 'mini' ? t.qrDlg.scanMini : t.qrDlg.scanGeneric}</p>
        {asset && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={original}
              disabled={!card.rawContent}
              onChange={(e) => setOriginal(e.target.checked)}
            />
            {t.qrDlg.useOriginal}
          </label>
        )}
        {!original && (
          <div className="segmented">
            {(['square', 'dots', 'rounded'] as const).map((s, i) => (
              <button className={style === s ? 'active' : ''} key={s} onClick={() => setStyle(s)}>
                {[t.qrDlg.styleSquare, t.qrDlg.styleDots, t.qrDlg.styleRounded][i]}
              </button>
            ))}
          </div>
        )}
        <div className="qr-actions">
          <button
            className="button"
            disabled={!ready}
            onClick={() => void action(async () => download(await png(), card.title + '.png'))}
          >
            <Download size={16} />
            PNG
          </button>
          <button
            className="button"
            disabled={!ready || original}
            onClick={() =>
              void action(async () => {
                const blob = await qr.current?.getRawData('svg');
                if (blob instanceof Blob) download(blob, card.title + '.svg');
              })
            }
          >
            <Download size={16} />
            SVG
          </button>
          <button
            className="button"
            disabled={!ready}
            onClick={() =>
              void action(async () => {
                if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
                  throw new Error(t.qrDlg.clipboardUnsupported);
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': await png() })]);
                notify(t.toast.imageCopied);
              })
            }
          >
            <Copy size={16} />
            {t.qrDlg.copyImage}
          </button>
          <button className="button" disabled={!ready} onClick={() => void action(shareCard)}>
            <Image size={16} />
            {t.qrDlg.shareCard}
          </button>
        </div>
        {card.rawContent && (
          <button
            className="text-button"
            onClick={() =>
              void action(async () => {
                await copy(card.rawContent);
                notify(t.toast.contentCopied);
              })
            }
          >
            <Link2 size={15} />
            {card.type === 'web' ? t.qrDlg.copyLink : t.qrDlg.copyContent}
          </button>
        )}
        {typeof navigator.share === 'function' && (
          <button
            className="button"
            disabled={!ready}
            onClick={() =>
              void action(async () => {
                const file = new File([await png()], card.title + '.png', { type: 'image/png' });
                if (navigator.canShare?.({ files: [file] }))
                  await navigator.share({ title: card.title, files: [file] });
                else
                  await navigator.share({ title: card.title, text: card.rawContent || card.title });
              })
            }
          >
            <Share2 size={16} />
            {t.qrDlg.systemShare}
          </button>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
