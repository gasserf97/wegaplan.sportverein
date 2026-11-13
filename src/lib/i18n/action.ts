import { getLocale } from "./locale";
import { getTranslator } from "./translator";

export async function getActionI18n() {
  const locale = await getLocale();
  return { locale, t: getTranslator(locale) };
}
