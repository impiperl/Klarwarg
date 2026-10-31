import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import { getUiLanguage, saveUiLanguage } from "./locale";
import {
  createTranslator,
  isLanguage,
  type Language,
  type Messages,
  type Translate,
} from "./translations";

type I18n = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
  messages: Partial<Record<Language, Messages>>;
};
const context = createContext<I18n>({
  language: "de",
  setLanguage: () => {},
  t: createTranslator("de"),
  messages: {},
});
export const useI18n = () => useContext(context);
export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getUiLanguage);
  const [messages, setMessages] = useState<Partial<Record<Language, Messages>>>(
    {},
  );
  useEffect(() => {
    let active = true;
    for (const next of ["de", "en"] as const) {
      api<{ language: Language; messages: Messages }>(`/translations/${next}`)
        .then((response) => {
          if (active && response.language === next)
            setMessages((old) => ({ ...old, [next]: response.messages }));
        })
        .catch(() => {
          /* Bundled seed text keeps startup errors readable. */
        });
    }
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const value = useMemo<I18n>(
    () => ({
      language,
      messages,
      setLanguage(next) {
        saveUiLanguage(next);
        setLanguageState(next);
      },
      t: createTranslator(language, messages[language]),
    }),
    [language, messages],
  );
  return <context.Provider value={value}>{children}</context.Provider>;
}
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { language, setLanguage, t } = useI18n();
  const id = useId();
  return (
    <label className={`language-switch ${className}`} htmlFor={id}>
      <span>{t("Sprache")}</span>
      <select
        id={id}
        value={language}
        data-testid="language-switch"
        onChange={(event) => {
          if (isLanguage(event.currentTarget.value))
            setLanguage(event.currentTarget.value);
        }}
      >
        <option value="de" lang="de">
          Deutsch
        </option>
        <option value="en" lang="en">
          English
        </option>
      </select>
    </label>
  );
}
