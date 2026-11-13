export type Locale = "de" | "it";

export const LOCALES: Locale[] = ["de", "it"];

export const DEFAULT_LOCALE: Locale = "de";

export type TranslationParams = Record<string, string | number>;

export type TFunction = (
  key: string,
  params?: TranslationParams,
) => string;
