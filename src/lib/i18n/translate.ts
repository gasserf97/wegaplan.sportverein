import type { TFunction, TranslationParams } from "./types";

type MessageValue = string | { [key: string]: MessageValue };
export type MessageTree = { [key: string]: MessageValue };

function resolvePath(messages: MessageTree, key: string): string | undefined {
  const parts = key.split(".");
  let current: string | MessageTree | undefined = messages;
  for (const part of parts) {
    if (!current || typeof current === "string") return undefined;
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

function interpolate(
  template: string,
  params?: TranslationParams,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}

export function createTranslator(messages: MessageTree): TFunction {
  return (key: string, params?: TranslationParams) => {
    const value = resolvePath(messages, key);
    if (value === undefined) return key;
    return interpolate(value, params);
  };
}
