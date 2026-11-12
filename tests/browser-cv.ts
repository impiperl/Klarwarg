/** CV import through the editor, then inspect the public page without JavaScript. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { createApp } from "../server/app.ts";
import { createSite } from "../src/model.ts";

const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-cv-browser-"));
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
  site.name = "CV Browser";
  site.legal = { imprint: "Imprint", privacy: "Privacy" };
  store.save(site, store.revision());
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/admin");
  await page
    .getByRole("button", { name: "Lebenslauf / CV", exact: true })
    .first()
    .click();
  const input = page.locator('input[type="file"][accept=".pdf,.docx,.odt"]');
  await input.setInputFiles({
    name: "resume.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(
      zipSync({
        "word/document.xml": strToU8(
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Software Engineering 2020</w:t></w:r></w:p></w:body></w:document>',
        ),
      }),
    ),
  });
  await page.getByRole("heading", { name: "Erkannten Text prüfen" }).waitFor();
  assert.equal(
    await page.getByLabel("Lebenslauftext", { exact: true }).inputValue(),
    "",
  );
  await page
    .getByLabel("Importvorschau", { exact: true })
    .fill("Software Engineering 2020\n\nBeratung <script>alert(1)</script>");
  await page
    .getByRole("button", {
      name: "Text in den Entwurf übernehmen",
      exact: true,
    })
    .click();
  assert.match(
    await page.getByLabel("Lebenslauftext", { exact: true }).inputValue(),
    /Software Engineering/,
  );
  const savedCv = page.waitForResponse(
    (r) =>
      r.url().includes("/api/draft") &&
      r.request().method() === "PUT" &&
      !!r.request().postDataJSON()?.site?.cv?.enabled,
  );
  await page
    .getByLabel("Lebenslauf als öffentliche Unterseite anzeigen", {
      exact: true,
    })
    .check();
  await page
    .locator(".paper .cv-content")
    .getByRole("heading", { name: /Lebenslauf/ })
    .waitFor();
  assert.equal((await savedCv).status(), 200);
  assert.equal(store.draft()?.cv.enabled, true);
  assert.equal(
    (
      await context.request.post(base + "/api/publish", {
        data: { path: "iris" },
      })
    ).status(),
    200,
  );
  const response = await context.request.get(base + "/iris/lebenslauf");
  assert.equal(response.status(), 200);
  assert.doesNotMatch(await response.text(), /noindex|<script>alert/);
  assert.deepEqual(readdirSync(path.join(dir, "uploads")), []);
  // Reload editor: accepted text is persisted, original import preview is gone.
  await page.reload();
  await page
    .getByRole("button", { name: "Lebenslauf / CV", exact: true })
    .first()
    .click();
  assert.match(
    await page.getByLabel("Lebenslauftext", { exact: true }).inputValue(),
    /Software Engineering/,
  );
  assert.equal(
    await page.getByLabel("Importvorschau", { exact: true }).count(),
    0,
  );
  const publicContext = await browser.newContext({ javaScriptEnabled: false });
  const publicPage = await publicContext.newPage();
  for (const width of [1500, 390]) {
    await publicPage.setViewportSize({ width, height: 950 });
    await publicPage.goto(base + "/iris");
    await publicPage
      .getByRole("link", { name: "Lebenslauf", exact: true })
      .click();
    await publicPage
      .getByRole("heading", { name: "Lebenslauf · CV Browser" })
      .waitFor();
    assert.ok(
      (await publicPage.locator("main").innerText()).includes(
        "Beratung <script>",
      ),
    );
    assert.equal(
      await publicPage.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      ),
      false,
    );
  }
  await publicContext.close();
  assert.deepEqual(errors, []);
  console.log(
    "CV browser: import, review, persistence, publication, no-JS desktop/mobile passed",
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
