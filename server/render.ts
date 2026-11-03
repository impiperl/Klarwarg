import React from "react";
import {
  createTranslator,
  type Language,
  type Messages,
} from "../src/translations.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import BrandLogo from "../src/BrandLogo.tsx";
import SiteSurface, {
  legalPaths,
  legalTitles,
  type PublicPage,
} from "../src/SiteSurface.tsx";
import { fillName, type Site } from "../src/model.ts";

/**
 * Die öffentliche Website als fertiges HTML.
 *
 * Gerendert wird dieselbe `SiteSurface` wie im Editor, nur ohne JavaScript im Browser: Suchmaschinen
 * und Linkvorschauen sehen sofort Titel, Beschreibung und Inhalt, und Besucher laden nicht den
 * ganzen Editor mit. Die Skalierung der Arbeitsfläche übernimmt das CSS (siehe `SiteSurface`).
 */

export const css = readFileSync(
  path.join(import.meta.dirname, "../src/styles.css"),
  "utf8",
);
export const cssVersion = createHash("sha256")
  .update(css)
  .digest("hex")
  .slice(0, 12);

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** schema.org-Typ je Berufsvorlage; was nicht genauer passt, ist eine Dienstleistung. */
const schemaTypes: Record<string, string> = {
  psychiatry: "Physician",
  medicine: "Physician",
  therapy: "MedicalBusiness",
  physio: "MedicalBusiness",
  law: "LegalService",
  tax: "AccountingService",
  craft: "HomeAndConstructionBusiness",
};

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** Beschreibung für Suchtreffer: der erste Fließtext der Startseite, sonst die Unterzeile. */
export function describe(site: Site) {
  const text = oneLine(
    fillName(
      site.sections[0]?.blocks.find((b) => b.kind === "text")?.text ||
        site.tagline ||
        site.name,
      site.name,
    ),
  );
  if (text.length <= 160) return text;
  const cut = text.slice(0, 157);
  return (
    cut.slice(0, cut.lastIndexOf(" ") > 100 ? cut.lastIndexOf(" ") : 157) + " …"
  );
}

/** Das erste Foto als Vorschaubild für geteilte Links. SVG zeigen die meisten Dienste nicht an. */
function previewImage(site: Site, origin: string) {
  const src = site.sections
    .flatMap((s) => s.blocks)
    .find(
      (b) => b.kind === "image" && /\.(png|jpe?g|webp|gif)$/i.test(b.src),
    )?.src;
  if (!src) return "";
  return src.startsWith("/") ? origin + src : src;
}

function structuredData(site: Site, origin: string) {
  const image = previewImage(site, origin);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaTypes[site.profession] || "ProfessionalService",
    name: site.name,
    description: describe(site),
    url: origin + "/",
  };
  if (!site.hiddenSections.includes("contact") && site.contact.email)
    data.email = site.contact.email;
  if (!site.hiddenSections.includes("contact") && site.contact.phone)
    data.telephone = site.contact.phone;
  if (!site.hiddenSections.includes("contact") && site.contact.address)
    data.address = oneLine(site.contact.address);
  if (image) data.image = image;
  if (site.integrations.linkedinUrl)
    data.sameAs = [site.integrations.linkedinUrl];
  // In einem <script> darf kein "</script>" stehen; "<" maskiert schließt das aus.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function document(head: string, body: string, language: Language = "de") {
  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
${head}
<link rel="stylesheet" href="/site.css?v=${cssVersion}">
</head>
<body><div id="root">${body}</div></body>
</html>`;
}

export function renderPage(
  site: Site,
  page: PublicPage,
  origin: string,
  messages: Messages = {},
) {
  const t = createTranslator(site.language, messages);
  const path = page === "home" ? "/" : legalPaths[page];
  const title =
    page === "home"
      ? site.tagline
        ? `${site.name} · ${site.tagline}`
        : site.name
      : `${t(legalTitles[page])} · ${site.name}`;
  const description = describe(site);
  const image = previewImage(site, origin);
  const head = [
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(description)}">`,
    // Rechtstexte gehören nicht in die Suchtreffer, ihre Links dürfen aber verfolgt werden.
    page === "home" ? "" : `<meta name="robots" content="noindex, follow">`,
    `<link rel="canonical" href="${escape(origin + path)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="${site.language === "en" ? "en_GB" : "de_DE"}">`,
    `<meta property="og:site_name" content="${escape(site.name)}">`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(description)}">`,
    `<meta property="og:url" content="${escape(origin + path)}">`,
    image ? `<meta property="og:image" content="${escape(image)}">` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="theme-color" content="${escape(site.colors[2])}">`,
    page === "home"
      ? `<script type="application/ld+json">${structuredData(site, origin)}</script>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const body = renderToStaticMarkup(
    React.createElement(
      "div",
      { className: "public-site" },
      React.createElement(SiteSurface, { site, page, messages }),
    ),
  );
  return document(head, body, site.language);
}

/** Solange nichts veröffentlicht ist: ein Hinweis statt einer leeren Seite, nicht für Suchmaschinen. */
export function renderUnpublished(
  language: Language = "de",
  messages: Messages = {},
) {
  const t = createTranslator(language, messages);
  const body = renderToStaticMarkup(
    React.createElement(
      "div",
      { className: "auth-page" },
      React.createElement(
        "div",
        { className: "wordmark" },
        React.createElement(
          "span",
          { className: "brand-mark klarwarg-mark" },
          React.createElement(BrandLogo, { size: 34 }),
        ),
        "klarwarg.",
      ),
      React.createElement(
        "div",
        { className: "auth-card" },
        React.createElement(
          "span",
          { className: "eyebrow" },
          t("PLATZ FÜR DEINEN NÄCHSTEN SCHRITT"),
        ),
        React.createElement(
          "h1",
          null,
          t("Deine Website."),
          React.createElement("br"),
          t("Dein Anfang."),
        ),
        React.createElement(
          "p",
          null,
          t("Diese Website wurde noch nicht veröffentlicht."),
        ),
        React.createElement(
          "a",
          { className: "primary", href: "/admin" },
          t("Website gestalten"),
        ),
      ),
    ),
  );
  return document(
    `<title>Klarwarg</title>\n<meta name="robots" content="noindex">`,
    body,
    language,
  );
}

export function robots(origin: string) {
  return `User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`;
}

export function sitemap(origin: string, publishedAt?: string) {
  const lastmod = publishedAt
    ? `<lastmod>${escape(publishedAt.slice(0, 10))}</lastmod>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${escape(origin)}/</loc>${lastmod}</url>
</urlset>
`;
}
