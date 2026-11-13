import { de } from "./messages/de";
import { it } from "./messages/it";
import { createTranslator, type MessageTree } from "./translate";
import type { Locale, TFunction } from "./types";

const dictionaries = { de, it } as const;

export function getTranslator(locale: Locale): TFunction {
  return createTranslator(dictionaries[locale] as MessageTree);
}

export { de, it };
