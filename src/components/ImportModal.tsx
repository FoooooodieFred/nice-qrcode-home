import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronLeft,
  ImagePlus,
  Link2,
  ListPlus,
  Loader2,
  QrCode,
  Upload,
  X,
} from 'lucide-react';
import { Modal } from './Modal';
import { AssetImage } from './AssetImage';
import { useStore } from '../store';
import { makeCard, classify, domain, normalizeContent } from '../core/content';
import { decodeAll } from '../core/decode';
import { fetchMetadata } from '../core/metadata';
import { contentHash, parseAppLink, type ManifestItem } from '../core/app';
import { MAX_IMAGE_BYTES } from '../core/storage';
import { type Asset, type Card, cardTypes } from '../core/types';
import { errorMessage } from '../lib';
import { fmt } from '../i18n';
import { useI18n } from '../useI18n';
import { gsap, reducedMotion } from '../anim';
type Draft = { card: Card; asset?: Asset };
type MultiItem = { content: string; title: string; on: boolean };
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
  const [multi, setMulti] = useState<MultiItem[] | null>(null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const multiList = useRef<HTMLUListElement>(null);
  const alive = useRef(true);
  const started = useRef(false);
  const onCount = multi?.filter((item) => item.on).length ?? 0;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const el = multiList.current;
    if (el?.children.length && !reducedMotion())
      gsap.fromTo(
        el.children,
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: 'power3.out',
          stagger: 0.035,
          clearProps: 'opacity,transform',
        },
      );
  }, [multi]);
  async function fromFiles(files: File[]) {
    setBusy(true);
    setError('');
    setMulti(null);
    setSheet(false);
    const hits: string[] = [];
    const failures: string[] = [];
    const undecodable: File[] = [];
    let manifest: ManifestItem[] | null = null;
    let marker = false;
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
        const found = await decodeAll(file);
        if (!found.length) {
          undecodable.push(file);
          continue;
        }
        for (const content of found) {
          const link = parseAppLink(content);
          if (link) {
            marker = true;
            if (link.items) manifest = link.items;
          } else if (!hits.includes(content)) hits.push(content);
        }
      } catch (e) {
        failures.push(file.name + ': ' + errorMessage(e));
      }
    }
    if (!alive.current) return;
    if (hits.length > 60) {
      setBusy(false);
      setError(t.importDlg.tooManyCodes);
      return;
    }
    if (undecodable.length && hits.length)
      failures.push(fmt(t.importDlg.skippedUndecodable, { n: undecodable.length }));
    if (!hits.length) {
      if (marker) {
        setBusy(false);
        setError(t.importDlg.sheetOnlyMarker);
        return;
      }
      // 与逐张导入一致：完全解码不了的图（如小程序花码）保留原图进入确认。
      const next: Draft[] = undecodable.map((file) => {
        const asset: Asset = { id: crypto.randomUUID(), blob: file };
        const card = makeCard('', groupId);
        card.imageAssetId = asset.id;
        card.title = file.name.replace(/\.[^.]+$/, '');
        return { card, asset };
      });
      setDrafts(next);
      setIndex(0);
    } else if (hits.length === 1 && !marker) {
      setDrafts([{ card: makeCard(hits[0], groupId) }]);
      setIndex(0);
    } else {
      // 一键导入：分享图（或任何含多个二维码的图片）整体识别，清单还原名称。
      const names = new Map((manifest ?? []).map(([title, hash]) => [hash, title]));
      setMulti(
        hits.map((content) => ({
          content,
          title: names.get(contentHash(content)) ?? makeCard(content).title,
          on: true,
        })),
      );
      setSheet(marker);
    }
    setBusy(false);
    setError(failures.join('；'));
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
            setMulti(null);
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
      setMulti(null);
      setDrafts(next);
      setIndex(0);
      setBusy(false);
    }
  }
  async function saveMulti() {
    if (!multi) return;
    const chosen = multi.filter((item) => item.on);
    if (!chosen.length) {
      setError(t.importDlg.noneSelected);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const contents = new Set(
        useStore
          .getState()
          .cards.map((c) => c.rawContent)
          .filter(Boolean),
      );
      const entries: Draft[] = [];
      let skipped = 0;
      for (const item of chosen) {
        const content = normalizeContent(item.content);
        if (contents.has(content)) {
          skipped++;
          continue;
        }
        const card = makeCard(content, groupId);
        const title = item.title.trim().slice(0, 200);
        if (title) card.title = title;
        entries.push({ card });
        contents.add(content);
      }
      if (!entries.length) {
        setError(fmt(t.importDlg.allDuplicates, { n: skipped }));
        setBusy(false);
        return;
      }
      await useStore.getState().saveMany(entries);
      notify(
        fmt(t.toast.savedN, { n: entries.length }) + (skipped ? fmt(t.toast.skipped, { n: skipped }) : ''),
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
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
      title={
        multi ? t.importDlg.importTitle : drafts.length ? t.importDlg.confirmTitle : t.importDlg.title
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body">
        {multi ? (
          <>
            <div className="review-nav">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setMulti(null);
                  setSheet(false);
                  setError('');
                }}
              >
                <ChevronLeft size={15} />
                {t.importDlg.back}
              </button>
              <span>{fmt(t.importDlg.codesFound, { n: multi.length })}</span>
              <div />
            </div>
            {sheet && (
              <div className="sheet-banner">
                <span className="sheet-badge">
                  <QrCode size={11} />
                  {t.importDlg.sheetBadge}
                </span>
              </div>
            )}
            <ul className="multi-list" ref={multiList}>
              {multi.map((item, i) => (
                <li key={item.content}>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.on}
                      disabled={busy}
                      onChange={(e) =>
                        setMulti(multi.map((it, j) => (i === j ? { ...it, on: e.target.checked } : it)))
                      }
                    />
                    <span className="multi-text">
                      <strong>{item.title}</strong>
                      <small>{domain(item.content)}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <small className="field-help">{t.importDlg.multiHint}</small>
          </>
        ) : !drafts.length ? (
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
          disabled={
            busy || (!!multi && !onCount) || (!multi && !drafts.length && tab !== 'link')
          }
          onClick={() => void (multi ? saveMulti() : drafts.length ? save() : fromText())}
        >
          {multi ? <ListPlus size={16} /> : drafts.length ? <Check size={16} /> : <Link2 size={16} />}{' '}
          {multi
            ? fmt(t.importDlg.importN, { n: onCount })
            : drafts.length
              ? fmt(t.importDlg.saveN, { n: drafts.length })
              : t.importDlg.continue}
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
