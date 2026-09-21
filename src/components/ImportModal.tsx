import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, ImagePlus, Link2, Loader2, Upload, X } from 'lucide-react';
import { Modal } from './Modal';
import { AssetImage } from './AssetImage';
import { useStore } from '../store';
import { makeCard, classify } from '../core/content';
import { decoderPipeline } from '../core/decode';
import { fetchMetadata } from '../core/metadata';
import { MAX_IMAGE_BYTES } from '../core/storage';
import { type Asset, type Card, cardTypes } from '../core/types';
import { errorMessage } from '../lib';
import { fmt } from '../i18n';
import { useI18n } from '../useI18n';
type Draft = { card: Card; asset?: Asset };
export function CardFields({ card, onChange }: { card: Card; onChange: (card: Card) => void }) {
  const groups = useStore((s) => s.groups);
  const t = useI18n();
  const update = (patch: Partial<Card>) => onChange({ ...card, ...patch });
  return (
    <div className="form-grid">
      <label className="span-2">
        {t.fields.title}
        <input
          autoFocus
          value={card.title}
          maxLength={200}
          onChange={(e) => update({ title: e.target.value })}
          placeholder={t.fields.titlePlaceholder}
          required
        />
      </label>
      <label className="span-2">
        {t.fields.content}
        <textarea
          value={card.rawContent}
          maxLength={4000}
          rows={2}
          onChange={(e) => update({ rawContent: e.target.value, type: classify(e.target.value) })}
          placeholder={t.fields.contentPlaceholder}
        />
      </label>
      <label className="span-2">
        {t.fields.description}
        <input
          value={card.description}
          maxLength={2000}
          onChange={(e) => update({ description: e.target.value })}
          placeholder={t.fields.descriptionPlaceholder}
        />
      </label>
      <label>
        {t.fields.group}
        <select value={card.groupId} onChange={(e) => update({ groupId: e.target.value })}>
          <option value="">{t.ungrouped}</option>
          {groups.map((g) => (
            <option value={g.id} key={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t.fields.type}
        <select
          value={card.type}
          onChange={(e) => update({ type: e.target.value as Card['type'] })}
        >
          {cardTypes.map((ct) => (
            <option key={ct} value={ct}>
              {t.types[ct]}
            </option>
          ))}
        </select>
      </label>
      <label className="span-2">
        {t.fields.tags} <span className="muted">{t.fields.tagsHelp}</span>
        <input
          value={card.tags.join(',')}
          onChange={(e) =>
            update({
              tags: e.target.value
                .split(/[,，]/)
                .slice(0, 20)
                .map((tag) => tag.slice(0, 40)),
            })
          }
          placeholder={t.fields.tagsPlaceholder}
        />
      </label>
      <label className="span-2">
        {t.fields.note}
        <textarea
          value={card.note}
          maxLength={4000}
          rows={2}
          onChange={(e) => update({ note: e.target.value })}
          placeholder={t.fields.notePlaceholder}
        />
      </label>
    </div>
  );
}
export function ImportModal({
  onClose,
  notify,
  initialFiles = [],
  groupId = '',
}: {
  onClose: () => void;
  notify: (s: string) => void;
  initialFiles?: File[];
  groupId?: string;
}) {
  const store = useStore();
  const t = useI18n();
  const [tab, setTab] = useState<'link' | 'image' | 'camera'>(
    initialFiles.length ? 'image' : 'link',
  );
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const started = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function fromFiles(files: File[]) {
    setBusy(true);
    setError('');
    const next: Draft[] = [];
    const failures: string[] = [];
    for (const file of files.slice(0, 30)) {
      if (
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
        file.size > MAX_IMAGE_BYTES
      ) {
        failures.push(file.name + ': ' + t.importDlg.invalidImage);
        continue;
      }
      try {
        const bitmap = await createImageBitmap(file);
        const tooLarge = bitmap.width * bitmap.height > 24_000_000;
        bitmap.close();
        if (tooLarge) throw new Error(t.importDlg.tooManyPixels);
        const content = await decoderPipeline.decode(file);
        const card = makeCard(content ?? '', groupId);
        // 原图只在解码失败（如小程序花码）时保留；识别成功的二维码随时可重新生成。
        let asset: Asset | undefined;
        if (!content) {
          asset = { id: crypto.randomUUID(), blob: file };
          card.imageAssetId = asset.id;
          card.title = file.name.replace(/\.[^.]+$/, '');
        }
        next.push({ card, asset });
      } catch (e) {
        failures.push(file.name + ': ' + errorMessage(e));
      }
    }
    if (alive.current) {
      setDrafts(next);
      setIndex(0);
      setBusy(false);
      setError(failures.join('；'));
    }
  }
  useEffect(() => {
    if (initialFiles.length && !started.current) {
      started.current = true;
      void fromFiles(initialFiles);
    }
  }, []);
  useEffect(() => {
    const listener = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length && !busy) {
        e.preventDefault();
        setTab('image');
        void fromFiles(files);
      }
    };
    document.addEventListener('paste', listener);
    return () => document.removeEventListener('paste', listener);
  });
  useEffect(() => {
    if (!cameraOn || !video.current) return;
    let stopped = false;
    let scanner: import('qr-scanner').default | undefined;
    void import('qr-scanner')
      .then(async ({ default: Scanner }) => {
        if (stopped || !video.current) return;
        scanner = new Scanner(
          video.current,
          (result) => {
            if (stopped) return;
            setDrafts([{ card: makeCard(result.data, groupId) }]);
            setCameraOn(false);
          },
          { returnDetailedScanResult: true, preferredCamera: 'environment' },
        );
        await scanner.start();
      })
      .catch(() => {
        if (!stopped) {
          setError(t.importDlg.cameraError);
          setCameraOn(false);
        }
      });
    return () => {
      stopped = true;
      scanner?.destroy();
    };
  }, [cameraOn, groupId]);
  async function fromText() {
    const lines = [
      ...new Set(
        text
          .split(/\n/)
          .map((l) => l.trim())
          .filter(Boolean),
      ),
    ];
    if (!lines.length) {
      setError(t.importDlg.needInput);
      return;
    }
    if (lines.length > 30 || lines.some((l) => l.length > 4000)) {
      setError(t.importDlg.tooMany);
      return;
    }
    setBusy(true);
    setError('');
    const next = await Promise.all(
      lines.map(async (line) => {
        const card = makeCard(line, groupId);
        if (store.settings.metadata) {
          const meta = await fetchMetadata(card.rawContent);
          if (meta?.title) card.title = meta.title;
          if (meta?.description) card.description = meta.description;
        }
        return { card };
      }),
    );
    if (alive.current) {
      setDrafts(next);
      setIndex(0);
      setBusy(false);
    }
  }
  async function save() {
    if (drafts.some((d) => !d.card.title.trim() || (!d.card.rawContent.trim() && !d.asset))) {
      setError(t.importDlg.needTitle);
      return;
    }
    setBusy(true);
    setError('');
    let saved = 0;
    let skipped = 0;
    try {
      const contents = new Set(
        useStore
          .getState()
          .cards.map((c) => c.rawContent)
          .filter(Boolean),
      );
      const entries: Draft[] = [];
      for (const draft of drafts) {
        if (draft.card.rawContent && contents.has(draft.card.rawContent)) {
          skipped++;
          continue;
        }
        entries.push({
          ...draft,
          card: {
            ...draft.card,
            title: draft.card.title.trim(),
            tags: draft.card.tags.map((tag) => tag.trim()).filter(Boolean),
          },
        });
        if (draft.card.rawContent) contents.add(draft.card.rawContent);
        saved++;
      }
      await useStore.getState().saveMany(entries);
      notify(
        fmt(t.toast.savedN, { n: saved }) + (skipped ? fmt(t.toast.skipped, { n: skipped }) : ''),
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  const current = drafts[index];
  return (
    <Modal
      title={drafts.length ? t.importDlg.confirmTitle : t.importDlg.title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body">
        {!drafts.length ? (
          <>
            <div className="tabs">
              {(
                [
                  { id: 'link', label: t.importDlg.tabLink, icon: Link2 },
                  { id: 'image', label: t.importDlg.tabImage, icon: ImagePlus },
                  { id: 'camera', label: t.importDlg.tabCamera, icon: Camera },
                ] as const
              ).map((tabItem) => (
                <button
                  key={tabItem.id}
                  className={tab === tabItem.id ? 'active' : ''}
                  onClick={() => {
                    setTab(tabItem.id);
                    setCameraOn(false);
                    setError('');
                  }}
                  disabled={busy}
                >
                  <tabItem.icon size={16} />
                  {tabItem.label}
                </button>
              ))}
            </div>
            {tab === 'link' ? (
              <label className="text-entry">
                {t.importDlg.textLabel}
                <textarea
                  rows={6}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t.importDlg.textPlaceholder}
                  autoFocus
                />
                <span className="field-help">{t.importDlg.textHelp}</span>
              </label>
            ) : tab === 'image' ? (
              <div
                className="upload-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!busy) void fromFiles(Array.from(e.dataTransfer.files));
                }}
              >
                <div className="upload-icon">
                  <Upload size={26} />
                </div>
                <h3>{t.importDlg.dropTitle}</h3>
                <p>{t.importDlg.dropBody}</p>
                <button className="button" disabled={busy} onClick={() => input.current?.click()}>
                  {t.importDlg.chooseImage}
                </button>
                <small>{t.importDlg.dropHint}</small>
                <input
                  ref={input}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  hidden
                  onChange={(e) => void fromFiles(Array.from(e.target.files ?? []))}
                />
              </div>
            ) : (
              <div className="camera-zone">
                {cameraOn ? <video ref={video} muted playsInline /> : <Camera size={44} />}
                <p>{t.importDlg.cameraHint}</p>
                <button className="button" onClick={() => setCameraOn(!cameraOn)}>
                  {cameraOn ? t.importDlg.cameraStop : t.importDlg.cameraStart}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="review-nav">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setDrafts([]);
                  setError('');
                }}
              >
                <ChevronLeft size={15} />
                {t.importDlg.back}
              </button>
              <span>{fmt(t.importDlg.reviewOf, { i: index + 1, n: drafts.length })}</span>
              <div>
                <button disabled={index === 0 || busy} onClick={() => setIndex(index - 1)}>
                  {t.importDlg.prev}
                </button>
                <button
                  disabled={index === drafts.length - 1 || busy}
                  onClick={() => setIndex(index + 1)}
                >
                  {t.importDlg.next}
                </button>
              </div>
            </div>
            {current.asset && (
              <div className="image-review">
                <AssetImage blob={current.asset.blob} alt={t.card.originalThumb} />
                <p>{t.importDlg.decodeFailHint}</p>
              </div>
            )}
            <fieldset disabled={busy}>
              <CardFields
                card={current.card}
                onChange={(card) =>
                  setDrafts(drafts.map((d, i) => (i === index ? { ...d, card } : d)))
                }
              />
            </fieldset>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
      <footer className="modal-footer">
        <span className="muted">
          {busy ? (
            <>
              <Loader2 size={15} className="spin" /> {t.importDlg.processing}
            </>
          ) : (
            t.importDlg.localOnly
          )}
        </span>
        <button
          className="button primary"
          disabled={busy || (!drafts.length && tab !== 'link')}
          onClick={() => void (drafts.length ? save() : fromText())}
        >
          {drafts.length ? <Check size={16} /> : <Link2 size={16} />}{' '}
          {drafts.length ? fmt(t.importDlg.saveN, { n: drafts.length }) : t.importDlg.continue}
        </button>
      </footer>
    </Modal>
  );
}
export function EditModal({
  card,
  onClose,
  notify,
}: {
  card: Card;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const [draft, setDraft] = useState({ ...card });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = useStore((s) => s.save);
  const t = useI18n();
  return (
    <Modal title={t.editDlg.title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.title.trim() || (!draft.rawContent.trim() && !draft.imageAssetId)) {
            setError(t.editDlg.needTitle);
            return;
          }
          setBusy(true);
          try {
            await save({
              ...draft,
              title: draft.title.trim(),
              tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
              updatedAt: Date.now(),
            });
            notify(t.toast.cardUpdated);
            onClose();
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <CardFields card={draft} onChange={setDraft} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            <X size={16} />
            {t.editDlg.cancel}
          </button>
          <button className="button primary" disabled={busy}>
            {t.editDlg.save}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
