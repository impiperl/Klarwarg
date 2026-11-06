import type { ZodIssue } from "zod";
import type { Translate } from "./translations";

export const validationNotice =
  "Noch nicht gespeichert. Bitte korrigiere die markierten Felder.";
export function describeIssue(issue: ZodIssue, t: Translate) {
  const path = issue.path.map(String);
  const key = path.join(".");
  const labels: Record<string, string> = {
    domain: "Eigene Domain",
    name: "Name / Unternehmen",
    tagline: "Unterzeile",
    profession: "Beruf",
    font: "Deine Schrift",
    language: "Sprache der Website",
    "contact.email": "E-Mail",
    "contact.phone": "Telefon",
    "contact.address": "Adresse",
    "integrations.linkedinUrl": "Dein öffentliches LinkedIn-Profil",
    "integrations.bookingUrl": "Öffentlicher Buchungs- oder Portallink",
    "integrations.appStoreUrl": "Dein App-Store-Eintrag",
    "integrations.googlePlayUrl": "Dein Google-Play-Eintrag",
    "integrations.githubUser": "GitHub-Benutzername",
    "integrations.provider": "Dein Anbieter",
    "legal.imprint": "Impressum",
    "legal.privacy": "Datenschutzerklärung",
    "grid.columns": "Eigene Spaltenanzahl (1–24)",
    "grid.gap": "Spaltenabstand",
    "grid.row": "Zeilenraster",
  };
  let label = t(labels[key] || "Website-Einstellungen");
  if (path[0] === "services" && path[1] !== undefined)
    label = t("Leistung {number}: {field}", {
      number: Number(path[1]) + 1,
      field: t(path[2] === "title" ? "Titel" : "Beschreibung"),
    });
  if (path[0] === "sections" && path[1] !== undefined) {
    label = t("Abschnitt {number}: {field}", {
      number: Number(path[1]) + 1,
      field: t(
        path[2] === "label" ? "Name in der Navigation" : "Abschnittshöhe (px)",
      ),
    });
    if (path[2] === "blocks")
      label = t("Abschnitt {section}, Element {block}: {field}", {
        section: Number(path[1]) + 1,
        block: Number(path[3]) + 1,
        field: t(
          (
            {
              text: "Dein Text",
              href: "Ziel des Buttons",
              alt: "Bildbeschreibung",
              src: "Bild",
              fontSize: "Schriftgröße",
              x: "X · horizontal",
              y: "Y · vertikal",
              w: "Breite",
              h: "Höhe",
            } as Record<string, string>
          )[path[4]] || "Element bearbeiten",
        ),
      });
  }
  let message = t("Bitte prüfe diese Angabe.");
  if (issue.code === "too_big")
    message = t("Bitte höchstens {maximum} Zeichen eingeben.", {
      maximum: String(issue.maximum),
    });
  else if (issue.code === "too_small")
    message = t("Bitte mindestens {minimum} Zeichen eingeben.", {
      minimum: String(issue.minimum),
    });
  else if (key === "domain")
    message = t(
      "Bitte eine Domain wie meine-domain.at oder https://meine-domain.at eingeben, ohne Pfad, Port oder Zugangsdaten.",
    );
  else if (key === "contact.email")
    message = t(
      "Bitte eine gültige E-Mail-Adresse eingeben, zum Beispiel name@firma.at.",
    );
  else if (key === "integrations.linkedinUrl")
    message = t(
      "Bitte den vollständigen LinkedIn-Link mit https:// eingeben, zum Beispiel https://www.linkedin.com/in/dein-name. Leerzeichen am Anfang oder Ende entfernen.",
    );
  else if (key === "integrations.appStoreUrl")
    message = t(
      "Bitte einen vollständigen App-Store-Link mit https://apps.apple.com/ eingeben.",
    );
  else if (key === "integrations.googlePlayUrl")
    message = t(
      "Bitte einen vollständigen Google-Play-Link mit https://play.google.com/ eingeben.",
    );
  else if (
    key === "integrations.bookingUrl" ||
    path[path.length - 1] === "href"
  )
    message = t(
      "Bitte einen Link mit https://, mailto:, tel: oder ein Abschnittsziel wie #kontakt eingeben.",
    );
  else if (issue.code === "invalid_type" || issue.code === "invalid_value")
    message = t("Bitte einen gültigen Wert wählen.");
  // Numeric/collection limits need units appropriate to their values.
  if (
    (issue.code === "too_big" || issue.code === "too_small") &&
    issue.origin !== "string"
  )
    message =
      issue.code === "too_big"
        ? t("Der Wert darf höchstens {maximum} sein.", {
            maximum: String(issue.maximum),
          })
        : t("Der Wert muss mindestens {minimum} sein.", {
            minimum: String(issue.minimum),
          });
  return { key, label, message };
}
