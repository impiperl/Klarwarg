import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { createSite, siteSchema } from "../src/model.ts";
import { Store } from "../server/store.ts";
import { renderPage } from "../server/render.ts";
import { exportTarget, exportWebsite } from "../server/export.ts";
import { createTranslator } from "../src/translations.ts";
import { describeIssue } from "../src/validation.ts";

const google =
  "https://play.google.com/store/apps/details?id=com.example.app&hl=de";
const apple = "https://apps.apple.com/at/app/example/id123456789";

test("Google Play: legacy documents default to empty, HTTPS Google links accepted, invalid hosts and credentials rejected", () => {
  const site = createSite("developer");
  const { googlePlayUrl, ...legacy } = site.integrations;
  assert.equal(googlePlayUrl, "");
  assert.equal(
    siteSchema.parse({ ...site, integrations: legacy }).integrations
      .googlePlayUrl,
    "",
  );
  assert.equal(
    siteSchema.parse({
      ...site,
      integrations: { ...legacy, googlePlayUrl: google },
    }).integrations.googlePlayUrl,
    google,
  );
  for (const url of [
    "http://play.google.com/store/apps/details?id=a",
    "https://play.google.com.evil.test/store",
    "https://evil.test/?play.google.com",
    "https://user:pass@play.google.com/store",
    "https://play.google.com:8443/store",
    "market://details?id=a",
    "play.google.com/store",
    "javascript:alert(1)",
  ]) {
    const result = siteSchema.safeParse({
      ...site,
      integrations: { ...legacy, googlePlayUrl: url },
    });
    assert.equal(result.success, false, url);
    if (result.success) continue;
    for (const language of ["de", "en"] as const) {
      const issue = describeIssue(
        result.error.issues[0],
        createTranslator(language),
      );
      assert.equal(issue.key, "integrations.googlePlayUrl");
      assert.match(issue.label, /Google[ -]Play/);
      assert.match(issue.message, /https:\/\/play.google.com\//);
    }
  }
});

test("both stores survive database restart and publication and appear together in HTML and ZIP", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-play-store-"));
  let store = await Store.open(dir);
  try {
    const site = createSite("developer");
    site.integrations.googlePlayUrl = google;
    site.integrations.appStoreUrl = apple;
    site.legal.imprint = "Imprint";
    site.legal.privacy = "Privacy";
    const id = store.createSite(site);
    store.publish(id, "developer");
    store.close();
    store = await Store.open(dir);
    assert.equal(store.draft(id)!.integrations.googlePlayUrl, google);
    const published = store.publicSite(id)!;
    assert.equal(published.integrations.appStoreUrl, apple);
    for (const language of ["de", "en"] as const) {
      published.language = language;
      const files = unzipSync(
        exportWebsite(published, exportTarget("https://example.at/dev/"), dir),
      );
      for (const html of [
        renderPage(published, "home", "https://example.at"),
        strFromU8(files["index.html"]),
      ]) {
        assert.ok(html.includes(`href="${google.replaceAll("&", "&amp;")}"`));
        assert.ok(html.includes(`href="${apple}"`));
        assert.match(html, /Google Play/);
      }
    }
    published.integrations.googlePlayUrl = "";
    assert.ok(
      !renderPage(published, "home", "https://example.at").includes(
        "play.google.com",
      ),
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
