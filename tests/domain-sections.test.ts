import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createSite,
  siteSchema,
  domainSchema,
  resolveSiteLink,
} from "../src/model.ts";
import { createApp } from "../server/app.ts";
import { renderPage } from "../server/render.ts";

test("Domain accepts hostnames and HTTPS origins, normalizes them, and rejects paths and unsafe values", () => {
  assert.equal(domainSchema.parse(" Beispiel.AT "), "https://beispiel.at");
  assert.equal(domainSchema.parse("https://example.at/"), "https://example.at");
  assert.equal(domainSchema.parse(""), "");
  for (const value of [
    "http://example.at",
    "https://example.at/path",
    "https://example.at?x=1",
    "https://example.at/#x",
    "https://user:pass@example.at",
    "https://example.at:4317",
    "https://",
    "javascript:alert(1)",
    "my domain.at",
  ])
    assert.equal(domainSchema.safeParse(value).success, false, value);
  const { domain, hiddenSections, ...legacy } = createSite();
  const parsed = siteSchema.parse(legacy);
  assert.equal(parsed.domain, "");
  assert.deepEqual(parsed.hiddenSections, []);
});

test("Removing built-in areas removes them and their navigation from rendered pages, including empty canvas pages", () => {
  const site = createSite("developer");
  site.repos = [
    {
      id: 1,
      name: "example",
      description: "Example",
      url: "https://github.com/example/example",
      language: "TypeScript",
      stars: 0,
      fork: false,
    },
  ];
  site.contact.email = "hello@example.at";
  site.hiddenSections = ["services", "projects", "contact"];
  const html = renderPage(site, "home", "https://example.at");
  for (const id of ["leistungen", "projekte", "kontakt"]) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`));
    assert.doesNotMatch(html, new RegExp(`href="#${id}"`));
  }
  assert.match(html, /mailto:hello@example.at/);
  site.sections = [];
  site.contact.email = "";
  const empty = siteSchema.parse(site);
  assert.doesNotThrow(() => renderPage(empty, "home", "https://example.at"));
  assert.match(
    renderPage(empty, "imprint", "https://example.at"),
    /href="\/datenschutz"/,
  );
  assert.equal(resolveSiteLink("#kontakt", empty), "");
  empty.integrations.bookingUrl = "#kontakt";
  assert.equal(resolveSiteLink("#kontakt", empty), "");
  assert.doesNotMatch(
    renderPage(empty, "home", "https://example.at"),
    /href="#kontakt"/,
  );
  assert.equal(resolveSiteLink("#ueber-mich", empty), "");
  assert.equal(
    resolveSiteLink("https://example.at/contact", empty),
    "https://example.at/contact",
  );
});

test("Published domain controls canonical, metadata and sitemap; draft changes take effect only after publishing", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-domain-"));
  const { app, store } = await createApp(dir);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const site = createSite();
    site.domain = "https://my-domain.at";
    store.save(site, 0);
    store.publish();
    let html = await (await fetch(base)).text();
    assert.match(html, /rel="canonical" href="https:\/\/my-domain.at\/"/);
    assert.match(
      await (await fetch(base + "/sitemap.xml")).text(),
      /<loc>https:\/\/my-domain.at\/<\/loc>/,
    );
    assert.match(
      await (await fetch(base + "/robots.txt")).text(),
      /https:\/\/my-domain.at\/sitemap.xml/,
    );
    site.domain = "https://next-domain.at";
    site.hiddenSections = ["services", "contact"];
    store.save(site, 1);
    html = await (await fetch(base)).text();
    assert.match(html, /https:\/\/my-domain.at\//);
    assert.match(html, /id="kontakt"/);
    store.publish();
    html = await (await fetch(base)).text();
    assert.match(html, /rel="canonical" href="https:\/\/next-domain.at\/"/);
    assert.doesNotMatch(html, /id="kontakt"|id="leistungen"/);
    site.domain = "";
    store.save(site, 2);
    store.publish();
    const fallback = process.env.PUBLIC_ORIGIN || base;
    assert.ok(
      (await (await fetch(base)).text()).includes(
        `rel="canonical" href="${fallback}/"`,
      ),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
