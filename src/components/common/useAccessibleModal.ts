import { useEffect, useRef } from 'react';

interface UseAccessibleModalOptions {
  isOpen: boolean;
  onClose: () => void;
  disabled?: boolean;
  closeOnEscape?: boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && (el.offsetParent !== null || el === document.activeElement)
  );
}

/**
 * Provides Escape-key dismissal, focus trapping, and focus restoration for accessible modal dialogs.
 */
export function useAccessibleModal({
  isOpen,
  onClose,
  disabled = false,
  closeOnEscape = true,
}: UseAccessibleModalOptions) {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const container = modalRef.current;

    if (container) {
      const autofocusTarget = container.querySelector<HTMLElement>('[data-autofocus]');
      const focusables = getFocusableElements(container);
      const initialTarget = autofocusTarget || focusables[0] || container;
      if (initialTarget && !container.contains(document.activeElement)) {
        initialTarget.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        if (!disabled) {
          e.preventDefault();
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = getFocusableElements(modalRef.current);
        if (focusables.length === 0) {
          e.preventDefault();
          modalRef.current.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          if (!active || active === first || !modalRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (!active || active === last || !modalRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
    };
  }, [isOpen, disabled]);

  return modalRef;
}
