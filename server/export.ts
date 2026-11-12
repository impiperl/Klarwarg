import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { z } from "zod";
import type { Site } from "../src/model.ts";
import type { Messages } from "../src/translations.ts";
import { css, renderPage, sitemap } from "./render.ts";

/** No requests are made to this address; it supplies canonical URLs only. */
export function exportTarget(value: string): URL {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    // A trailing slash identifies the FTP destination folder, including a subfolder.
    url.pathname = url.pathname.replace(/\/+$/, "") + "/";
    return url;
  } catch {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["targetUrl"],
        message:
          "Bitte eine vollständige HTTP- oder HTTPS-Zieladresse ohne Zugangsdaten, Suchparameter oder Fragment angeben.",
      },
    ]);
  }
}

/** Only explicitly referenced public images enter the archive; never the data directory. */
export function exportWebsite(
  site: Site,
  target: URL,
  dataDir: string,
  messages: Messages = {},
): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const snapshot = structuredClone(site);
  const base = target.pathname.replace(/\/$/, "");
  function bundleImage(src: string): string {
    const match = src.match(/^\/(uploads|images)\/([\w.-]+)$/);
    if (!match) throw new Error("Invalid image path");
    const [, group, name] = match;
    const sourceDir = realpathSync(
      group === "uploads"
        ? path.join(dataDir, "uploads")
        : path.join(import.meta.dirname, "../public/images"),
    );
    const source = realpathSync(path.join(sourceDir, name));
    if (!source.startsWith(sourceDir + path.sep))
      throw new Error("Invalid image path");
    const destination = `assets/${group}/${name}`;
    files[destination] ??= readFileSync(source);
    return destination;
  }
  for (const block of snapshot.sections.flatMap((section) => section.blocks)) {
    if (block.kind !== "image" || !/^\/(uploads|images)\//.test(block.src))
      continue;
    // Absolute preview metadata includes the destination subfolder. HTML assets become relative below.
    block.src = base + "/" + bundleImage(block.src);
  }
  files["site.css"] = strToU8(css);
  const pages = [
    ["home", "index.html"],
    ["imprint", "impressum.html"],
    ["privacy", "datenschutz.html"],
    ...(snapshot.cv.enabled && snapshot.cv.text.trim()
      ? [["cv", "lebenslauf.html"] as const]
      : []),
  ] as const;
  for (const [page, name] of pages) {
    let html = renderPage(snapshot, page, target.origin, messages, base);
    // Restrict rewriting to generated HTML attributes, leaving all user text untouched.
    html = html.replace(
      /\b(href|src)="([^"]*)"/g,
      (attribute, kind: string, value: string) => {
        // BrandLogo also references an image, independently of the site's image blocks.
        if (/^\/(uploads|images)\//.test(value))
          return `${kind}="${bundleImage(value)}"`;
        if (value.startsWith(base + "/assets/"))
          return `${kind}="${value.slice(base.length + 1)}"`;
        if (kind !== "href") return attribute;
        if (value.startsWith("/site.css?")) return 'href="site.css"';
        for (const legal of ["impressum", "datenschutz", "lebenslauf"])
          if (value === base + "/" + legal) return `href="${legal}.html"`;
        if (value === (base || "/")) return 'href="index.html"';
        if (base && value.startsWith(base + "#"))
          return `href="index.html${value.slice(base.length)}"`;
        // On legal pages at the domain root, navigation uses /#section.
        if (page !== "home" && value.startsWith("/#"))
          return `href="index.html${value.slice(1)}"`;
        return attribute;
      },
    );
    if (base) {
      html = html
        .replaceAll(`href="${target.origin}${base}"`, `href="${target.href}"`)
        .replaceAll(
          `content="${target.origin}${base}"`,
          `content="${target.href}"`,
        )
        .replaceAll(
          `"url":"${target.origin}${base}"`,
          `"url":"${target.href}"`,
        );
    }
    // Canonical and Open Graph links point to the actual exported legal filenames.
    if (page !== "home") {
      const suffix =
        page === "cv"
          ? "lebenslauf"
          : page === "imprint"
            ? "impressum"
            : "datenschutz";
      html = html.replaceAll(
        target.origin + base + "/" + suffix + '"',
        target.origin + base + "/" + suffix + '.html"',
      );
    }
    files[name] = strToU8(html);
  }
  files["sitemap.xml"] = strToU8(
    sitemap([
      { loc: target.href },
      ...(snapshot.cv.enabled && snapshot.cv.text.trim()
        ? [{ loc: target.href + "lebenslauf.html" }]
        : []),
    ]),
  );
  files["robots.txt"] = strToU8(
    `User-agent: *\nAllow: ${target.pathname}\nSitemap: ${target.href}sitemap.xml\n`,
  );
  return zipSync(files, { level: 6 });
}
