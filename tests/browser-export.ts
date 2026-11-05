/** Download through the real editor, then browse the extracted ZIP on plain static hosting. */
import { chromium } from "playwright";
import express from "express";
import { createApp } from "../server/app.ts";
import { createSite } from "../src/model.ts";
import { unzipSync } from "fflate";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-static-browser-"));
const { app, store } = await createApp(path.join(dir, "data"), {
  staticDir: path.resolve("dist"),
});
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
const host = express()
  .use(express.static(path.join(dir, "hosting")))
  .listen(0, "127.0.0.1");
await new Promise<void>((resolve) => host.once("listening", resolve));
const addr = host.address();
assert.ok(addr && typeof addr !== "string");
const destination = `http://127.0.0.1:${addr.port}/iris/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || "/bin/google-chrome",
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1500, height: 1000 },
  });
  const setup = await context.request.post(base + "/api/setup", {
    data: { username: "admin", password: "test-password-12345" },
  });
  assert.equal(setup.status(), 200);
  const site = createSite();
  site.name = "Static browser test";
  site.legal.imprint = "Export Imprint";
  site.legal.privacy = "Export Privacy";
  const draft = await (await context.request.get(base + "/api/draft")).json();
  assert.equal(
    (
      await context.request.put(base + "/api/draft", {
        data: { site, revision: draft.revision },
      })
    ).status(),
    200,
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/admin");
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Zieladresse für HTML-Export", { exact: true })
    .fill(destination);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Website als HTML-ZIP exportieren",
      exact: true,
    })
    .click();
  const download = await downloaded;
  assert.ok(download.suggestedFilename().endsWith(".zip"));
  const file = await download.path();
  assert.ok(file);
  for (const [name, bytes] of Object.entries(unzipSync(readFileSync(file)))) {
    const target = path.join(dir, "hosting/iris", name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  // Stop the application: the archive must work with only an ordinary static server.
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  page.on("requestfailed", (r) => failed.push(r.url()));
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto(destination);
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.locator('link[rel="canonical"]').getAttribute("href"),
      destination,
    );
    assert.ok(
      await page
        .locator(".site-surface")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--site-primary"),
        ),
    );
    for (const image of await page.locator("img").all()) {
      await image.scrollIntoViewIfNeeded();
      try {
        await image.evaluate((img: HTMLImageElement) => img.decode());
      } catch (error) {
        throw new Error(
          `Image decode failed: ${await image.getAttribute("src")}; requests: ${failed.join(", ")}`,
          { cause: error },
        );
      }
      assert.ok(
        await image.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      );
    }
    await page.getByRole("link", { name: "Impressum", exact: true }).click();
    assert.match(page.url(), /\/iris\/impressum.html$/);
    assert.ok(
      (await page.locator("main").innerText()).includes("Export Imprint"),
    );
    await page.locator(".legal-back").click();
    assert.match(page.url(), /\/iris\/index.html$/);
    await page.getByRole("link", { name: "Datenschutz", exact: true }).click();
    assert.ok(
      (await page.locator("main").innerText()).includes("Export Privacy"),
    );
    await page
      .getByRole("link", { name: "Kontakt", exact: true })
      .first()
      .click();
    assert.match(page.url(), /\/iris\/index.html#kontakt$/);
  }
  assert.deepEqual(failed, []);
  assert.deepEqual(errors, []);
  console.log(
    "HTML ZIP download and standalone static hosting: desktop/mobile, CSS, images, legal pages and navigation OK",
  );
} finally {
  await browser.close();
  if (server.listening)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => host.close(() => resolve()));
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
