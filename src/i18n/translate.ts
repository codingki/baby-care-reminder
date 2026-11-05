import { en, type MessageShape } from "@/i18n/messages/en";

export type Messages = MessageShape<typeof en>;

type LeafPaths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends Record<string, unknown>
      ? LeafPaths<T[K], `${Prefix}${K}.`>
      : never;
}[keyof T & string];

export type MessageKey = LeafPaths<typeof en>;

const PLACEHOLDER = /\{(\w+)\}/g;

export function translate(
  messages: Messages,
  key: MessageKey,
  vars?: Record<string, string>,
): string {
  const parts = key.split(".");
  let current: unknown = messages;

  for (const part of parts) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return key;
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (typeof current !== "string") return key;
  if (!vars) return current;

  return current.replace(PLACEHOLDER, (token, name: string) => vars[name] ?? token);
}
