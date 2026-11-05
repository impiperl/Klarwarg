import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { exportTarget, exportWebsite } from "../server/export.ts";
import { createSite } from "../src/model.ts";
import { createApp } from "../server/app.ts";

function fixture() {
  const site = createSite();
  site.name = "Export Test";
  site.legal.imprint = "Only the legal notice";
  site.legal.privacy = "Only the privacy policy";
  site.sections[0].blocks.find((b) => b.kind === "image")!.src =
    "/uploads/abc.webp";
  return site;
}

test("FTP ZIP contains public pages and referenced images, supports root and subfolder, preserves source", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-export-"));
  try {
    mkdirSync(path.join(dir, "uploads"));
    writeFileSync(path.join(dir, "uploads/abc.webp"), "uploaded image");
    writeFileSync(path.join(dir, "uploads/def.webp"), "unused private image");
    writeFileSync(path.join(dir, "klarwerk.sqlite"), "private database");
    const site = fixture();
    const original = JSON.stringify(site);
    for (const url of ["https://example.at", "https://example.at/iris/"]) {
      const target = exportTarget(url);
      const files = unzipSync(exportWebsite(site, target, dir));
      assert.deepEqual(
        Object.keys(files).sort(),
        [
          "assets/uploads/abc.webp",
          "assets/images/klarwarg.png",
          "datenschutz.html",
          "impressum.html",
          "index.html",
          "robots.txt",
          "site.css",
          "sitemap.xml",
        ].sort(),
      );
      const home = strFromU8(files["index.html"]);
      const imprint = strFromU8(files["impressum.html"]);
      assert.match(home, /src="assets\/uploads\/abc.webp"/);
      assert.match(home, /href="site.css"/);
      assert.match(home, /href="impressum.html"/);
      assert.match(home, /href="datenschutz.html"/);
      assert.ok(
        home.includes(`content="${target.href}assets/uploads/abc.webp"`),
      );
      assert.ok(home.includes(`rel="canonical" href="${target.href}"`));
      assert.ok(
        imprint.includes(`rel="canonical" href="${target.href}impressum.html"`),
      );
      assert.match(imprint, /href="index.html#kontakt"/);
      assert.match(imprint, /Only the legal notice/);
      assert.doesNotMatch(imprint, /Only the privacy policy/);
      assert.doesNotMatch(
        home,
        /<script(?! type="application\/ld\+json")|\/api\/|localhost|4317/,
      );
      assert.ok(strFromU8(files["sitemap.xml"]).includes(target.href));
    }
    assert.equal(JSON.stringify(site), original);
    // Missing references must fail instead of downloading a broken archive.
    site.sections[0].blocks.find((b) => b.kind === "image")!.src =
      "/uploads/fff.webp";
    assert.throws(() =>
      exportWebsite(site, exportTarget("https://example.at"), dir),
    );
    symlinkSync(
      path.join(dir, "klarwerk.sqlite"),
      path.join(dir, "uploads/fff.webp"),
    );
    assert.throws(() =>
      exportWebsite(site, exportTarget("https://example.at"), dir),
    );
    site.sections[0].blocks.find((b) => b.kind === "image")!.src =
      "/images/studio.svg";
    assert.ok(
      unzipSync(exportWebsite(site, exportTarget("https://example.at"), dir))[
        "assets/images/studio.svg"
      ],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("export destination rejects invalid URLs, credentials, queries and fragments", () => {
  for (const url of [
    "",
    "example.at",
    "ftp://example.at",
    "javascript:alert(1)",
    "https://user:secret@example.at",
    "https://example.at/?x=1",
    "https://example.at/#test",
  ])
    assert.throws(() => exportTarget(url));
});

test("export API requires login, validates legal pages and exports only the selected current draft snapshot", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-export-api-"));
  const { app, store } = await createApp(dir);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr !== "string");
  const base = `http://127.0.0.1:${addr.port}`;
  let cookie = "";
  const post = (route: string, body: unknown) =>
    fetch(base + "/api" + route, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await post("/export", {})).status, 401);
    const setup = await post("/setup", {
      username: "admin",
      password: "test-password-12345",
    });
    cookie = setup.headers.get("set-cookie")!.split(";")[0];
    const site = createSite();
    assert.equal(
      (await post("/export", { site, targetUrl: "https://example.at/" }))
        .status,
      409,
    );
    site.legal.imprint = "Imprint";
    site.legal.privacy = "Privacy";
    assert.equal(
      (await post("/export", { site, targetUrl: "bad" })).status,
      400,
    );
    assert.equal(
      (
        await post("/export?site=missing", {
          site,
          targetUrl: "https://example.at/",
        })
      ).status,
      404,
    );
    site.name = "Unsaved snapshot";
    const second = await (await post("/sites", { profession: "law" })).json();
    const response = await post("/export?site=" + second.id, {
      site,
      targetUrl: "https://example.at/other/",
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type")!, /application\/zip/);
    assert.match(response.headers.get("content-disposition")!, /attachment/);
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    assert.match(strFromU8(files["index.html"]), /Unsaved snapshot/);
    assert.notEqual(store.draft(second.id)?.name, site.name);
    assert.equal(store.publicSite(second.id), undefined);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
