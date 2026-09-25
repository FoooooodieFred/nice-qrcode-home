import { useEffect, useRef, useState } from 'react';
import { Maximize, X } from 'lucide-react';
import { useStore } from '../store';
import type { Asset, Card } from '../core/types';
import { qrRenderer } from '../core/qr';
import { AssetImage } from './AssetImage';
import { gsap, modalIn, modalOut, reducedMotion } from '../anim';
import { fmt } from '../i18n';
import { useI18n } from '../useI18n';
type ScreenLock = { release(): Promise<void> };
/**
 * Fullscreen black stage for showing one code to another person: the QR (or
 * the preserved mini-program original) blown up on a dark backdrop, with a
 * wake lock so the screen stays on while the code is being scanned.
 */
export function StageModal({
  card,
  asset,
  original,
  onClose,
}: {
  card: Card;
  asset?: Asset;
  original: boolean;
  onClose: () => void;
}) {
  const qrStyle = useStore((s) => s.settings.qrStyle);
  const t = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    modalIn(el);
    const onFullscreenChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    // Best-effort keep-awake; older Safari simply has no wakeLock.
    const wakeLock = (
      navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<ScreenLock> } }
    ).wakeLock;
    let lock: ScreenLock | null = null;
    void wakeLock
      ?.request('screen')
      .then((sentinel) => {
        lock = sentinel;
      })
      .catch(() => {});
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      void lock?.release().catch(() => {});
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      el.close();
    };
  }, []);
  useEffect(() => {
    if (original) {
      setReady(true);
      return;
    }
    let active = true;
    void qrRenderer
      .create(card.rawContent, qrStyle)
      .then(async (renderer) => {
        await renderer.getRawData('svg');
        if (!active) return;
        container.current?.replaceChildren();
        renderer.append(container.current!);
        setReady(true);
      })
      .catch(() => {
        if (active) setError(t.qrDlg.tooLong);
      });
    return () => {
      active = false;
    };
    // The stage renders once per mount; card/style changes reopen it instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ready && paper.current && !reducedMotion())
      gsap.fromTo(
        paper.current,
        { scale: 0.9, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.55,
          ease: 'back.out(1.4)',
          clearProps: 'transform,opacity',
        },
      );
  }, [ready]);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    modalOut(dialog.current!, onClose);
  };
  return (
    <dialog
      ref={dialog}
      className="stage-modal"
      aria-label={fmt(t.aria.stage, { name: card.title })}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        // The dialog fills the viewport; a click that lands on it is a backdrop click.
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="stage-viewport">
        <div className="stage-paper" ref={paper}>
          {original && asset ? (
            <AssetImage blob={asset.blob} alt={fmt(t.qrDlg.originalAlt, { name: card.title })} />
          ) : (
            <div ref={container} />
          )}
        </div>
        <p className="stage-title">{error || card.title}</p>
      </div>
      <button className="stage-button stage-close" onClick={requestClose} aria-label={t.aria.close}>
        <X size={18} />
      </button>
      {document.fullscreenEnabled && !fullscreen && (
        <button
          className="stage-button stage-fullscreen"
          onClick={() => void dialog.current?.requestFullscreen().catch(() => {})}
        >
          <Maximize size={14} />
          {t.stage.fullscreen}
        </button>
      )}
    </dialog>
  );
}
