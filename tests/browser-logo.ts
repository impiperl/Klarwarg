import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { createApp } from "../server/app.ts";
import { createSite } from "../src/model.ts";

const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-logo-browser-"));
const { app, store } = await createApp(dir, {
  staticDir: path.resolve("dist"),
});
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const addr = server.address();
assert.ok(addr && typeof addr !== "string");
const base = `http://127.0.0.1:${addr.port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || "/bin/google-chrome",
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
  });
  assert.equal(
    (
      await context.request.post(base + "/api/setup", {
        data: { username: "admin", password: "test-password-12345" },
      })
    ).status(),
    200,
  );
  const site = createSite();
  site.name = "Logo Browser";
  site.legal = { imprint: "Imprint", privacy: "Privacy" };
  site.cv = { text: "CV", enabled: true };
  store.save(site, store.revision());
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/admin");
  // Clicking the existing mark opens and focuses the correct editor field.
  await page.locator(".paper .site-brand-icon").click();
  await page.getByRole("heading", { name: "Logo neben dem Namen" }).waitFor();
  const iconSaved = page.waitForResponse(
    (r) =>
      r.url().includes("/api/draft") &&
      r.request().method() === "PUT" &&
      r.request().postDataJSON()?.site?.logo?.icon === "scale",
  );
  await page
    .getByRole("button", { name: "Logo-Symbol: Waage", exact: true })
    .click();
  assert.equal((await iconSaved).status(), 200);
  assert.equal(
    await page.locator(".paper .site-brand-icon .lucide-scale").count(),
    1,
  );
  await page.reload();
  assert.equal(
    await page
      .getByRole("button", { name: "Logo-Symbol: Waage", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Eigenes Bild", exact: true }).click();
  const image = createCanvas(100, 70);
  const ctx = image.getContext("2d");
  ctx.fillStyle = "#315648";
  ctx.fillRect(20, 10, 60, 50);
  const imageSaved = page.waitForResponse(
    (r) =>
      r.url().includes("/api/draft") &&
      r.request().method() === "PUT" &&
      !!r.request().postDataJSON()?.site?.logo?.src,
  );
  await page
    .locator(
      'input[type="file"][accept="image/png,image/jpeg,image/webp,image/gif"]',
    )
    .setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: image.toBuffer("image/png"),
    });
  assert.equal((await imageSaved).status(), 200);
  await page.locator(".paper .site-brand-image img").waitFor();
  const saved = store.draft()!;
  assert.equal(saved.logo.mode, "image");
  assert.match(saved.logo.src, /^\/uploads\//);
  assert.equal(
    (
      await context.request.post(base + "/api/publish", {
        data: { path: "iris" },
      })
    ).status(),
    200,
  );
  const publicPage = await context.newPage();
  for (const route of [
    "/iris",
    "/iris/impressum",
    "/iris/datenschutz",
    "/iris/lebenslauf",
  ]) {
    await publicPage.goto(base + route);
    const img = publicPage.locator(".site-brand-image img");
    assert.equal(await img.getAttribute("src"), saved.logo.src);
    assert.equal(
      await img.evaluate(
        (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
      ),
      true,
    );
  }
  await publicPage.goto(base + "/iris");
  for (const width of [1500, 390]) {
    await publicPage.setViewportSize({ width, height: 950 });
    assert.equal(
      await publicPage.locator(".site-brand-image img").isVisible(),
      true,
    );
    assert.equal(
      await publicPage.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      ),
      false,
    );
  }
  await page.reload();
  await page.getByRole("button", { name: "Icon", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Logo-Symbol: Waage", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Eigenes Bild", exact: true }).click();
  assert.equal(
    await page
      .getByRole("img", { name: "Logo-Vorschau", exact: true })
      .getAttribute("src"),
    saved.logo.src,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Logo browser passed: icon choice, upload, persistence, all pages, desktop/mobile",
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
