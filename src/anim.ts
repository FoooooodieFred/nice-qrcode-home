import gsap from 'gsap';

export { gsap };

export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Global GSAP press feedback for every button. Attached once from App,
 * so any small operation — chips, icon buttons, menu items — gets a
 * non-linear squash-and-release without per-component wiring.
 */
export function attachPressFeedback(): () => void {
  if (reducedMotion()) return () => {};
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const el = (event.target as HTMLElement | null)?.closest?.(
      'button',
    ) as HTMLButtonElement | null;
    if (!el || el.disabled || el.classList.contains('drag-handle')) return;
    gsap
      .timeline()
      .to(el, { scale: 0.955, duration: 0.09, ease: 'power2.out' })
      .to(el, { scale: 1, duration: 0.34, ease: 'back.out(2.4)' });
  };
  document.addEventListener('pointerdown', onDown);
  return () => document.removeEventListener('pointerdown', onDown);
}

/** Card hover lift, delegated so it also covers cards mounted later. */
export function attachCardHover(): () => void {
  if (reducedMotion()) return () => {};
  const cardOf = (event: Event) =>
    (event.target as HTMLElement | null)?.closest?.('.collection-card') as HTMLElement | null;
  const liftOf = (card: HTMLElement) => card.querySelector<HTMLElement>('.card-lift');
  const onOver = (event: MouseEvent) => {
    const card = cardOf(event);
    if (!card || card.classList.contains('dragging')) return;
    const lift = liftOf(card);
    if (lift)
      gsap.to(lift, {
        y: -5,
        duration: 0.4,
        ease: 'power3.out',
        overwrite: 'auto',
      });
  };
  const onOut = (event: MouseEvent) => {
    const card = cardOf(event);
    if (!card) return;
    if (event.relatedTarget && card.contains(event.relatedTarget as Node)) return;
    const lift = liftOf(card);
    if (lift)
      gsap.to(lift, {
        y: 0,
        duration: 0.45,
        ease: 'power3.out',
        overwrite: 'auto',
      });
  };
  document.addEventListener('mouseover', onOver);
  document.addEventListener('mouseout', onOut);
  return () => {
    document.removeEventListener('mouseover', onOver);
    document.removeEventListener('mouseout', onOut);
  };
}

/** Mount entrance for a card: rise + fade with a per-index cascade delay. */
export function enterCard(el: HTMLElement, index: number) {
  if (reducedMotion()) return;
  gsap.fromTo(
    el,
    { opacity: 0, y: 22 },
    {
      opacity: 1,
      y: 0,
      duration: 0.6,
      ease: 'power3.out',
      delay: Math.min(index, 12) * 0.05,
      clearProps: 'opacity,transform',
    },
  );
}

/** Pop used by toggles such as the favorite star. */
export function pop(el: Element | null, strength = 1.35) {
  if (!el || reducedMotion()) return;
  gsap
    .timeline()
    .to(el, { scale: strength, duration: 0.18, ease: 'back.out(3)' })
    .to(el, { scale: 1, duration: 0.22, ease: 'power2.out' });
}

/** Small contextual surface (card menu, chips row) popping from its origin. */
export function surfaceIn(el: HTMLElement, transformOrigin = 'top right') {
  if (reducedMotion()) return;
  gsap.fromTo(
    el,
    { opacity: 0, scale: 0.92, y: -6 },
    {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.26,
      ease: 'back.out(1.7)',
      transformOrigin,
      clearProps: 'transform,transformOrigin',
    },
  );
}

/** Fade a block of children out in cascade (group collapse). */
export function cascadeOut(els: Element[], onComplete: () => void) {
  if (reducedMotion() || !els.length) {
    onComplete();
    return;
  }
  gsap.to(els, {
    opacity: 0,
    y: -14,
    scale: 0.97,
    duration: 0.26,
    ease: 'power2.in',
    stagger: { each: 0.025, from: 'start' },
    onComplete,
  });
}

/** Exit animation before a card is removed from the store. */
export function exitCard(el: HTMLElement, onComplete: () => void) {
  if (reducedMotion()) {
    onComplete();
    return;
  }
  gsap.to(el, {
    opacity: 0,
    scale: 0.92,
    duration: 0.3,
    ease: 'power2.in',
    onComplete,
  });
}

/** Modal panel entrance; ::backdrop gets a CSS keyframe (pseudo elements are not tweenable). */
export function modalIn(el: HTMLElement) {
  if (reducedMotion()) return;
  gsap.fromTo(
    el,
    { opacity: 0, y: 26, scale: 0.965 },
    { opacity: 1, y: 0, scale: 1, duration: 0.46, ease: 'power3.out', clearProps: 'all' },
  );
}

export function modalOut(el: HTMLElement, onComplete: () => void) {
  if (reducedMotion()) {
    onComplete();
    return;
  }
  gsap.to(el, {
    opacity: 0,
    y: 16,
    scale: 0.98,
    duration: 0.2,
    ease: 'power2.in',
    onComplete,
  });
}

/** Toast slide in with a slight overshoot. */
export function toastIn(el: HTMLElement) {
  if (reducedMotion()) return;
  gsap.fromTo(
    el,
    { y: 20, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.6)' },
  );
}

export function toastOut(el: HTMLElement, onComplete: () => void) {
  if (reducedMotion()) {
    onComplete();
    return;
  }
  gsap.to(el, { y: 12, opacity: 0, duration: 0.22, ease: 'power2.in', onComplete });
}
