import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import { createApp } from "../server/app.ts";
import { Store } from "../server/store.ts";
import { createSite } from "../src/model.ts";
import { sitePathProblem, suggestSitePath } from "../src/sitePath.ts";

function filled(name: string) {
  const site = createSite();
  site.name = name;
  site.legal.imprint = "Impressum " + name;
  site.legal.privacy = "Datenschutz " + name;
  return site;
}

async function start() {
  const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-sites-"));
  const { app, store } = await createApp(dir);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  let cookie = "";
  const call = async (route: string, body?: unknown, method?: string) => {
    const r = await fetch(base + "/api" + route, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json() };
  };
  const setup = await fetch(base + "/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin",
      password: "test-password-12345",
    }),
  });
  cookie = setup.headers.get("set-cookie")!.split(";")[0];
  const close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { dir, base, store, call, close };
}

test("Adressen: erlaubte Zeichen, reservierte Pfade und Vorschlag aus dem Namen", () => {
  assert.equal(sitePathProblem(""), null);
  assert.equal(sitePathProblem("iris"), null);
  assert.equal(sitePathProblem("iris-perl-2"), null);
  for (const bad of [
    "Iris",
    "iris/",
    "-iris",
    "iris--perl",
    "ir is",
    "site.css",
    "a".repeat(61),
  ])
    assert.ok(sitePathProblem(bad), bad);
  for (const reserved of [
    "admin",
    "api",
    "uploads",
    "images",
    "impressum",
    "datenschutz",
  ])
    assert.ok(sitePathProblem(reserved), reserved);
  assert.equal(suggestSitePath("Dr. Jürgen Weiß"), "dr-juergen-weiss");
  assert.equal(suggestSitePath("Admin"), "");
});

