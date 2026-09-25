import { useEffect, useRef, useState } from 'react';
import { Download, Link2, Share2 } from 'lucide-react';
import { Modal } from './Modal';
import { useStore } from '../store';
import type { Asset, Card } from '../core/types';
import { encodeShareLink, renderAppQr, type ShareEncodeResult } from '../core/app';
import { cardImageBlob } from '../core/sheet';
import { copy, download, errorMessage } from '../lib';
import { fmt } from '../i18n';
import { useI18n } from '../useI18n';
export function ShareModal({
  title,
  cards,
  assets,
  onClose,
  notify,
}: {
  title: string;
  cards: Card[];
  assets: Asset[];
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const settings = useStore((s) => s.settings);
  const t = useI18n();
  const shareable = cards.filter((c) => c.rawContent.trim());
  const [result, setResult] = useState<ShareEncodeResult | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [tooLarge, setTooLarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const blob = useRef<Blob | null>(null);
  const url = useRef('');
  useEffect(() => {
    let alive = true;
    void (async () => {
      const encoded = await encodeShareLink(cards.map((c) => [c.title, c.rawContent, c.note]));
      if (!alive) return;
      if (!encoded) {
        setTooLarge(true);
        return;
      }
      setResult(encoded);
      const rendered = await renderAppQr(encoded.link, 520);
      if (!alive || !rendered) return;
      blob.current = rendered;
      url.current = URL.createObjectURL(rendered);
      setQrUrl(url.current);
    })();
    return () => {
      alive = false;
      if (url.current) URL.revokeObjectURL(url.current);
    };
    // Encode once per mount; cards/assets arriving together is guaranteed by the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function action(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function systemShare() {
    setBusy(true);
    setError('');
    try {
      const used = new Set<string>();
      const files: File[] = [];
      for (const card of cards) {
        const image = await cardImageBlob(card, assets, settings.qrStyle);
        if (!image) continue;
        const ext = image.type === 'image/jpeg' ? 'jpg' : 'png';
        const base = (card.title.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'qr').slice(0, 60);
        let name = `${base}.${ext}`;
        for (let i = 2; used.has(name); i++) name = `${base}(${i}).${ext}`;
        used.add(name);
        files.push(new File([image], name, { type: image.type || 'image/png' }));
      }
      if (!files.length) throw new Error(t.share.noImages);
      if (navigator.canShare?.({ files })) await navigator.share({ title, files });
      else if (result) await navigator.share({ title, text: result.link });
      else throw new Error(t.share.shareUnsupported);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={t.share.title} subtitle={title} onClose={onClose}>
      <div className="modal-body share-body">
        {!shareable.length ? (
          <p className="share-warn">{t.share.onlyImages}</p>
        ) : tooLarge ? (
          <p className="share-warn">{t.share.tooLarge}</p>
        ) : !result ? (
          <p className="muted">{t.importDlg.processing}</p>
        ) : (
          <>
            <div className="share-paper">
              {qrUrl ? (
                <img src={qrUrl} alt={t.share.title} />
              ) : (
                <span className="muted">{t.importDlg.processing}</span>
              )}
            </div>
            <p className="share-meta">
              {fmt(t.share.includedN, { n: result.included, total: shareable.length })}
            </p>
            {(result.droppedNotes || result.shortenedTitles || result.truncated) && (
              <p className="share-warn">
                {[
                  result.droppedNotes ? t.share.droppedNotes : '',
                  result.shortenedTitles ? t.share.shortenedTitles : '',
                  result.truncated ? fmt(t.share.truncated, { n: result.included }) : '',
                ]
                  .filter(Boolean)
                  .join('；')}
              </p>
            )}
            <p className="share-hint">{t.share.hint}</p>
          </>
        )}
        <div className="qr-actions">
          {typeof navigator.share === 'function' && (
            <button className="button" disabled={busy} onClick={() => void systemShare()}>
              <Share2 size={16} />
              {fmt(t.share.systemShare, { n: cards.length })}
            </button>
          )}
          {result && (
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await copy(result.link);
                  notify(t.toast.shareLinkCopied);
                })
              }
            >
              <Link2 size={16} />
              {t.share.copyLink}
            </button>
          )}
          {result && (
            <button
              className="button"
              disabled={busy || !qrUrl}
              onClick={() =>
                void action(async () => {
                  if (blob.current) download(blob.current, title + t.share.fileNameSuffix);
                })
              }
            >
              <Download size={16} />
              {t.share.download}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
