import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Settings2,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from './store';
import { type Card, cardTypes } from './core/types';
import { makeCard } from './core/content';
import { exportQrSheet } from './core/sheet';
import { errorMessage } from './lib';
import { fmt } from './i18n';
import { useI18n } from './useI18n';
import {
  attachCardHover,
  attachPressFeedback,
  cascadeOut,
  exitCard,
  gsap,
  reducedMotion,
  toastIn,
  toastOut,
} from './anim';
import { ImportModal, EditModal } from './components/ImportModal';
import { QrModal } from './components/QrModal';
import { SettingsModal, GroupsModal } from './components/SettingsModal';
import { CollectionCard } from './components/CollectionCard';
type View = 'all' | 'favorites' | string;
export default function App() {
  const store = useStore();
  const { cards, groups, settings, ready, error } = store;
  const t = useI18n();
  const [view, setView] = useState<View>('all');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('manual');
  const [modal, setModal] = useState<'import' | 'settings' | 'groups' | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<Card | null>(null);
  const [qr, setQr] = useState<Card | null>(null);
  const [toast, setToast] = useState('');
  const [sampleBusy, setSampleBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const searchField = useRef<HTMLDivElement>(null);
  const sections = useRef<Map<string, HTMLElement>>(new Map());
  const emptyRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const notify = (message: string) => setToast(message);
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      notify(errorMessage(e));
    }
  };
  useEffect(() => {
    void store.refresh();
    const detachPress = attachPressFeedback();
    const detachHover = attachCardHover();
    return () => {
      detachPress();
      detachHover();
    };
  }, []);
  useEffect(() => {
    if (!['all', 'favorites', 'ungrouped'].includes(view) && !groups.some((g) => g.id === view))
      setView('all');
  }, [groups, view]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme;
      document.documentElement.dataset.background = settings.background;
      document.documentElement.style.setProperty('--accent', settings.accent);
      document.documentElement.style.setProperty('--radius', settings.radius + 'px');
      document.documentElement.style.setProperty('--columns', String(settings.columns));
      document.documentElement.dataset.density = settings.density;
      document.documentElement.lang = t.htmlLang;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings, t]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selecting && !document.querySelector('dialog[open]')) {
        setSelecting(false);
        setSelected(new Set());
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',' && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        setModal('settings');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        if (!document.querySelector('dialog[open]')) {
          e.preventDefault();
          search.current?.focus();
        }
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [selecting]);
  useEffect(() => {
    const listener = (e: ClipboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      const pasted = Array.from(e.clipboardData?.files ?? []);
      if (pasted.length) {
        e.preventDefault();
        setFiles(pasted);
        setModal('import');
      }
    };
    document.addEventListener('paste', listener);
    return () => document.removeEventListener('paste', listener);
  }, []);
  useEffect(() => {
    const empty = emptyRef.current;
    if (empty && !reducedMotion())
      gsap.fromTo(
        empty.children,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.08 },
      );
  }, [ready, cards.length, error]);
  const stretchSearch = (focused: boolean) => {
    const field = searchField.current;
    if (!field || reducedMotion() || window.innerWidth < 760) return;
    gsap.to(field, {
      width: focused ? Math.min(470, window.innerWidth - 380) : 300,
      duration: 0.55,
      ease: 'power3.out',
    });
  };
  const openImport = () => {
    setFiles([]);
    setModal('import');
  };
  const filtered = cards
    .filter(
      (c) =>
        (view === 'all' ||
          (view === 'favorites'
            ? c.favorite
            : view === 'ungrouped'
              ? !c.groupId
              : c.groupId === view)) &&
        (type === 'all' || c.type === type) &&
        [c.title, c.description, c.rawContent, c.note, ...c.tags]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, t.htmlLang)
        : sort === 'newest'
          ? b.createdAt - a.createdAt
          : a.sortOrder - b.sortOrder,
    );
  const draggable = sort === 'manual' && !query && type === 'all' && view !== 'favorites';
  async function dragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const active = cards.find((c) => c.id === event.active.id),
      over = cards.find((c) => c.id === event.over!.id);
    if (!active || !over || active.groupId !== over.groupId) return;
    const list = cards
      .filter((c) => c.groupId === active.groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const reordered = arrayMove(
      list,
      list.findIndex((c) => c.id === active.id),
      list.findIndex((c) => c.id === over.id),
    ).map((c, i) => ({ ...c, sortOrder: i }));
    await store.reorder(reordered);
  }
  async function samples() {
    setSampleBusy(true);
    try {
      const seeds = t.samples.groups.map((name, i) => ({
        id: crypto.randomUUID(),
        name,
        sortOrder: i,
        collapsed: false,
      }));
      await store.setGroups([...groups, ...seeds]);
      for (const [title, url, description, group, tags] of t.samples.cards)
        await store.save({
          ...makeCard(url, seeds[group].id),
          title,
          description,
          tags: [...tags],
          favorite: title === 'Figma' || title === 'Notion',
        });
      notify(t.toast.samplesAdded);
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setSampleBusy(false);
    }
  }
  const ungroupedCollapsed = settings.extensions['ungroupedCollapsed'] === true;
  const toggleGroup = (id: string, next: boolean) => {
    const persist = id
      ? () => store.setGroups(groups.map((g) => (g.id === id ? { ...g, collapsed: !next } : g)))
      : () =>
          store.configure({
            extensions: { ...settings.extensions, ungroupedCollapsed: !next },
          });
    const section = sections.current.get(id);
    if (!next && section)
      cascadeOut(Array.from(section.querySelectorAll('.card-lift')), () => void run(persist));
    else void run(persist);
  };
  const exportSheet = (title: string, list: Card[], fileName?: string) => {
    if (!list.length) {
      notify(t.toast.noneToExport);
      return;
    }
    setExporting(true);
    exportQrSheet({
      title,
      cards: list,
      assets: store.assets,
      style: settings.qrStyle,
      fileName,
    })
      .then((count) => notify(count ? fmt(t.toast.exported, { n: count }) : t.toast.noneToExport))
      .catch((e) => notify(errorMessage(e)))
      .finally(() => setExporting(false));
  };
  const exitSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedCards = cards.filter((c) => selected.has(c.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggleAll = () =>
    setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((c) => c.id)));
  async function batchStar() {
    const target = !selectedCards.every((c) => c.favorite);
    await store.saveMany(
      selectedCards.map((c) => ({ card: { ...c, favorite: target, updatedAt: Date.now() } })),
    );
    notify(target ? t.toast.starredSelected : t.toast.unstarredSelected);
  }
  async function batchMove(groupId: string) {
    await store.saveMany(
      selectedCards.map((c) => ({ card: { ...c, groupId, updatedAt: Date.now() } })),
    );
    notify(
      fmt(t.toast.moved, {
        n: selectedCards.length,
        name: groupId ? (groups.find((g) => g.id === groupId)?.name ?? t.ungrouped) : t.ungrouped,
      }),
    );
  }
  async function batchDelete() {
    if (!window.confirm(fmt(t.confirm.deleteSelected, { n: selectedCards.length }))) return;
    for (const card of selectedCards) await store.remove(card.id);
    setSelected(new Set());
    notify(t.toast.deletedSelected);
  }
  const sectionGroups =
    view === 'favorites'
      ? [{ id: 'virtual', name: t.favorites, collapsed: false }]
      : [
          ...groups,
          ...(cards.some((c) => !c.groupId)
            ? [{ id: '', name: t.ungrouped, collapsed: ungroupedCollapsed }]
            : []),
        ].filter((g) => view === 'all' || (view === 'ungrouped' ? g.id === '' : g.id === view));
  const chips = [
    { id: 'all', name: t.all, count: cards.length },
    { id: 'favorites', name: t.favorites, count: cards.filter((c) => c.favorite).length },
    ...groups.map((g) => ({
      id: g.id,
      name: g.name,
      count: cards.filter((c) => c.groupId === g.id).length,
    })),
    ...(cards.some((c) => !c.groupId)
      ? [{ id: 'ungrouped', name: t.ungrouped, count: cards.filter((c) => !c.groupId).length }]
      : []),
  ];
  return (
    <div
      className="app-shell"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (!document.querySelector('dialog[open]') && e.dataTransfer.files.length) {
          setFiles(Array.from(e.dataTransfer.files));
          setModal('import');
        }
      }}
    >
      <header className="top-header">
        <button className="brand" onClick={() => setView('all')} aria-label={t.aria.backToAll}>
          nice<span className="brand-dot">·</span>qrcode
        </button>
        <div className="search-field" ref={searchField}>
          <Search size={16} />
          <input
            ref={search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => stretchSearch(true)}
            onBlur={() => stretchSearch(false)}
            placeholder={t.searchPlaceholder}
            aria-label={t.aria.search}
          />
          {query ? (
            <button
              className="icon-button"
              aria-label={t.aria.clearSearch}
              onClick={() => setQuery('')}
            >
              <X size={13} />
            </button>
          ) : (
            <kbd>Ctrl K</kbd>
          )}
        </div>
        <button className="add-button" onClick={openImport}>
          <Plus size={17} />
          {t.add}
        </button>
        <button
          className="icon-button settings-toggle"
          aria-label={t.settings}
          onClick={() => setModal('settings')}
        >
          <Settings2 size={18} />
        </button>
      </header>
      <div className="filter-row">
        <div className="chips" role="tablist">
          {chips.map((chip) => (
            <button
              key={chip.id}
              className={'chip' + (view === chip.id ? ' active' : '')}
              onClick={() => setView(chip.id)}
            >
              {chip.name}
              <small>{chip.count}</small>
            </button>
          ))}
          <button
            className="icon-button chip-manage"
            aria-label={t.aria.manageGroups}
            title={t.aria.manageGroups}
            onClick={() => setModal('groups')}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="quiet-controls">
          <button
            className={'select-mode-button' + (selecting ? ' active' : '')}
            onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
          >
            {selecting ? t.done : t.selectMode}
          </button>
          <select
            aria-label={t.aria.typeFilter}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">{t.allTypes}</option>
            {cardTypes.map((ct) => (
              <option value={ct} key={ct}>
                {t.types[ct]}
              </option>
            ))}
          </select>
          <select
            aria-label={t.aria.sortOrder}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="manual">{t.sortManual}</option>
            <option value="newest">{t.sortNewest}</option>
            <option value="title">{t.sortTitle}</option>
          </select>
        </div>
      </div>
      <main>
        {error ? (
          <div className="error storage-error" role="alert">
            {error}
            <button className="button" onClick={() => void store.refresh()}>
              {t.errors.retry}
            </button>
          </div>
        ) : !ready ? (
          <div className="empty-state">{t.loading}</div>
        ) : cards.length === 0 ? (
          <div className="empty-state welcome-empty" ref={emptyRef}>
            <h2>{t.welcome.title}</h2>
            <p>{t.welcome.body}</p>
            <div className="empty-buttons">
              <button className="button primary" onClick={openImport}>
                <Plus size={16} />
                {t.welcome.addFirst}
              </button>
              <button className="button" disabled={sampleBusy} onClick={() => void samples()}>
                {sampleBusy ? t.welcome.samplesBusy : t.welcome.samples}
                <ArrowUpRight size={14} />
              </button>
            </div>
            <span className="empty-tip">{t.welcome.tip}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" ref={emptyRef}>
            <h2>{query || type !== 'all' ? t.noResults.title : t.emptyGroup.title}</h2>
            <p>{query || type !== 'all' ? t.noResults.body : t.emptyGroup.body}</p>
            <button
              className="button"
              onClick={() => {
                if (query || type !== 'all') {
                  setQuery('');
                  setType('all');
                } else openImport();
              }}
            >
              {query || type !== 'all' ? t.noResults.clear : t.emptyGroup.add}
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => void run(() => dragEnd(e))}
          >
            {sectionGroups.map((group) => {
              const items =
                group.id === 'virtual' ? filtered : filtered.filter((c) => c.groupId === group.id);
              if (!items.length) return null;
              const collapsed = group.collapsed && !query;
              return (
                <section
                  className="collection-group"
                  key={group.id}
                  ref={(node) => {
                    if (node) sections.current.set(group.id, node);
                    else sections.current.delete(group.id);
                  }}
                >
                  {view !== 'favorites' && (
                    <div className="group-heading">
                      <button
                        className="group-toggle"
                        onClick={() => toggleGroup(group.id, collapsed)}
                        aria-expanded={!collapsed}
                      >
                        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        <h3>{group.name}</h3>
                        <span>{items.length}</span>
                      </button>
                      <div className="group-line" />
                      <button
                        className="icon-button"
                        aria-label={fmt(t.aria.exportGroupQr, { name: group.name })}
                        title={t.aria.exportGroupQrTitle}
                        disabled={exporting}
                        onClick={() => exportSheet(group.name, items)}
                      >
                        <ArrowDownToLine size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={fmt(t.aria.addToGroup, { name: group.name })}
                        onClick={() => {
                          setView(group.id || 'ungrouped');
                          openImport();
                        }}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  )}
                  {!collapsed && (
                    <SortableContext items={items.map((c) => c.id)} strategy={rectSortingStrategy}>
                      <div className="card-grid">
                        {items.map((card, i) => (
                          <CollectionCard
                            key={card.id}
                            card={card}
                            index={i}
                            draggable={draggable && !selecting}
                            selecting={selecting}
                            selected={selected.has(card.id)}
                            onToggleSelect={() => toggleSelect(card.id)}
                            qr={() => setQr(card)}
                            edit={() => setEditing(card)}
                            run={(fn) => void run(fn)}
                            remove={(el) => {
                              if (window.confirm(fmt(t.confirm.deleteCard, { name: card.title })))
                                exitCard(
                                  el,
                                  () =>
                                    void run(async () => {
                                      await store.remove(card.id);
                                      notify(t.toast.cardDeleted);
                                    }),
                                );
                            }}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  )}
                </section>
              );
            })}
          </DndContext>
        )}
      </main>
      {modal === 'import' && (
        <ImportModal
          initialFiles={files}
          groupId={groups.some((g) => g.id === view) ? view : ''}
          onClose={() => setModal(null)}
          notify={notify}
        />
      )}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} notify={notify} />}
      {modal === 'groups' && <GroupsModal onClose={() => setModal(null)} notify={notify} />}
      {editing && <EditModal card={editing} onClose={() => setEditing(null)} notify={notify} />}
      {qr && <QrModal card={qr} onClose={() => setQr(null)} notify={notify} />}
      {selecting && (
        <BatchBar
          count={selected.size}
          allSelected={allFilteredSelected}
          allStarred={selectedCards.length > 0 && selectedCards.every((c) => c.favorite)}
          groups={groups}
          busy={exporting}
          onToggleAll={toggleAll}
          onStar={() => void run(batchStar)}
          onMove={(gid) => void run(() => batchMove(gid))}
          onExport={() => exportSheet(t.sheet.selectionTitle, selectedCards)}
          onDelete={() => void run(batchDelete)}
          onDone={exitSelecting}
        />
      )}
      {toast &&
        createPortal(
          <Toast text={toast} onDismiss={() => setToast('')} />,
          document.querySelector('dialog[open]') ?? document.body,
        )}
    </div>
  );
}
function Toast({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const t = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const dismiss = () => {
    if (done.current || !ref.current) return;
    done.current = true;
    toastOut(ref.current, onDismiss);
  };
  useEffect(() => {
    const el = ref.current!;
    toastIn(el);
    const timer = setTimeout(dismiss, 3600);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="toast" role="status" ref={ref}>
      <Check size={16} />
      {text}
      <button className="icon-button" aria-label={t.aria.closeToast} onClick={dismiss}>
        <X size={14} />
      </button>
    </div>
  );
}
function BatchBar({
  count,
  allSelected,
  allStarred,
  groups,
  busy,
  onToggleAll,
  onStar,
  onMove,
  onExport,
  onDelete,
  onDone,
}: {
  count: number;
  allSelected: boolean;
  allStarred: boolean;
  groups: { id: string; name: string }[];
  busy: boolean;
  onToggleAll: () => void;
  onStar: () => void;
  onMove: (groupId: string) => void;
  onExport: () => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const t = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (!reducedMotion())
      gsap.fromTo(
        el,
        { y: 90, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, ease: 'power3.out', clearProps: 'transform' },
      );
  }, []);
  return (
    <div className="batch-bar" ref={ref} role="toolbar" aria-label={t.aria.batchToolbar}>
      <strong>{fmt(t.batch.selected, { n: count })}</strong>
      <button onClick={onToggleAll}>{allSelected ? t.batch.deselectAll : t.batch.selectAll}</button>
      <button onClick={onStar} disabled={!count || busy}>
        <Star size={14} fill={allStarred ? 'currentColor' : 'none'} />
        {allStarred ? t.batch.unstar : t.batch.star}
      </button>
      <select
        value=""
        disabled={!count || busy}
        aria-label={t.aria.moveToGroup}
        onChange={(e) => {
          if (e.target.value) onMove(e.target.value === '-' ? '' : e.target.value);
        }}
      >
        <option value="">{t.batch.moveTo}</option>
        <option value="-">{t.ungrouped}</option>
        {groups.map((g) => (
          <option value={g.id} key={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <button onClick={onExport} disabled={!count || busy}>
        <ArrowDownToLine size={14} />
        {t.batch.exportQr}
      </button>
      <button className="danger" onClick={onDelete} disabled={!count || busy}>
        <Trash2 size={14} />
        {t.batch.remove}
      </button>
      <button onClick={onDone}>
        <X size={14} />
        {t.done}
      </button>
    </div>
  );
}
