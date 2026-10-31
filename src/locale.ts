import { isLanguage, type Language } from "./translations";
const key = "klarwerk.language";
function readLanguage(): Language {
  try {
    const value =
      typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    return isLanguage(value) ? value : "de";
  } catch {
    return "de";
  }
}
let current = readLanguage();
export const getUiLanguage = () => current;
export function saveUiLanguage(language: Language) {
  current = language;
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(key, language);
  } catch {
    /* Keep the selection for this page. */
  }
}
