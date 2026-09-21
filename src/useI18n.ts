import { useStore } from './store';
import { dictOf, setLocale } from './i18n';
/** Reactive dictionary: re-renders when the locale setting changes. */
export function useI18n() {
  const locale = useStore((s) => s.settings.locale);
  setLocale(locale);
  return dictOf(locale);
}
