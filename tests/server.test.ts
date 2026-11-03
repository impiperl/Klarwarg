import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app.ts";
import { Store } from "../server/store.ts";
import {
  changeVoice,
  createSite,
  careers,
  otherAddress,
  siteSchema,
  snapBlock,
} from "../src/model.ts";
import { githubRepos } from "../server/github.ts";

test("App Store: alte Entwürfe bleiben gültig und nur öffentliche Apple-HTTPS-Links sind erlaubt", () => {
  const site = createSite("developer");
  const { appStoreUrl, ...legacy } = site.integrations;
  assert.equal(
    siteSchema.parse({ ...site, integrations: legacy }).integrations
      .appStoreUrl,
    "",
  );
  const valid = "https://apps.apple.com/at/app/example/id123456789";
  assert.equal(
    siteSchema.parse({
      ...site,
      integrations: { ...legacy, appStoreUrl: valid },
    }).integrations.appStoreUrl,
    valid,
  );
  for (const url of [
    "javascript:alert(1)",
    "http://apps.apple.com/app/id1",
    "https://apps.apple.com.evil.test/app/id1",
    "https://evil.test/app/id1",
    "https://user:pass@apps.apple.com/app/id1",
  ])
    assert.equal(
      siteSchema.safeParse({
        ...site,
        integrations: { ...legacy, appStoreUrl: url },
      }).success,
      false,
    );
});

