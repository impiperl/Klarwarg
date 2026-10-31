import { getUiLanguage } from "./locale";
export const API =
  process.env.EXPO_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.port === "8091"
    ? `${window.location.protocol}//${window.location.hostname}:4317`
    : "");
export function asset(src: string) {
  return src.startsWith("/uploads/") ? API + src : src;
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API + "/api" + path, {
      credentials: "include",
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Accept-Language": getUiLanguage(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      "Der Server ist nicht erreichbar. Bitte starte npm run dev und versuche es erneut.",
    );
  }
  const json = await response.json();
  if (!response.ok)
    throw new Error(
      json.errorKey || json.error || "Die Anfrage ist fehlgeschlagen.",
    );
  return json;
}
