import { useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Database,
  HardDrive,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Trash2,
  Monitor,
  Plus,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Modal } from './Modal';
import { useStore } from '../store';
import { parseBackup, serialize } from '../core/storage';
import type { Snapshot } from '../core/types';
import { download, errorMessage } from '../lib';
import { settingFields, getSettingValue, settingPatch } from '../registry';
import { fmt, setLocale, type Locale } from '../i18n';
import { useI18n } from '../useI18n';
export function SettingsModal({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const store = useStore();
  const { settings } = store;
  const t = useI18n();
  const [tab, setTab] = useState('appearance');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function action(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const configure = (patch: Parameters<typeof store.configure>[0]) => {
    void store.configure(patch).catch((e) => setError(errorMessage(e)));
  };
  const switchLocale = (locale: Locale) => {
    setLocale(locale);
    configure({ locale });
  };
  return (
    <Modal
      title={t.settingsDlg.title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body">
        <div className="tabs">
          <button
            className={tab === 'appearance' ? 'active' : ''}
            onClick={() => setTab('appearance')}
          >
            <Palette size={16} />
            {t.settingsDlg.tabAppearance}
          </button>
          <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>
            <Database size={16} />
            {t.settingsDlg.tabData}
          </button>
        </div>
        <fieldset disabled={busy}>
          {tab === 'appearance' ? (
            <div className="settings-stack">
              <div>
                <label className="setting-title">{t.settingsDlg.language}</label>
                <div className="segmented language-switch">
                  {(
                    [
                      { key: 'zh', name: '中文' },
                      { key: 'en', name: 'English' },
                    ] as const
                  ).map((l) => (
                    <button
                      key={l.key}
                      className={settings.locale === l.key ? 'active' : ''}
                      onClick={() => switchLocale(l.key)}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="setting-title">{t.settingsDlg.theme}</label>
                <div className="theme-options">
                  {(
                    [
                      { key: 'light', name: t.settingsDlg.themeLight, icon: Sun },
                      { key: 'dark', name: t.settingsDlg.themeDark, icon: Moon },
                      { key: 'system', name: t.settingsDlg.themeSystem, icon: Monitor },
                    ] as const
                  ).map((theme) => (
                    <button
                      key={theme.key}
                      className={settings.theme === theme.key ? 'selected' : ''}
                      onClick={() => configure({ theme: theme.key })}
                    >
                      <theme.icon size={23} />
                      {theme.name}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                {t.settingsDlg.accent}
                <div className="color-options">
                  {['#2e2e30', '#6b6257', '#5c6b7e', '#a2634e', '#5c7054'].map((c) => (
                    <button
                      key={c}
                      aria-label={fmt(t.aria.accentColor, { hex: c })}
                      className={settings.accent === c ? 'selected' : ''}
                      style={{ background: c }}
                      onClick={() => configure({ accent: c })}
                    />
                  ))}
                  <input
                    aria-label={t.aria.accentCustom}
                    type="color"
                    value={settings.accent}
                    onChange={(e) => configure({ accent: e.target.value })}
                  />
                </div>
              </label>
              <label>
                {t.settingsDlg.background}
                <select
                  value={settings.background}
                  onChange={(e) =>
                    configure({ background: e.target.value as typeof settings.background })
                  }
                >
                  <option value="paper">{t.settingsDlg.bgPaper}</option>
                  <option value="white">{t.settingsDlg.bgWhite}</option>
                  <option value="warm">{t.settingsDlg.bgWarm}</option>
                </select>
              </label>
              {settingFields.map((field) => (
                <label key={field.key}>
                  {t.settingsDlg.settingLabels[
                    field.key as keyof typeof t.settingsDlg.settingLabels
                  ] ?? field.label}
                  {field.kind === 'range' && (
                    <span className="range-value">{getSettingValue(settings, field)}</span>
                  )}
                  <input
                    type={field.kind === 'range' ? 'range' : 'text'}
                    min={field.min}
                    max={field.max}
                    maxLength={60}
                    value={getSettingValue(settings, field)}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (field.kind === 'text' && !value.trim()) return;
                      configure(
                        settingPatch(
                          settings,
                          field,
                          field.kind === 'range' ? Number(value) : value,
                        ),
                      );
                    }}
                  />
                </label>
              ))}
              <label>
                {t.settingsDlg.density}
                <select
                  value={settings.density}
                  onChange={(e) =>
                    configure({ density: e.target.value as typeof settings.density })
                  }
                >
                  <option value="comfortable">{t.settingsDlg.densityCozy}</option>
                  <option value="compact">{t.settingsDlg.densityCompact}</option>
                </select>
              </label>
              <label>
                {t.settingsDlg.qrStyle}
                <select
                  value={settings.qrStyle}
                  onChange={(e) =>
                    configure({ qrStyle: e.target.value as typeof settings.qrStyle })
                  }
                >
                  <option value="square">{t.qrDlg.styleSquare}</option>
                  <option value="dots">{t.qrDlg.styleDots}</option>
                  <option value="rounded">{t.qrDlg.styleRounded}</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="settings-stack">
              <div className="privacy-note">
                <ShieldCheck size={25} />
                <div>
                  <strong>{t.settingsDlg.privacyTitle}</strong>
                  <p>{t.settingsDlg.privacyBody}</p>
                </div>
              </div>
              <label className="toggle-row">
                <div>
                  {t.settingsDlg.toggleMeta}
                  <span>{t.settingsDlg.toggleMetaHint}</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.metadata}
                  onChange={(e) => configure({ metadata: e.target.checked })}
                />
              </label>
              <label className="toggle-row">
                <div>
                  {t.settingsDlg.toggleFavicon}
                  <span>{t.settingsDlg.toggleFaviconHint}</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.favicon}
                  onChange={(e) => configure({ favicon: e.target.checked })}
                />
              </label>
              <div className="section-rule" />
              <div className="setting-title">{t.settingsDlg.backupTitle}</div>
              <p className="muted">{t.settingsDlg.backupHelp}</p>
              <div className="data-buttons">
                <button
                  className="button"
                  onClick={() =>
                    void action(async () => {
                      const snapshot = useStore.getState();
                      const next = { ...snapshot.settings, lastBackup: Date.now() };
                      download(
                        new Blob([await serialize({ ...snapshot, settings: next })], {
                          type: 'application/json',
                        }),
                        'nice-backup-' + new Date().toISOString().slice(0, 10) + '.json',
                      );
                      await store.configure({ lastBackup: next.lastBackup });
                      notify(t.toast.backupExported);
                    })
                  }
                >
                  <ArrowDownToLine size={17} />
                  {t.settingsDlg.exportBackup}
                </button>
                <button className="button" onClick={() => input.current?.click()}>
                  <ArrowUpFromLine size={17} />
                  {t.settingsDlg.restoreBackup}
                </button>
              </div>
              <input
                hidden
                ref={input}
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file)
                    void action(async () => {
                      if (file.size > 60 * 1024 * 1024) throw new Error(t.errors.backupTooLarge);
                      setPending(await parseBackup(await file.text()));
                    });
                }}
              />
              <small className="muted">
                {settings.lastBackup
                  ? fmt(t.settingsDlg.lastBackup, {
                      time: new Date(settings.lastBackup).toLocaleString(t.htmlLang),
                    })
                  : t.settingsDlg.noBackup}
              </small>
              {pending && (
                <div className="restore-preview">
                  <strong>{t.settingsDlg.backupValid}</strong>
                  <p>
                    {fmt(t.settingsDlg.backupCounts, {
                      c: pending.cards.length,
                      g: pending.groups.length,
                      a: pending.assets.length,
                    })}
                  </p>
                  <p>{t.settingsDlg.backupReplace}</p>
                  <div className="data-buttons">
                    <button className="button" onClick={() => setPending(null)}>
                      {t.settingsDlg.cancel}
                    </button>
                    <button
                      className="button primary"
                      onClick={() =>
                        void action(async () => {
                          await store.restore(pending);
                          setPending(null);
                          notify(t.toast.backupRestored);
                        })
                      }
                    >
                      {t.settingsDlg.confirmRestore}
                    </button>
                  </div>
                </div>
              )}
              <div className="storage-info">
                <HardDrive size={16} />
                {fmt(t.settingsDlg.storageInfo, {
                  n: store.cards.length,
                  mb: (store.assets.reduce((n, a) => n + a.blob.size, 0) / 1024 / 1024).toFixed(1),
                })}
              </div>
              <button
                className="text-button danger"
                onClick={() => {
                  if (window.confirm(t.settingsDlg.confirmClear))
                    void action(async () => {
                      await store.clear();
                      notify(t.toast.dataCleared);
                    });
                }}
              >
                <Trash2 size={16} />
                {t.settingsDlg.clearData}
              </button>
              <div className="about">
                <strong>nice·qrcode</strong>
                <span>{t.settingsDlg.about}</span>
              </div>
            </div>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
export function GroupsModal({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const { groups, setGroups } = useStore();
  const t = useI18n();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(next: typeof groups) {
    setBusy(true);
    try {
      await setGroups(next.map((g, i) => ({ ...g, sortOrder: i })));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={t.groupsDlg.title} onClose={onClose}>
      <div className="modal-body">
        <form
          className="group-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              void save([
                ...groups,
                {
                  id: crypto.randomUUID(),
                  name: name.trim(),
                  sortOrder: groups.length,
                  collapsed: false,
                },
              ]);
              setName('');
            }
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.groupsDlg.newName}
            maxLength={50}
            aria-label={t.groupsDlg.newName}
          />
          <button className="button primary" disabled={busy || !name.trim()}>
            <Plus size={16} />
            {t.groupsDlg.create}
          </button>
        </form>
        {groups.map((g, i) => (
          <div className="group-edit-row" key={g.id}>
            <input
              aria-label={g.name}
              key={g.id + g.name}
              defaultValue={g.name}
              maxLength={50}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== g.name)
                  void save(groups.map((x) => (x.id === g.id ? { ...x, name: next } : x)));
                else e.target.value = g.name;
              }}
            />
            <button
              className="icon-button"
              aria-label={fmt(t.aria.moveUp, { name: g.name })}
              disabled={i === 0 || busy}
              onClick={() => {
                const next = [...groups];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                void save(next);
              }}
            >
              <ChevronUp size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={fmt(t.aria.moveDown, { name: g.name })}
              disabled={i === groups.length - 1 || busy}
              onClick={() => {
                const next = [...groups];
                [next[i + 1], next[i]] = [next[i], next[i + 1]];
                void save(next);
              }}
            >
              <ChevronDown size={16} />
            </button>
            <button
              className="icon-button danger"
              aria-label={fmt(t.aria.deleteGroup, { name: g.name })}
              disabled={busy}
              onClick={() => {
                if (window.confirm(fmt(t.groupsDlg.confirmDelete, { name: g.name }))) {
                  void save(groups.filter((x) => x.id !== g.id));
                  notify(t.toast.groupDeleted);
                }
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {!groups.length && <p className="empty-hint">{t.groupsDlg.emptyHint}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="field-help">{t.groupsDlg.help}</p>
      </div>
    </Modal>
  );
}