test("Berufsvorlagen und Koordinaten sind gültig; aktive Inhalte werden abgewiesen", () => {
  for (const career of careers)
    assert.equal(siteSchema.parse(createSite(career.id)).profession, career.id);
  const site = createSite();
  const image = site.sections
    .flatMap((section) => section.blocks)
    .find((block) => block.kind === "image")!;
  assert.equal(image.imageShape, "arch");
  const { imageShape, ...legacyImage } = image;
  const legacySite = {
    ...site,
    sections: [{ ...site.sections[0], blocks: [legacyImage] }],
  };
  assert.equal(
    siteSchema.parse(legacySite).sections[0].blocks[0].imageShape,
    "arch",
  );
  assert.equal(
    siteSchema.safeParse({
      ...site,
      sections: [
        { ...site.sections[0], blocks: [{ ...image, imageShape: "unknown" }] },
      ],
    }).success,
    false,
  );

  assert.deepEqual(
    snapBlock({ ...site.sections[0].blocks[0], x: 43, y: 29, w: 440 }, site),
    { ...site.sections[0].blocks[0], x: 0, y: 32, w: 440 },
  );
  assert.equal(
    siteSchema.safeParse({
      ...site,
      integrations: { ...site.integrations, bookingUrl: "javascript:alert(1)" },
    }).success,
    false,
  );
  assert.equal(
    siteSchema.safeParse({ ...site, colors: ["red"] }).success,
    false,
  );
  assert.equal(
    siteSchema.safeParse({
      ...site,
      contact: { ...site.contact, email: "kein-mail" },
    }).success,
    false,
  );
});
test("Anrede: Vorlagen siezen oder duzen, Umschalten nimmt nur unveränderte Texte mit", () => {
  const texts = (site: ReturnType<typeof createSite>) =>
    [
      site.tagline,
      ...site.sections.flatMap((s) => s.blocks.map((b) => b.text)),
    ].join(" ");
  for (const career of careers) {
    const formal = createSite(career.id, {
        formal: true,
        team: career.voice.team,
      }),
      informal = createSite(career.id, {
        formal: false,
        team: career.voice.team,
      });
    // Vorlagen enthalten nur die eigene Anrede; der Hinweis an die Betreiber duzt immer.
    assert.equal(otherAddress(informal).blocks.length, 0, career.id);
    assert.equal(otherAddress(formal).blocks.length, 1, career.id);
    assert.doesNotMatch(texts(informal), /\b(Ihnen|Ihre?[mnrs]?)\b/, career.id);
    assert.equal(new Set(career.services.map((s) => s.description)).size, 3);
  }
  assert.equal(createSite("law").voice.formal, true);
  assert.equal(createSite("coaching").voice.formal, false);
  assert.match(texts(createSite("law")), /Wir machen komplexe Fragen/);

  const site = createSite("coaching");
  const edited = {
    ...site,
    sections: site.sections.map((s, i) =>
      i === 0
        ? {
            ...s,
            blocks: s.blocks.map((b, j) =>
              j === 2 ? { ...b, text: "Ich höre dir zu." } : b,
            ),
          }
        : s,
    ),
  };
  const formal = changeVoice(edited, { formal: true, team: false });
  assert.equal(formal.voice.formal, true);
  assert.equal(
    formal.sections[0].blocks[1].text,
    "Ihr nächster Schritt.\nMit einem klaren Blick.",
  );
  assert.equal(formal.sections[0].blocks[2].text, "Ich höre dir zu.");
  assert.deepEqual(otherAddress(formal).blocks[0], {
    section: "start",
    block: formal.sections[0].blocks[2].id,
  });
  const team = changeVoice(formal, { formal: true, team: true });
  assert.equal(team.sections[1].label, "Über uns");
  assert.match(
    team.sections[1].blocks[2].text,
    /^Willkommen bei \{name\}\. Uns ist wichtig/,
  );
  // Ältere Entwürfe ohne Anrede bleiben beim Du.
  const { voice: _, ...old } = site;
  assert.deepEqual(siteSchema.parse(old).voice, { formal: false, team: false });
});
test("GitHub importiert alle Seiten und nur öffentliche nutzbare Repositories", async () => {
  const calls: string[] = [];
  const request = (async (url: string | URL | Request) => {
    calls.push(String(url));
    const page = new URL(String(url)).searchParams.get("page");
    const list = Array.from({ length: page === "1" ? 100 : 2 }, (_, i) => ({
      id: (page === "1" ? 0 : 100) + i,
      name: "repo-" + i,
      html_url: "https://github.com/test/repo-" + i,
      private: page === "2" && i === 1,
      disabled: false,
      description: null,
      language: "TypeScript",
      stargazers_count: 2,
      fork: false,
    }));
    return new Response(JSON.stringify(list), { status: 200 });
  }) as typeof fetch;
  const result = await githubRepos("test", request);
  assert.equal(result.length, 101);
  assert.equal(calls.length, 2);
  assert.equal(result[0].description, "");
  await assert.rejects(() => githubRepos("../bad", request), /Benutzernamen/);
  await assert.rejects(
    () =>
      githubRepos(
        "test",
        (async () => new Response("{}", { status: 403 })) as typeof fetch,
      ),
    /Anfragelimit/,
  );
});
test("Adminschutz, Entwurf/Live-Trennung, Konflikte, Wiederherstellung, Uploads und SQLite-Neustart", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-test-"));
  const { app, store } = await createApp(dir);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  let cookie = "";
  async function call(
    route: string,
    body?: unknown,
    method?: string,
    extra: Record<string, string> = {},
  ) {
    const r = await fetch(base + "/api" + route, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json(), headers: r.headers };
  }
  try {
    assert.equal((await call("/draft")).status, 401);
    assert.equal((await call("/site")).status, 404);
    assert.equal(
      (await call("/setup", { username: "admin", password: "short" })).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/setup",
          { username: "admin", password: "test-password-12345" },
          undefined,
          { Origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    const setup = await call("/setup", {
      username: "admin",
      password: "test-password-12345",
    });
    assert.equal(setup.status, 200);
    cookie = setup.headers.get("set-cookie")!.split(";")[0];
    assert.match(setup.headers.get("set-cookie")!, /HttpOnly/);
    assert.equal(
      (
        await call("/setup", {
          username: "other",
          password: "test-password-12345",
        })
      ).status,
      409,
    );
    let draft = await call("/draft");
    assert.equal(draft.status, 200);
    let site = draft.json.site;
    site.name = "Meine Praxis";
    const saved = await call(
      "/draft",
      { site, revision: draft.json.revision },
      "PUT",
    );
    assert.equal(saved.status, 200);
    assert.equal(
      (await call("/draft", { site, revision: draft.json.revision }, "PUT"))
        .status,
      409,
    );
    assert.equal((await call("/site")).status, 404);
    // Ohne Impressum und Datenschutz geht nichts online.
    const noLegal = await call("/publish", {});
    assert.equal(noLegal.status, 409);
    assert.match(noLegal.json.error, /Impressum/);
    const unpublished = await fetch(base + "/");
    assert.equal(unpublished.status, 404);
    assert.match(await unpublished.text(), /noindex/);
    site = {
      ...site,
      contact: { ...site.contact, email: "praxis@example.test" },
      legal: {
        imprint: "Meine Praxis\nMusterweg 1",
        privacy: "Keine Cookies.",
      },
    };
    const withLegal = await call(
      "/draft",
      { site, revision: saved.json.revision },
      "PUT",
    );
    assert.equal(withLegal.status, 200);
    const published = await call("/publish", {});
    assert.equal(published.status, 200);
    assert.equal((await call("/site")).json.site.name, "Meine Praxis");
    // Die öffentliche Seite kommt als fertiges HTML: Titel, Sprache, Beschreibung, Inhalt.
    const home = await fetch(base + "/");
    const html = await home.text();
    assert.equal(home.status, 200);
    assert.match(html, /<html lang="de">/);
    assert.match(html, /<title>Meine Praxis · /);
    assert.match(html, /<meta name="description" content="Manchmal braucht/);
    assert.match(html, /"@type":"Physician"/);
    assert.match(html, /"email":"praxis@example.test"/);
    assert.match(html, /<h1>/);
    assert.match(
      html,
      /Willkommen bei Meine Praxis\. Mir ist wichtig, dass Sie/,
    );
    assert.match(html, /So kann ich für Sie da sein\./);
    assert.doesNotMatch(html, /\{name\}/);
    assert.match(html, /href="\/impressum"/);
    assert.doesNotMatch(html, /<script(?! type="application\/ld\+json")/);
    assert.match(
      home.headers.get("content-security-policy")!,
      /default-src 'none'/,
    );
    const imprint = await (await fetch(base + "/impressum")).text();
    assert.match(imprint, /<h1>Impressum<\/h1>/);
    assert.match(imprint, /Musterweg 1/);
    assert.match(imprint, /noindex, follow/);
    assert.match(imprint, /href="\/#kontakt"/);
    assert.match(
      await (await fetch(base + "/robots.txt")).text(),
      /Disallow: \/admin/,
    );
    assert.match(
      await (await fetch(base + "/sitemap.xml")).text(),
      /<loc>http:\/\/127\.0\.0\.1:\d+\/<\/loc>/,
    );
    const stylesheet = html.match(/href="(\/site\.css\?v=\w+)"/)![1];
    assert.match(
      (await fetch(base + stylesheet)).headers.get("cache-control")!,
      /immutable/,
    );
    site = { ...site, name: "Entwurf neu" };
    await call("/draft", { site, revision: withLegal.json.revision }, "PUT");
    assert.match(
      await (await fetch(base + "/")).text(),
      /<title>Meine Praxis · /,
    );
    assert.equal((await call("/site")).json.site.name, "Meine Praxis");
    const versions = await call("/versions");
    assert.equal(versions.json.versions.length, 1);
    const restored = await call("/restore/" + published.json.id, {});
    assert.equal(restored.json.site.name, "Meine Praxis");
    assert.equal(
      (
        await call("/upload", {
          data:
            "data:image/png;base64," +
            Buffer.from("<script>evil</script>").toString("base64"),
        })
      ).status,
      400,
    );
    const image = await call("/upload", {
      data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    });
    assert.equal(image.status, 200);
    assert.equal(
      (await fetch(base + image.json.url)).headers.get(
        "x-content-type-options",
      ),
      "nosniff",
    );
    assert.equal(
      (
        await call("/password", {
          current: "wrong",
          password: "new-test-password-12345",
        })
      ).status,
      401,
    );
    const pw = await call("/password", {
      current: "test-password-12345",
      password: "new-test-password-12345",
    });
    assert.equal(pw.status, 200);
    assert.equal((await call("/draft")).status, 401);
    cookie = pw.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await call("/draft")).status, 200);
    assert.equal(
      readFileSync(path.join(dir, "klarwerk.sqlite"))
        .subarray(0, 15)
        .toString(),
      "SQLite format 3",
    );
    const reopened = await Store.open(dir);
    assert.equal(reopened.publicSite()?.name, "Meine Praxis");
    assert.equal(reopened.authenticated(cookie.split("=")[1]), true);
    reopened.close();
    await call("/logout", {});
    assert.equal((await call("/draft")).status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("Über Proxy oder Domain braucht die Einrichtung den Code aus der Konsole", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-setup-"));
  const { app, store, setupCode } = await createApp(dir);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const proxied = { "X-Forwarded-For": "203.0.113.9" };
  const setup = (body: object) =>
    fetch(base + "/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proxied },
      body: JSON.stringify(body),
    });
  try {
    const auth = await (
      await fetch(base + "/auth", { headers: proxied })
    ).json();
    assert.equal(auth.setupCode, true);
    assert.equal((await (await fetch(base + "/auth")).json()).setupCode, false);
    const credentials = { username: "admin", password: "test-password-12345" };
    assert.equal((await setup(credentials)).status, 403);
    assert.equal(
      (await setup({ ...credentials, setupCode: "FALSCH" })).status,
      403,
    );
    assert.equal(
      (await setup({ ...credentials, setupCode: setupCode.toLowerCase() }))
        .status,
      200,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
