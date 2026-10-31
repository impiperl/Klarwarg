import catalogue from "./messages.json";

export type Language = "de" | "en";
export type Messages = Record<string, string>;
export type Translate = (
  source: string,
  variables?: Record<string, string | number>,
) => string;
export { catalogue };
export const isLanguage = (value: unknown): value is Language =>
  value === "de" || value === "en";
export const bundledMessages = (language: Language): Messages =>
  Object.fromEntries(
    Object.entries(catalogue).map(([key, pair]) => [key, pair[language]]),
  );
const escapePattern = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createTranslator(
  language: Language,
  overrides: Messages = {},
): Translate {
  const messages = { ...bundledMessages(language), ...overrides };
  // Stored notices can contain values already interpolated before the language changes.
  const patterns = Object.keys(messages)
    .filter((key) => /\{\w+\}/.test(key))
    .map((key) => {
      const names: string[] = [];
      const parts = key.split(/(\{\w+\})/g).map((part) => {
        if (/^\{\w+\}$/.test(part)) {
          names.push(part.slice(1, -1));
          return "(.+?)";
        }
        return escapePattern(part);
      });
      return { key, names, pattern: new RegExp(`^${parts.join("")}$`) };
    });
  return (source, variables) => {
    const key = source.trim();
    let template = messages[key];
    let values = variables;
    if (template === undefined) {
      for (const entry of patterns) {
        const match = key.match(entry.pattern);
        if (match) {
          template = messages[entry.key];
          values = Object.fromEntries(
            entry.names.map((name, index) => [name, match[index + 1]]),
          );
          break;
        }
      }
    }
    if (template === undefined) return source;
    const result = template.replace(/\{(\w+)\}/g, (match, name) =>
      values && Object.hasOwn(values, name) ? String(values[name]) : match,
    );
    return (
      (source.match(/^\s*/)?.[0] || "") +
      result +
      (source.match(/\s*$/)?.[0] || "")
    );
  };
}
