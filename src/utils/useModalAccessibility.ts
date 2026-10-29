import { useEffect, useId, useRef } from 'react';
type Entry = { id: string; dialog: HTMLDivElement; wrapper: HTMLElement | null; previousZIndex: string };
const modalStack: Entry[] = [];
let previousBodyOverflow = '';
type ModalAccessibilityOptions = { isOpen: boolean; onClose: () => void; titleId: string };
const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function focusables(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(selector)].filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]') && element.getAttribute('aria-hidden') !== 'true');
}
function updateLayers() {
  modalStack.forEach(({ dialog, wrapper }, index) => {
    const hidden = index !== modalStack.length - 1;
    if (wrapper) wrapper.style.zIndex = String(100 + index * 10);
    dialog.inert = hidden;
    dialog.setAttribute('aria-hidden', String(hidden));
  });
}
/** Dialog focus/escape/restore and body lock, shared safely across nested layers. */
export function useModalAccessibility({ isOpen, onClose, titleId }: ModalAccessibilityOptions) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const id = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog || typeof document === 'undefined') return;
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const wrapper = dialog.parentElement;
    const entry = { id: `${titleId}-${id}`, dialog, wrapper, previousZIndex: wrapper?.style.zIndex ?? '' };
    if (!modalStack.length) { previousBodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    modalStack.push(entry);
    updateLayers();
    const isTop = () => modalStack.at(-1) === entry;
    const focusInitial = () => { if (isTop()) (focusables(dialog)[0] ?? dialog).focus(); };
    const onFocusIn = (event: FocusEvent) => { if (isTop() && event.target instanceof Node && !dialog.contains(event.target)) focusInitial(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const elements = focusables(dialog);
      const first = elements[0]; const last = elements.at(-1);
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    const frame = requestAnimationFrame(focusInitial);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      const wasTop = isTop();
      const index = modalStack.indexOf(entry);
      if (index >= 0) modalStack.splice(index, 1);
      dialog.inert = false; dialog.removeAttribute('aria-hidden');
      if (wrapper) wrapper.style.zIndex = entry.previousZIndex;
      updateLayers();
      if (!modalStack.length) document.body.style.overflow = previousBodyOverflow;
      if (wasTop && restore?.isConnected && !restore.closest('[inert]')) restore.focus();
      else if (wasTop && modalStack.length) (focusables(modalStack.at(-1)!.dialog)[0] ?? modalStack.at(-1)!.dialog).focus();
    };
  }, [id, isOpen, titleId]);
  return { dialogRef };
}
