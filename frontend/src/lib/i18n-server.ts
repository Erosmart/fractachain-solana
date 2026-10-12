import { cookies } from 'next/headers';
import { dictionaries, type Locale, type Messages } from './i18n';

/**
 * Server-side locale resolution. The client provider mirrors `fc_lang`
 * into a cookie so RSC sections can render the same dictionary.
 */
export function getServerLocale(): Locale {
  return cookies().get('fc_lang')?.value === 'es' ? 'es' : 'en';
}

export function getServerMessages(): Messages {
  return dictionaries[getServerLocale()];
}
