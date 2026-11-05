/**
 * Adresse einer Website auf diesem Server: leer heißt Startseite (`/`), sonst `/iris`, `/judith` …
 *
 * Die Adresse gehört zur Website auf dem Server, nicht in den Entwurf. Darum steht sie nicht in
 * der JSON-Sicherung: Wer eine Sicherung in eine andere Website lädt, verschiebt damit keine
 * Adresse und nimmt keiner anderen Website ihre weg.
 */

/** Pfade, die Klarwarg selbst braucht. Namen mit Punkt (site.css, robots.txt …) schließt schon das Muster aus. */
export const reservedSitePaths = [
  "admin",
  "api",
  "uploads",
  "images",
  "assets",
  "impressum",
  "datenschutz",
] as const;

const pattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const maxSitePathLength = 60;

/** Fehlertext (als Übersetzungsschlüssel) oder `null`, wenn die Adresse verwendet werden kann. */
export function sitePathProblem(path: string): string | null {
  if (path === "") return null;
  if (path.length > maxSitePathLength || !pattern.test(path))
    return "Bitte nur Kleinbuchstaben, Ziffern und einzelne Bindestriche verwenden (höchstens 60 Zeichen).";
  if ((reservedSitePaths as readonly string[]).includes(path))
    return "Diese Adresse braucht Klarwarg selbst. Bitte eine andere wählen.";
  return null;
}

/** Vorschlag aus dem Namen der Website: „Dr. Iris Perl“ → „dr-iris-perl“. */
export function suggestSitePath(name: string): string {
  const path = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxSitePathLength)
    .replace(/-+$/, "");
  return sitePathProblem(path) ? "" : path;
}

/** Pfadanfang für Links innerhalb einer Website: "" für die Startseite, sonst "/iris". */
export const sitePathBase = (path: string | null | undefined) =>
  path ? "/" + path : "";
