import { getLocale } from "./locale";
import { getTranslator } from "./translator";
import type { Locale, TFunction } from "./types";

export { getTranslator, de, it } from "./translator";
export type { Locale, TFunction };

export async function getServerI18n(): Promise<{
  locale: Locale;
  t: TFunction;
}> {
  const locale = await getLocale();
  return { locale, t: getTranslator(locale) };
}
