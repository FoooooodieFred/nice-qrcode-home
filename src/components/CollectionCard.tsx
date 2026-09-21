import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  GripVertical,
  MoreHorizontal,
  Pencil,
  QrCode,
  Star,
  Trash2,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card } from '../core/types';
import { domain, safeUrl } from '../core/content';
import { useStore } from '../store';
import { cardActions } from '../registry';
import { enterCard, gsap, pop, surfaceIn } from '../anim';
import { fmt } from '../i18n';
import { useI18n } from '../useI18n';
import { AssetImage } from './AssetImage';
export function CollectionCard({
  card,
  index,
  qr,
  edit,
  remove,
  run,
  draggable,
  selecting = false,
  selected = false,
  onToggleSelect = () => {},
}: {
  card: Card;
  index: number;
  qr: () => void;
  edit: () => void;
  remove: (el: HTMLElement) => void;
  run: (fn: () => Promise<void>) => void;
  draggable: boolean;
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !draggable,
  });
  const root = useRef<HTMLElement | null>(null);
  const lift = useRef<HTMLDivElement>(null);
  const star = useRef<SVGSVGElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const checkRef = useRef<HTMLSpanElement>(null);
  const wasDragging = useRef(false);
  const [broken, setBroken] = useState(false);
  const [menu, setMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const { settings, save, assets } = useStore();
  const t = useI18n();
  const asset = assets.find((a) => a.id === card.imageAssetId);
  const url = safeUrl(card.rawContent);
  let favicon = '';
  try {
    const u = new URL(card.rawContent);
    if (['https:', 'http:'].includes(u.protocol)) favicon = u.origin + '/favicon.ico';
  } catch {
    /* no remote icon for text */
  }
  useEffect(() => {
    if (lift.current) enterCard(lift.current, index);
  }, []);
  useEffect(() => {
    const el = lift.current;
    if (!el || isDragging === wasDragging.current) return;
    wasDragging.current = isDragging;
    gsap.to(el, {
      scale: isDragging ? 1.03 : 1,
      boxShadow: isDragging ? '0 20px 46px rgba(0,0,0,0.16)' : '0 0 0 rgba(0,0,0,0)',
      duration: isDragging ? 0.3 : 0.4,
      ease: 'power3.out',
      overwrite: 'auto',
      onComplete: isDragging ? undefined : () => gsap.set(el, { clearProps: 'scale,boxShadow' }),
    });
  }, [isDragging]);
  useEffect(() => {
    if (menu && menuRef.current) surfaceIn(menuRef.current);
  }, [menu]);
  // gsap 的 transform 会让卡片形成独立堆叠上下文，菜单改挂到 body 顶层；
  // 关闭统一走全局监听：卡片与菜单以外任意按下、Esc、滚动或缩放。
  useEffect(() => {
    if (!menu) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (root.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenu(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    const onMove = () => setMenu(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    // IAB/内嵌视图中页面滚动的 scroll 事件可能不以 window 为路径终点，
    // 因此 window/document 双挂 + wheel/touchmove 兜底，用户滚动必然关闭。
    window.addEventListener('scroll', onMove, true);
    document.addEventListener('scroll', onMove, true);
    window.addEventListener('wheel', onMove, { passive: true, capture: true });
    window.addEventListener('touchmove', onMove, { passive: true, capture: true });
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      document.removeEventListener('scroll', onMove, true);
      window.removeEventListener('wheel', onMove, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchmove', onMove, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', onMove);
    };
  }, [menu]);
  const openMenu = () => {
    const rect = moreRef.current!.getBoundingClientRect();
    const estimated = 215;
    const below = rect.bottom + 6;
    const top =
      below + estimated > window.innerHeight ? Math.max(8, rect.top - estimated - 6) : below;
    setMenuPos({ top, right: window.innerWidth - rect.right });
    setMenu(true);
  };
  return (
    <article
      className={
        'collection-card' +
        (isDragging ? ' dragging' : '') +
        (selecting ? ' selecting' : '') +
        (selected ? ' selected' : '')
      }
      ref={(node) => {
        setNodeRef(node);
        root.current = node;
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="card-lift" ref={lift}>
        {selecting ? (
          <button
            className="card-stretch"
            onClick={() => {
              pop(checkRef.current);
              onToggleSelect();
            }}
            aria-pressed={selected}
            aria-label={fmt(t.aria.selectCard, { name: card.title })}
          />
        ) : url ? (
          <a className="card-stretch" href={url} target="_blank" rel="noopener noreferrer">
            <span className="visually-hidden">{fmt(t.aria.openCard, { name: card.title })}</span>
          </a>
        ) : (
          <button
            className="card-stretch"
            onClick={qr}
            aria-label={fmt(t.aria.viewQr, { name: card.title })}
          />
        )}
        {selecting && (
          <span className={'card-check' + (selected ? ' on' : '')} aria-hidden="true">
            <span className="card-check-dot" ref={checkRef}>
              {selected && <Check size={13} strokeWidth={3} />}
            </span>
          </span>
        )}
        <div className="card-face">
          <div className="card-head">
            <div className={'card-icon type-' + card.type}>
              {asset && card.type === 'mini' ? (
                <AssetImage blob={asset.blob} alt={t.card.originalThumb} />
              ) : settings.favicon && favicon && !broken ? (
                <img
                  src={favicon}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={() => setBroken(true)}
                />
              ) : (
                card.title.slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="card-titles">
              <h3>{card.title}</h3>
              <p className="card-domain" title={card.rawContent}>
                {card.type === 'web' ? domain(card.rawContent) : t.types[card.type]}
              </p>
            </div>
          </div>
          {(card.description || card.note) && (
            <p className="card-desc">{card.description || card.note}</p>
          )}
        </div>
        <div className={'card-actions' + (card.favorite ? ' has-favorite' : '')}>
          <button
            className={'icon-button favorite' + (card.favorite ? ' is-favorite' : '')}
            aria-label={
              card.favorite
                ? fmt(t.aria.unstar, { name: card.title })
                : fmt(t.aria.star, { name: card.title })
            }
            onClick={() => {
              pop(star.current);
              run(() => save({ ...card, favorite: !card.favorite, updatedAt: Date.now() }));
            }}
          >
            <Star ref={star} size={15} fill={card.favorite ? 'currentColor' : 'none'} />
          </button>
          <button
            className="icon-button"
            aria-label={fmt(t.aria.viewQr, { name: card.title })}
            onClick={() => {
              setMenu(false);
              qr();
            }}
          >
            <QrCode size={16} />
          </button>
          {draggable && (
            <button
              className="icon-button drag-handle"
              aria-label={fmt(t.aria.drag, { name: card.title })}
              {...attributes}
              {...listeners}
            >
              <GripVertical size={16} />
            </button>
          )}
          <button
            className="icon-button"
            ref={moreRef}
            aria-label={fmt(t.aria.more, { name: card.title })}
            aria-expanded={menu}
            onClick={() => (menu ? setMenu(false) : openMenu())}
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
        {menu &&
          createPortal(
            <div className="card-menu" ref={menuRef} style={menuPos}>
            <button
              onClick={() => {
                setMenu(false);
                edit();
              }}
            >
              <Pencil size={15} />
              {t.card.edit}
            </button>
            <button
              disabled={!card.rawContent}
              onClick={() =>
                run(async () => {
                  await navigator.clipboard.writeText(card.rawContent);
                  setMenu(false);
                })
              }
            >
              <Copy size={15} />
              {t.card.copy}
            </button>
            {cardActions
              .filter((a) => !a.available || a.available(card))
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() =>
                    run(async () => {
                      await a.run(card);
                      setMenu(false);
                    })
                  }
                >
                  {a.label}
                </button>
              ))}
            <button
              className="danger"
              onClick={() => {
                setMenu(false);
                remove(root.current!);
              }}
            >
              <Trash2 size={15} />
              {t.card.remove}
            </button>
            </div>,
            document.body,
          )}
      </div>
    </article>
  );
}
