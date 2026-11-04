import { useKeydown } from '@/lib/use-keydown';

/** Digit shortcuts 1–9 for the alternatives of a step, while `enabled`. */
export function useDigitKeys(count: number, onDigit: (index: number) => void, enabled: boolean) {
  useKeydown((event) => {
    if (!/^[1-9]$/.test(event.key)) return;
    const index = Number(event.key) - 1;
    if (index >= count) return;
    event.preventDefault();
    onDigit(index);
  }, enabled);
}

/** Enter submits the step, while `enabled` (not inside text fields or on buttons). */
export function useEnterKey(onEnter: () => void, enabled: boolean) {
  useKeydown((event) => {
    if (event.key !== 'Enter') return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, a[href], [role="button"]')) {
      return;
    }
    event.preventDefault();
    onEnter();
  }, enabled);
}
