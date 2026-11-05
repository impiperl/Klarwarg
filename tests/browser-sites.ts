/**
 * Browserprüfung für mehrere Websites: Adresse beim Veröffentlichen, Wechseln, Neu anlegen,
 * JSON-Sicherung und -Import je Website, Löschen. Braucht einen frischen Export in dist/.
 */
import { chromium } from "playwright";
import { createApp } from "../server/app.ts";
import { createSite } from "../src/model.ts";
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-browser-sites-"));
const { app, store } = await createApp(dir, {
  staticDir: path.resolve("dist"),
});
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || "/bin/google-chrome",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const confirms: string[] = [];
page.on("dialog", async (dialog) => {
  confirms.push(dialog.message());
  await dialog.accept();
});
mkdirSync("test-results", { recursive: true });
const draftUrl = /\/api\/draft(\?.*)?$/;
const api = async (route: string) =>
  (await page.request.get(base + "/api" + route)).json();
const savedDraft = () =>
  page.waitForResponse(
    (r) =>
      draftUrl.test(r.url()) &&
      r.request().method() === "PUT" &&
      r.status() === 200,
  );

try {
  // Einrichtung lokal ohne Code; das Cookie gilt auch für die Seite.
  assert.equal(
    (
      await page.request.post(base + "/api/setup", {
        data: { username: "admin", password: "test-password-12345" },
      })
    ).status(),
    200,
  );
  const iris = createSite();
  iris.name = "Iris";
  iris.legal.imprint = "Impressum Iris";
  iris.legal.privacy = "Datenschutz Iris";
  const first = await api("/draft");
  await page.request.put(base + "/api/draft?site=" + first.id, {
    data: { site: iris, revision: first.revision },
  });

  await page.goto(base + "/admin");
  const switcher = page.getByRole("combobox", { name: "Website wählen" });
  await switcher.waitFor();
  assert.match(await switcher.locator("option:checked").innerText(), /^Iris$/);

  // Erste Website: Startseite ist frei, also ist die Adresse leer vorbelegt.
  await page.getByRole("button", { name: "Veröffentlichen" }).first().click();
  const address = page.getByLabel("Adresse der Website");
  assert.equal(await address.inputValue(), "");
  await address.fill("admin");
  await page.getByText("Diese Adresse braucht Klarwarg selbst.").waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: "Jetzt veröffentlichen" })
      .isDisabled(),
  );
  await address.fill("iris");
  await page.getByRole("button", { name: "Jetzt veröffentlichen" }).click();
  await page.getByText("Deine Website ist veröffentlicht.").waitFor();
  let html = await (await page.request.get(base + "/iris")).text();
  assert.match(html, /<title>Iris/);
  assert.equal((await page.request.get(base + "/")).status(), 404);

  // JSON-Sicherung trägt die Adresse im Dateinamen, aber nicht im Inhalt.
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Website als JSON sichern" }).click();
  const file = await download;
  assert.equal(file.suggestedFilename(), "klarwarg-iris.json");
  const backup = JSON.parse(readFileSync(await file.path(), "utf8"));
  assert.equal(backup.name, "Iris");
  assert.equal("path" in backup, false);

  // Neue Website: Die Berufswahl öffnet sich gleich; sie wird erst einmal geschlossen.
  await page.getByRole("button", { name: "Neue Website anlegen" }).click();
  await page.locator(".template-card").first().waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".template-card").first().waitFor({ state: "hidden" });
  const sites = (await api("/sites")).sites;
  assert.equal(sites.length, 2);
  const second = sites.find((s: { name: string }) => s.name !== "Iris");
  assert.ok(second);
  assert.equal(
    await switcher.inputValue(),
    second.id,
    "der neue Entwurf ist offen",
  );

  // Die Iris-Sicherung in die neue Website laden: Die Rückfrage nennt die Zielwebsite,
  // und Iris' Adresse wandert nicht mit.
  const judith = { ...backup, name: "Judith" };
  judith.legal = { imprint: "Impressum Judith", privacy: "Datenschutz Judith" };
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  const saved = savedDraft();
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: "klarwarg-iris.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(judith)),
  });
  await saved;
  assert.ok(confirms.at(-1)!.includes(`„${second.name}“`), confirms.at(-1));
  assert.match(confirms.at(-1)!, /Die Adresse der Website bleibt/);
  assert.equal((await api("/draft?site=" + second.id)).site.name, "Judith");
  assert.equal((await api("/draft?site=" + first.id)).site.name, "Iris");
  assert.equal((await api("/draft?site=" + second.id)).path, null);

  // Veröffentlichen: /iris ist vergeben, / ist frei.
  await page.getByRole("button", { name: "Veröffentlichen" }).first().click();
  assert.equal(await address.inputValue(), "");
  await address.fill("iris");
  await page.getByText("Diese Adresse hat schon die Website „Iris“.").waitFor();
  await page.screenshot({ path: "test-results/sites-publish.png" });
  assert.ok(
    await page
      .getByRole("button", { name: "Jetzt veröffentlichen" })
      .isDisabled(),
  );
  await address.fill("Judith ");
  await page.getByRole("button", { name: "Jetzt veröffentlichen" }).click();
  await page.getByText("Deine Website ist veröffentlicht.").waitFor();
  html = await (await page.request.get(base + "/judith")).text();
  assert.match(html, /<title>Judith/);
  assert.match(html, /href="\/judith\/impressum"/);
  assert.match(
    await (await page.request.get(base + "/iris")).text(),
    /<title>Iris/,
  );
  await page.screenshot({ path: "test-results/sites-editor.png" });

  // Wechsel zurück zu Iris über die Kopfzeile: anderer Entwurf, andere Adresse.
  await switcher.selectOption(first.id);
  await page.waitForFunction(
    (id) =>
      (document.querySelector(".site-switcher") as HTMLSelectElement | null)
        ?.value === id,
    first.id,
  );
  await page.getByRole("button", { name: "Veröffentlichen" }).first().click();
  assert.equal(await address.inputValue(), "iris");
  await page.keyboard.press("Escape");
  // Nach dem Neuladen ist dieselbe Website wieder offen.
  await page.reload();
  await switcher.waitFor();
  assert.equal(await switcher.inputValue(), first.id);

  // Judith löschen; danach ist Iris offen und die letzte Website nicht löschbar.
  await switcher.selectOption(second.id);
  await page.waitForFunction(
    (id) =>
      (document.querySelector(".site-switcher") as HTMLSelectElement | null)
        ?.value === id,
    second.id,
  );
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await page.getByRole("button", { name: "Diese Website löschen" }).click();
  await page
    .getByRole("dialog")
    .getByText(/„Judith“ löschen/)
    .waitFor();
  await page
    .getByRole("button", { name: "Website löschen", exact: true })
    .click();
  await page.waitForFunction(
    (id) =>
      (document.querySelector(".site-switcher") as HTMLSelectElement | null)
        ?.value === id,
    first.id,
  );
  assert.equal((await api("/sites")).sites.length, 1);
  assert.equal((await page.request.get(base + "/judith")).status(), 404);
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  assert.ok(
    await page
      .getByRole("button", { name: "Diese Website löschen" })
      .isDisabled(),
  );
  assert.equal((await api("/draft")).site.name, "Iris");

  assert.deepEqual(errors, []);
  console.log(
    "Browserprüfung Websites erfolgreich: Adresse beim Veröffentlichen, reservierte und vergebene Adressen, JSON-Sicherung je Website, Import in eine andere Website, Wechsel, Neuladen, Löschen.",
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