test("Mehrere Websites: eigene Adressen, Rechtstexte, Weiterleitung, Sitemap und Löschen", async () => {
  const { base, call, close } = await start();
  try {
    // Nach der Einrichtung gibt es genau eine Website, noch ohne Adresse.
    let list = await call("/sites");
    assert.equal(list.json.sites.length, 1);
    const first = list.json.sites[0].id;
    assert.equal(list.json.sites[0].path, null);

    const second = (await call("/sites", { profession: "law" })).json.id;
    list = await call("/sites");
    assert.equal(list.json.sites.length, 2);

    // Entwürfe und Revisionen sind je Website getrennt.
    let a = await call("/draft?site=" + first);
    let b = await call("/draft?site=" + second);
    assert.equal(b.json.site.profession, "law");
    assert.equal(
      (
        await call(
          "/draft?site=" + first,
          { site: filled("Iris"), revision: a.json.revision },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          "/draft?site=" + second,
          { site: filled("Judith"), revision: b.json.revision },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal((await call("/draft?site=" + first)).json.site.name, "Iris");
    assert.equal(
      (await call("/draft?site=" + second)).json.site.name,
      "Judith",
    );
    assert.equal((await call("/draft?site=unbekannt")).status, 404);

    // Unter / ist noch nichts veröffentlicht.
    assert.equal((await fetch(base + "/")).status, 404);

    // Ungültige oder reservierte Adressen werden abgewiesen, ohne etwas zu veröffentlichen.
    for (const bad of ["admin", "Iris Perl", "a/b"]) {
      const r = await call("/publish?site=" + first, { path: bad });
      assert.equal(r.status, 400, bad);
      assert.equal(r.json.field, "path");
    }
    assert.equal((await call("/sites")).json.sites[0].path, null);

    let published = await call("/publish?site=" + first, { path: "iris" });
    assert.equal(published.status, 200);
    assert.equal(published.json.url, "/iris");
    assert.equal(
      (await call("/publish?site=" + second, { path: "judith" })).status,
      200,
    );
    // Dieselbe Adresse für eine zweite Website: Konflikt.
    const taken = await call("/publish?site=" + second, { path: "iris" });
    assert.equal(taken.status, 409);
    assert.equal(taken.json.field, "path");

    let html = await (await fetch(base + "/iris")).text();
    assert.match(html, /<title>Iris/);
    assert.match(html, /href="\/iris\/impressum"/);
    assert.match(html, /href="\/iris\/datenschutz"/);
    assert.match(
      html,
      new RegExp(
        `rel="canonical" href="${(process.env.PUBLIC_ORIGIN || base).replace(/[.]/g, "\\.")}/iris"`,
      ),
    );
    assert.match(
      await (await fetch(base + "/iris/impressum")).text(),
      /Impressum Iris/,
    );
    assert.match(await (await fetch(base + "/iris/")).text(), /<title>Iris/);
    assert.match(
      await (await fetch(base + "/judith/datenschutz")).text(),
      /Datenschutz Judith/,
    );
    assert.equal((await fetch(base + "/niemand")).status, 404);
    // Feste Pfade bleiben, wie sie sind.
    assert.equal((await fetch(base + "/robots.txt")).status, 200);
    assert.equal((await fetch(base + "/api/health")).status, 200);

    const map = await (await fetch(base + "/sitemap.xml")).text();
    assert.match(map, /\/iris<\/loc>/);
    assert.match(map, /\/judith<\/loc>/);

    // Ohne Angabe bleibt die Adresse beim erneuten Veröffentlichen.
    assert.equal(
      (await call("/publish?site=" + second, {})).json.path,
      "judith",
    );

    // Adresse ändern: Die alte leitet weiter, bis eine andere Website sie nimmt.
    published = await call("/publish?site=" + first, { path: "iris-perl" });
    assert.equal(published.json.path, "iris-perl");
    let moved = await fetch(base + "/iris/impressum", { redirect: "manual" });
    assert.equal(moved.status, 301);
    assert.equal(moved.headers.get("location"), "/iris-perl/impressum");
    // Auf die Startseite: / zeigt Iris, /iris-perl leitet auf / weiter.
    await call("/publish?site=" + first, { path: "" });
    assert.match(await (await fetch(base + "/")).text(), /<title>Iris/);
    moved = await fetch(base + "/iris-perl", { redirect: "manual" });
    assert.equal(moved.headers.get("location"), "/");
    // Judith nimmt die alte Adresse /iris: keine Weiterleitung mehr, sondern ihre Website.
    await call("/publish?site=" + second, { path: "iris" });
    html = await (await fetch(base + "/iris", { redirect: "manual" })).text();
    assert.match(html, /<title>Judith/);
    moved = await fetch(base + "/judith", { redirect: "manual" });
    assert.equal(moved.headers.get("location"), "/iris");

    // Versionen gehören zu ihrer Website; fremde Stände lassen sich nicht laden.
    const ownVersions = (await call("/versions?site=" + first)).json.versions;
    const otherVersions = (await call("/versions?site=" + second)).json
      .versions;
    assert.equal(ownVersions.length, 3);
    assert.equal(otherVersions.length, 3);
    assert.equal(
      (await call(`/restore/${otherVersions[0].id}?site=${first}`, {})).status,
      404,
    );
    const restored = await call(
      `/restore/${ownVersions[0].id}?site=${first}`,
      {},
    );
    assert.equal(restored.status, 200);
    assert.equal(restored.json.site.name, "Iris");

    // Löschen nimmt Website, Versionen und Weiterleitungen mit; die letzte bleibt.
    assert.equal(
      (await call("/sites/" + second, undefined, "DELETE")).status,
      200,
    );
    assert.equal(
      (await fetch(base + "/iris", { redirect: "manual" })).status,
      404,
    );
    assert.equal(
      (await fetch(base + "/judith", { redirect: "manual" })).status,
      404,
    );
    assert.equal((await call("/versions?site=" + second)).status, 404);
    const last = await call("/sites/" + first, undefined, "DELETE");
    assert.equal(last.status, 409);
    assert.match(await (await fetch(base + "/")).text(), /<title>Iris/);
  } finally {
    await close();
  }
});

test("Alte Einzel-Website wird beim Start zur Website unter / – mit Sicherung und Versionen", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-legacy-"));
  try {
    // Datenbank im Format vor den mehreren Websites.
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(`CREATE TABLE settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE sessions (hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
      CREATE TABLE versions (id TEXT PRIMARY KEY,created TEXT NOT NULL,document TEXT NOT NULL);
      CREATE TABLE translations (key TEXT PRIMARY KEY,de TEXT NOT NULL,en TEXT NOT NULL);`);
    const draft = filled("Entwurf"),
      live = filled("Live");
    for (const [key, value] of [
      ["draft", JSON.stringify(draft)],
      ["published", JSON.stringify(live)],
      ["revision", "7"],
      ["publishedAt", "2026-10-01T10:00:00.000Z"],
    ])
      db.run("INSERT INTO settings VALUES(?,?)", [key, value]);
    db.run("INSERT INTO versions VALUES(?,?,?)", [
      "v1",
      "2026-10-01T10:00:00.000Z",
      JSON.stringify(live),
    ]);
    writeFileSync(path.join(dir, "klarwerk.sqlite"), db.export());
    db.close();

    let store = await Store.open(dir);
    assert.equal(store.sites().length, 1);
    assert.equal(store.draft()!.name, "Entwurf");
    assert.equal(store.publicSite()!.name, "Live");
    assert.equal(store.revision(), 7);
    assert.equal(store.path(), "");
    assert.equal(store.siteAt("")!.site.name, "Live");
    assert.deepEqual(
      store.versions().map((v) => v.id),
      ["v1"],
    );
    assert.equal(store.get("draft"), undefined);
    assert.equal(
      readdirSync(path.join(dir, "backups")).filter((f) =>
        f.startsWith("klarwarg-before-sites-"),
      ).length,
      1,
    );
    store.close();
    // Zweiter Start: nichts mehr zu tun, keine weitere Sicherung.
    store = await Store.open(dir);
    assert.equal(store.sites().length, 1);
    assert.equal(readdirSync(path.join(dir, "backups")).length, 1);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
