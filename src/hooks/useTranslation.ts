import { useMemo } from 'react';
import { useSettingsStore, useAuthStore } from '@/store';
import { createTranslator, getDirection, type Language } from '@/lib/i18n';

/**
 * Hook to access the current translator based on the language setting.
 *
 * Urdu mode is owner-only: when language is 'ur' and the logged-in user
 * is NOT an owner, the effective language falls back to English so that
 * managers, cashiers, salesmen, etc. always see the English UI.
 * Arabic mode applies to ALL roles.
 *
 * Returns:
 *  - `t(key, ...args)` — translate a dot-path key with optional placeholders
 *  - `lang` — effective language code
 *  - `dir` — text direction ('ltr' | 'rtl')
 *  - `isRTL` — convenience boolean
 */
export function useTranslation() {
  const { settings } = useSettingsStore();
  const { currentUser } = useAuthStore();
  const selectedLang = (settings.language || 'en') as Language;

  // Urdu is owner/superadmin-only: if another role is logged in, fall back to English.
  // Before login (currentUser is null) respect the setting as-is.
  const lang: Language =
    selectedLang === 'ur' && currentUser != null && currentUser.role !== 'owner' && currentUser.role !== 'superadmin'
      ? 'en'
      : selectedLang;

  const t = useMemo(() => createTranslator(lang), [lang]);
  const dir = getDirection(lang);
  const isRTL = dir === 'rtl';

  return { t, lang, dir, isRTL };
}
