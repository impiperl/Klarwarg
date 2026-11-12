import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { createSite, siteSchema, logoIconIds } from "../src/model.ts";
import { logoIcons } from "../src/SiteLogo.tsx";
import { Store } from "../server/store.ts";
import { renderPage } from "../server/render.ts";
import { exportTarget, exportWebsite } from "../server/export.ts";

test("legacy sites retain leaf; all configured icons render and invalid choices fail", () => {
  const site = createSite();
  const { logo, ...legacy } = site;
  assert.deepEqual(siteSchema.parse(legacy).logo, {
    mode: "icon",
    icon: "leaf",
    src: "",
  });
  assert.deepEqual(
    logoIcons.map((i) => i.id),
    [...logoIconIds],
  );
  for (const { id, Icon } of logoIcons) {
    site.logo = { mode: "icon", icon: id, src: "" };
    const html = renderPage(site, "home", "https://example.at");
    assert.match(html, /class="site-brand-icon"/);
    assert.ok(html.includes("lucide-"));
    assert.equal(siteSchema.safeParse(site).success, true);
  }
  for (const logo of [
    { mode: "icon", icon: "invalid", src: "" },
    { mode: "image", icon: "leaf", src: "javascript:alert(1)" },
    { mode: "image", icon: "leaf", src: "/../../private" },
  ])
    assert.equal(siteSchema.safeParse({ ...site, logo }).success, false);
});

test("logo persists per website, follows publication, appears on all pages and in ZIP assets", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-logo-"));
  let store = await Store.open(dir);
  try {
    mkdirSync(path.join(dir, "uploads"));
    writeFileSync(path.join(dir, "uploads/abc.webp"), "logo image");
    const site = createSite();
    site.cv = { enabled: true, text: "Career" };
    site.logo = { mode: "image", icon: "scale", src: "/uploads/abc.webp" };
    store.save(site, 0);
    store.publish(undefined, "iris");
    const otherId = store.createSite(createSite());
    assert.equal(store.draft(otherId)?.logo.icon, "leaf");
    store.close();
    store = await Store.open(dir);
    assert.deepEqual(store.siteAt("iris")?.site.logo, site.logo);
    const changed = structuredClone(site);
    changed.logo = { mode: "icon", icon: "heart", src: "" };
    store.save(changed, store.revision());
    assert.equal(store.siteAt("iris")?.site.logo.mode, "image");
    for (const page of ["home", "imprint", "privacy", "cv"] as const) {
      const html = renderPage(site, page, "https://example.at", {}, "/iris");
      assert.match(html, /class="site-brand-image"/);
      assert.match(html, /src="\/uploads\/abc.webp" alt=""/);
    }
    const original = JSON.stringify(site);
    for (const url of ["https://example.at", "https://example.at/iris/"]) {
      const files = unzipSync(exportWebsite(site, exportTarget(url), dir));
      assert.equal(strFromU8(files["assets/uploads/abc.webp"]), "logo image");
      for (const name of [
        "index.html",
        "impressum.html",
        "datenschutz.html",
        "lebenslauf.html",
      ])
        assert.match(
          strFromU8(files[name]),
          /src="assets\/uploads\/abc.webp" alt=""/,
        );
    }
    assert.equal(JSON.stringify(site), original);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
