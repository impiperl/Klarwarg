import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app.ts";
import { Store } from "../server/store.ts";
import { createSite, siteSchema } from "../src/model.ts";
import { catalogue, createTranslator } from "../src/translations.ts";

test("Both languages cover every message and preserve placeholders", () => {
  for (const [key, pair] of Object.entries(catalogue)) {
    assert.ok(pair.de.trim(), key);
    assert.ok(pair.en.trim(), key);
    assert.deepEqual(
      (pair.de.match(/\{\w+\}/g) || []).sort(),
      (pair.en.match(/\{\w+\}/g) || []).sort(),
      key,
    );
  }
  const en = createTranslator("en");
  assert.equal(en("Inhalte"), "Content");
  assert.equal(
    en("Bitte ein Bild bis 30 MB auswählen."),
    "Choose an image up to 30 MB.",
  );
  assert.equal(
    en("{label} bearbeiten", { label: "<script>" }),
    "Edit <script>",
  );
  assert.equal(en("My custom site content"), "My custom site content");
});

test("SQLite translations persist, retain edits and serve public English labels without touching content", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-i18n-"));
  let store = await Store.open(dir);
  store.db.run("UPDATE translations SET en=? WHERE key=?", [
    "My content tools",
    "Inhalte",
  ]);
  const draft = createSite();
  store.save(draft, 0);
  store.flush();
  store.close();
  store = await Store.open(dir);
  assert.equal(store.translations("en")["Inhalte"], "My content tools");
  assert.equal(store.translations("de")["Inhalte"], "Inhalte");
  assert.deepEqual(store.draft(), draft);
  store.close();
  const instance = await createApp(dir);
  const server = instance.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(base + "/api/translations/en", {
      headers: { Origin: "http://localhost:8091" },
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://localhost:8091",
    );
    const body = await response.json();
    assert.equal(body.messages.Inhalte, "My content tools");
    assert.equal(
      Object.keys(body.messages).length,
      Object.keys(catalogue).length,
    );
    assert.equal((await fetch(base + "/api/translations/fr")).status, 400);
    const error = await fetch(base + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": "en" },
      body: JSON.stringify({ username: "admin", password: "wrong" }),
    });
    assert.equal((await error.json()).error, "Incorrect username or password.");
    const site = {
      ...draft,
      language: "en" as const,
      legal: {
        imprint: "Custom legal notice",
        privacy: "Custom privacy policy",
      },
    };
    instance.store.save(site, 1);
    instance.store.publish();
    const html = await (await fetch(base)).text();
    assert.match(html, /<html lang="en">/);
    assert.match(html, /Get in touch/);
    assert.match(html, /Built with Klarwarg/);
    // AGPL-3.0 §13: the public site links to the source code.
    assert.match(
      html,
      /class="klarwarg-credit" href="https:\/\/github\.com\/impiperl\/klarwerk"/,
    );
    assert.match(html, /class="klarwarg-badge"/);
    assert.match(html, /src="\/images\/klarwarg\.png"/);
    assert.equal((await fetch(base + "/images/klarwarg.png")).status, 200);
    assert.match(html, /Manchmal braucht es/); // Website content is not machine-translated.
    const legal = await (await fetch(base + "/impressum")).text();
    assert.match(legal, /<h1>Legal notice<\/h1>/);
    assert.match(legal, /Custom legal notice/);
    assert.equal(
      siteSchema.parse({ ...draft, language: undefined }).language,
      "de",
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    instance.store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Old admin accounts require password rotation once without losing their hash", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-rotation-migration-"));
  let store = await Store.open(dir);
  const old = { username: "admin", salt: "test", hash: "test-hash" };
  store.set("admin", JSON.stringify(old));
  store.flush();
  store.close();
  store = await Store.open(dir);
  try {
    const migrated = JSON.parse(store.get("admin")!);
    assert.equal(migrated.mustChangePassword, true);
    assert.equal(migrated.hash, old.hash);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
