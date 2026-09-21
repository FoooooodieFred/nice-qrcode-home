import { useEffect, useRef, useId, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { modalIn, modalOut } from '../anim';
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    modalIn(dialog);
    return () => dialog.close();
  }, []);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    modalOut(ref.current!, onClose);
  };
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      className={'modal ' + (wide ? 'wide' : '')}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            requestClose();
        }
      }}
    >
      <header className="modal-header">
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
        <button className="icon-button" onClick={requestClose} aria-label="关闭">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
