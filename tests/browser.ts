import { chromium } from "playwright";
import { createApp } from "../server/app.ts";
import { createAdmin } from "../server/admin.ts";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const dir = mkdtempSync(path.join(tmpdir(), "klarwarg-browser-"));
const { app, store } = await createApp(dir, {
  staticDir: path.resolve("dist"),
  request: (async (url: any, options: any) => {
    if (String(url).startsWith("https://api.github.com/"))
      return new Response(
        JSON.stringify([
          {
            id: 1,
            name: "mein-projekt",
            html_url: "https://github.com/octocat/Hello-World",
            description: "Mein öffentliches Projekt",
            language: "TypeScript",
            stargazers_count: 7,
            fork: false,
            private: false,
            disabled: false,
          },
          {
            id: 2,
            name: "zweites-projekt",
            html_url: "https://github.com/octocat/second-project",
            description: "Ein weiteres Projekt",
            language: "TypeScript",
            stargazers_count: 0,
            fork: false,
            private: false,
            disabled: false,
          },
        ]),
        { status: 200 },
      );
    return fetch(url, options);
  }) as typeof fetch,
});
createAdmin(store, { username: "admin", password: "test123" });
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
mkdirSync("test-results", { recursive: true });
try {
  await page.goto(base + "/admin");
  await page.getByTestId("language-switch").selectOption("en");
  await page.getByRole("heading", { name: "Good to see you." }).waitFor();
  await page.locator('.wordmark img[src="/images/klarwarg.png"]').waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Good to see you." }).waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Incorrect username or password." })
    .waitFor();
  await page.getByTestId("language-switch").selectOption("de");
  await page.getByLabel("Benutzername", { exact: true }).fill("admin");
  await page.getByLabel("Passwort", { exact: true }).fill("test123");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page
    .getByRole("heading", { name: "Bitte ändere zuerst dein Startpasswort." })
    .waitFor();
  assert.equal((await page.request.get(base + "/api/draft")).status(), 403);
  await page.getByTestId("language-switch").selectOption("en");
  await page
    .getByRole("heading", {
      name: "Please change your initial password first.",
    })
    .waitFor();
  await page.getByTestId("language-switch").selectOption("de");
  await page.getByLabel("Bisheriges Passwort", { exact: true }).fill("test123");
  await page
    .getByLabel("Neues Passwort (mind. 12 Zeichen)", { exact: true })
    .fill("browser-new-password-123");
  await page
    .getByLabel("Passwort wiederholen", { exact: true })
    .fill("browser-other-password-123");
  await page
    .getByRole("button", { name: "Passwort speichern und fortfahren" })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Die Passwörter stimmen nicht überein." })
    .waitFor();
  await page
    .getByLabel("Passwort wiederholen", { exact: true })
    .fill("browser-new-password-123");
  await page
    .getByRole("button", { name: "Passwort speichern und fortfahren" })
    .click();

  await page
    .getByRole("heading", { name: "Deine Website. Dein Anfang." })
    .waitFor();
  const originalDraft = await (
    await page.request.get(base + "/api/draft")
  ).json();
  await page.getByTestId("language-switch").selectOption("en");
  await page
    .getByRole("heading", { name: "Your website. Your beginning." })
    .waitFor();
  for (const name of [
    "Design",
    "Grid",
    "Integrations",
    "Settings",
    "Content",
  ]) {
    await page
      .getByRole("navigation", { name: "Editor tools" })
      .getByRole("button", { name, exact: true })
      .click();
  }
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.deepEqual(
    (await (await page.request.get(base + "/api/draft")).json()).site,
    originalDraft.site,
  );
  await page.screenshot({
    path: "test-results/editor-english.png",
    fullPage: true,
  });
  await page.getByTestId("language-switch").selectOption("de");
  await page
    .getByRole("heading", { name: "Deine Website. Dein Anfang." })
    .waitFor();
  await page.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: true,
  });
  // Eine frische Vorlage hat keinen Text, der über seinen Kasten läuft.
  assert.equal(await page.locator(".is-overflowing").count(), 0);
  assert.equal(
    Math.round((await page.locator(".builder").boundingBox())!.width),
    1600,
  );
  await page
    .getByRole("button", { name: "Header & Navigation", exact: true })
    .click();
  await page
    .getByLabel("Name / Unternehmen", { exact: true })
    .fill("Dr. Anna Sommer");
  await page.getByLabel("E-Mail", { exact: true }).fill("praxis@example.test");
  await page.getByRole("button", { name: "Raster", exact: true }).click();
  await page
    .getByLabel("Eigene Spaltenanzahl (1–24)", { exact: true })
    .fill("6");
  await page.getByLabel("Raster einblenden", { exact: false }).check();
  assert.equal(await page.locator(".grid-overlay span").count(), 12);
  await page.getByLabel("Raster einblenden", { exact: false }).uncheck();
  // Canvas clicks open the matching field, including closed panels and details.
  await page.locator(".site-brand small").click();
  await page.waitForFunction(
    (selector) => document.querySelector(selector) === document.activeElement,
    '[data-editor-field="tagline"]',
  );
  await page.locator(".service-grid article").first().locator("p").click();
  await page.waitForFunction(
    (selector) => document.querySelector(selector) === document.activeElement,
    '[data-editor-field="service-0-description"]',
  );
  await page.locator('.site-contact a[href^="mailto:"]').click();
  await page.waitForFunction(
    (selector) => document.querySelector(selector) === document.activeElement,
    '[data-editor-field="contact-email"]',
  );
  await page.locator(".site-header-cta").click();
  await page.waitForFunction(
    (selector) => document.querySelector(selector) === document.activeElement,
    '[data-editor-field="integration-booking"]',
  );
  await page
    .locator(".site-footer")
    .getByRole("button", { name: "Impressum", exact: true })
    .click();
  await page.waitForFunction(
    (selector) => document.querySelector(selector) === document.activeElement,
    '[data-editor-field="legal-imprint"]',
  );
  await page.getByRole("button", { name: "Eigenschaften schließen" }).click();
  await page.locator(".block-image").first().click();
  await page.waitForFunction(
    (selector) => document.querySelector(selector) === document.activeElement,
    '[data-editor-field="block-image"]',
  );
  await page.locator(".block-heading").first().click();
  await page.waitForFunction(
    (selector) => document.querySelector(selector) === document.activeElement,
    "#block-text",
  );
  await page.getByLabel("X · horizontal").focus();
  await page.locator(".block-heading").first().click();
  await page.waitForFunction(() => document.activeElement?.id === "block-text");
  await page.locator(".site-brand small").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("data-editor-field") === "tagline",
  );
  const navigationItem = page.locator(".site-header nav a").first();
  await navigationItem.click();
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("data-editor-field") ===
      "section-label",
  );
  assert.equal(
    await page.locator('[data-editor-field="section-label"]').inputValue(),
    await navigationItem.textContent(),
  );
  await page.locator(".block-heading").first().click();
  await page.waitForFunction(() => document.activeElement?.id === "block-text");
  await page.locator("#block-text").fill("Hallo Welt.\nMeine eigene Website.");
  await page.getByLabel("X · horizontal").fill("96");
  await page.waitForTimeout(1400);
  let response = await page.request.get(base + "/api/draft");
  let data = await response.json();
  assert.equal(
    data.site.sections[0].blocks.find((b: any) => b.kind === "heading").x,
    96,
  );
  assert.match(
    data.site.sections[0].blocks.find((b: any) => b.kind === "heading").text,
    /Hallo Welt/,
  );
  const target = page.locator(".site-block.is-selected");
  const initial = await target.boundingBox();
  assert.ok(initial);
  await page.mouse.move(initial.x + 30, initial.y + 30);
  await page.mouse.down();
  await page.mouse.move(initial.x + 90, initial.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1400);
  response = await page.request.get(base + "/api/draft");
  data = await response.json();
  assert.ok(
    data.site.sections[0].blocks.find((b: any) => b.kind === "heading").x > 96,
  );
  // Anrede: Die Vorlage siezt. Umschalten nimmt die unveränderten Vorlagentexte mit.
  await page.getByRole("button", { name: "Inhalte", exact: true }).click();
  const canvas = page.locator(".site-surface");
  await canvas.getByText("Schön, dass Sie da sind.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Du", exact: true }).click();
  await canvas.getByText("Gut, dass du da bist.", { exact: true }).waitFor();
  await canvas.getByText("So kann ich für dich da sein.").waitFor();
  await page.getByRole("button", { name: "Wir", exact: true }).click();
  await canvas.getByText("So können wir für dich da sein.").waitFor();
  await page.getByRole("button", { name: "Ich", exact: true }).click();
  await page.getByRole("button", { name: "Sie", exact: true }).click();
  await canvas.getByText("So kann ich für Sie da sein.").waitFor();
  // Der Hinweis an die Betreiber im Abschnitt „Über mich“ duzt und wird gefunden.
  await page.getByText("In einem Text steht noch „du“.").waitFor();
  await page.getByRole("button", { name: "Zeigen", exact: true }).click();
  assert.match(
    await page.locator("#block-text").inputValue(),
    /^Willkommen bei \{name\}\./,
  );
  await page.getByText("{name} wird zu „Dr. Anna Sommer“.").waitFor();
  await canvas.getByText(/^Willkommen bei Dr\. Anna Sommer\./).waitFor();
  // Zu langer Text: Warnung, und „Kasten anpassen“ macht ihn passend.
  await page
    .locator("#block-text")
    .fill(
      "Willkommen bei {name}. " +
        "Ich nehme mir Zeit für Ihre Fragen. ".repeat(14),
    );
  await page
    .locator(".site-block.is-overflowing, .overflow-warning")
    .first()
    .waitFor();
  await page.screenshot({ path: "test-results/editor-overflow.png" });
  await page
    .getByRole("button", { name: "Kasten anpassen", exact: true })
    .click();
  await page.locator(".overflow-warning").waitFor({ state: "detached" });
  await page.getByText(/steht noch „du“/).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: "Ozean", exact: true }).click();
  await page.getByRole("button", { name: "Aa Modern Klar & vertraut" }).click();
  await page.getByRole("button", { name: "Anbindungen", exact: true }).click();
  assert.equal(
    await page.getByLabel("GitHub-Benutzername", { exact: true }).count(),
    0,
  );
  assert.ok(
    await page
      .getByLabel("Dein Anbieter")
      .locator('option[value="doctena"]')
      .count(),
  );
  assert.equal(
    await page
      .getByLabel("Dein Anbieter")
      .locator('option[value="ra-micro"]')
      .count(),
    0,
  );
  await page
    .getByLabel("Öffentlicher Buchungs- oder Portallink")
    .fill("https://example.test/booking");
  await page
    .getByLabel("Dein öffentliches LinkedIn-Profil")
    .fill("https://www.linkedin.com/in/test");
  await page.locator(".block-image").first().click();
  const image = page.locator(".block-image").first();
  for (const shape of ["rectangle", "rounded", "arch", "oval", "circle"]) {
    await page.getByLabel("Bildform", { exact: true }).selectOption(shape);
    assert.equal(await image.getAttribute("data-image-shape"), shape);
    if (shape === "rectangle")
      assert.equal(
        await image.evaluate((el) => getComputedStyle(el).borderRadius),
        "0px",
      );
    if (shape === "rounded")
      assert.equal(
        await image.evaluate((el) => getComputedStyle(el).borderRadius),
        "24px",
      );
    if (shape === "oval")
      assert.equal(
        await image.evaluate((el) => getComputedStyle(el).borderRadius),
        "50%",
      );
    if (shape === "circle")
      assert.equal(
        await image
          .locator("img")
          .evaluate((el) => getComputedStyle(el).clipPath),
        "circle()",
      );
  }
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  assert.equal(await image.getAttribute("data-image-shape"), "oval");
  await page.getByRole("button", { name: "Wiederholen", exact: true }).click();
  assert.equal(await image.getAttribute("data-image-shape"), "circle");
  await image.click();
  await page.getByTestId("language-switch").selectOption("en");
  assert.equal(
    await page.getByLabel("Image shape", { exact: true }).inputValue(),
    "circle",
  );
  await page.getByTestId("language-switch").selectOption("de");
  const png = await page.evaluate(async () => {
    const img = new Image();
    img.src = "/images/studio.svg";
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 940;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .locator(
      'input[type="file"][accept="image/png,image/jpeg,image/webp,image/gif"]',
    )
    .setInputFiles({
      name: "testbild.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await page.waitForFunction(() =>
    document
      .querySelector<HTMLImageElement>(".block-image img")
      ?.getAttribute("src")
      ?.startsWith("/uploads/"),
  );
  await page
    .getByLabel("Bildbeschreibung", { exact: true })
    .fill("Ein hochgeladenes Testbild");
  await page.locator(".block-heading").first().click();
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await page.getByText("Impressum & Datenschutz", { exact: true }).click();
  await page
    .getByLabel("Impressum", { exact: true })
    .fill("Dr. Anna Sommer\nMusterweg 1, 1010 Wien");
  await page
    .getByLabel("Datenschutzerklärung", { exact: true })
    .fill("Diese Website setzt keine Cookies.");
  await page.waitForTimeout(1400);
  await page
    .getByRole("button", { name: "Veröffentlichen", exact: true })
    .click();
  await page.getByRole("button", { name: "Jetzt veröffentlichen" }).click();
  await page
    .getByText("Deine Website ist veröffentlicht.", { exact: true })
    .waitFor();
  const live = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await live.goto(base);
  const logo = live.locator('.klarwarg-badge img[alt="Klarwarg"]');
  await logo.waitFor();
  assert.ok(
    await logo.evaluate(
      (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
    ),
  );
  const badge = await live.locator(".klarwarg-badge").boundingBox();
  assert.ok(
    badge && badge.x <= 16 && badge.y + badge.height >= 980,
    "Brand mark is in the bottom-left corner",
  );
  assert.equal(
    Math.round((await live.locator(".public-site").boundingBox())!.width),
    1440,
  );
  await live
    .getByRole("heading", { name: "Hallo Welt. Meine eigene Website." })
    .waitFor();
  assert.equal(await live.locator(".can-edit").count(), 0);
  assert.equal(
    await live.locator(".block-image").first().getAttribute("data-image-shape"),
    "circle",
  );
  assert.equal(
    await live
      .locator(".block-image img")
      .first()
      .evaluate((el) => getComputedStyle(el).clipPath),
    "circle()",
  );
  // Die öffentliche Seite kommt fertig vom Server und braucht kein JavaScript.
  assert.equal(
    await live.locator("script:not([type='application/ld+json'])").count(),
    0,
  );
  assert.equal(await live.evaluate(() => document.documentElement.lang), "de");
  await live.screenshot({
    path: "test-results/website-desktop.png",
    fullPage: true,
  });
  const publishedName = await live.locator("h1").innerText();
  await page.locator("#block-text").fill("Nur im Entwurf");
  await page.waitForTimeout(1400);
  await live.reload();
  assert.equal(await live.locator("h1").innerText(), publishedName);
  await live.getByRole("link", { name: "Impressum", exact: true }).click();
  await live.getByRole("heading", { name: "Impressum", exact: true }).waitFor();
  await live.getByText("Musterweg 1, 1010 Wien").waitFor();
  await live.screenshot({
    path: "test-results/website-impressum.png",
    fullPage: true,
  });
  await live.goto(base);
  await live.setViewportSize({ width: 390, height: 844 });
  await live.locator(".site-canvas.canvas-mobile").first().waitFor();
  assert.equal(await live.locator("h1").count(), 1);
  await live.mouse.wheel(0, 800);
  await live.waitForTimeout(200);
  assert.ok(
    await live.evaluate(() => window.scrollY > 0),
    "Die öffentliche Website muss scrollbar sein.",
  );
  await live.evaluate(() => window.scrollTo(0, 0));
  await live.screenshot({
    path: "test-results/website-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await live.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page
    .getByRole("button", { name: "Handy-Vorschau", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/editor-phone-preview.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page
    .getByRole("heading", { name: "Deine Website. Dein Anfang." })
    .waitFor();
  await page.getByTestId("language-switch").selectOption("en");
  for (const control of [
    page.getByTestId("language-switch"),
    page.getByRole("button", { name: "Preview", exact: true }),
    page.getByRole("button", { name: "Publish", exact: true }),
  ]) {
    const box = await control.boundingBox();
    assert.ok(
      box && box.x >= 0 && box.x + box.width <= 390,
      "Mobile header control must fit on screen",
    );
  }
  await page.screenshot({
    path: "test-results/editor-mobile-english.png",
    fullPage: true,
  });
  await page.getByTestId("language-switch").selectOption("de");
  await page.screenshot({
    path: "test-results/editor-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.locator(".block-heading").first().click();
  await page.waitForFunction(() => document.activeElement?.id === "block-text");
  await page
    .getByRole("button", { name: "Eigenschaften schließen", exact: true })
    .click();
  await page.locator(".site-brand small").click();
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("data-editor-field") === "tagline",
  );
  await page.getByRole("button", { name: "Kurze Hilfe", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  // HTTP LAN browsers expose getRandomValues but not randomUUID (localhost does).
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
  });
  // Selecting a profession must visibly mark it before replacing the saved draft.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.reload();
  await page
    .locator('.block-image[data-image-shape="circle"]')
    .first()
    .waitFor();
  await page.locator(".template-choice").click();
  const draftBeforeTemplate = await (
    await page.request.get(base + "/api/draft")
  ).json();
  const developer = page
    .locator(".template-card")
    .filter({ hasText: "Softwareentwicklung" });
  await developer.click();
  assert.equal(await developer.getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".template-card.chosen").count(), 1);
  assert.equal(await developer.locator(".template-check").count(), 1);
  assert.deepEqual(
    await (await page.request.get(base + "/api/draft")).json(),
    draftBeforeTemplate,
  );
  const savedTemplate = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/draft") &&
      response.request().method() === "PUT" &&
      response.status() === 200,
  );
  await page
    .getByRole("button", { name: "Entwurf ersetzen", exact: true })
    .click();
  await savedTemplate;
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    (await (await page.request.get(base + "/api/draft")).json()).site
      .profession,
    "developer",
  );
  await page.reload();
  await page
    .locator(".project-badge")
    .filter({ hasText: "Softwareentwicklung" })
    .waitFor();
  await page.getByRole("button", { name: "Anbindungen", exact: true }).click();
  assert.equal(
    await page
      .getByLabel("Öffentlicher Buchungs- oder Portallink")
      .inputValue(),
    "",
  );
  assert.equal(
    await page.getByLabel("Dein öffentliches LinkedIn-Profil").inputValue(),
    "",
  );
  assert.equal(
    await page
      .getByLabel("Dein Anbieter")
      .locator('option[value="doctena"]')
      .count(),
    0,
  );
  const appStoreUrl = "https://apps.apple.com/at/app/example/id123456789";
  await page
    .getByLabel("Dein App-Store-Eintrag", { exact: true })
    .fill(appStoreUrl);
  const appStoreLink = page.locator(`.site-contact a[href="${appStoreUrl}"]`);
  await appStoreLink.click();
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("data-editor-field") ===
      "integration-appstore",
  );
  await page.waitForTimeout(1400);
  assert.equal(
    (await (await page.request.get(base + "/api/draft")).json()).site
      .integrations.appStoreUrl,
    appStoreUrl,
  );
  await page.reload();
  await page.getByRole("button", { name: "Anbindungen", exact: true }).click();
  assert.equal(
    await page
      .getByLabel("Dein App-Store-Eintrag", { exact: true })
      .inputValue(),
    appStoreUrl,
  );
  await page.getByTestId("language-switch").selectOption("en");
  await page.getByLabel("Your App Store listing", { exact: true }).waitFor();
  await page.getByTestId("language-switch").selectOption("de");
  // Invalid links are explained at the field, block saving, and can be located from the summary.
  const linkedinInput = page.getByLabel("Dein öffentliches LinkedIn-Profil", {
    exact: true,
  });
  const storedBeforeInvalid = (
    await (await page.request.get(base + "/api/draft")).json()
  ).site;
  await linkedinInput.fill("www.linkedin.com/in/perl-m-iris");
  assert.equal(await linkedinInput.getAttribute("aria-invalid"), "true");
  const errorId = (await linkedinInput.getAttribute("aria-describedby"))!;
  assert.match(
    await page.locator(`[id="${errorId}"]`).innerText(),
    /https:\/\/www.linkedin.com\/in\//,
  );
  await page.waitForTimeout(1400);
  assert.deepEqual(
    (await (await page.request.get(base + "/api/draft")).json()).site,
    storedBeforeInvalid,
  );
  assert.doesNotMatch(
    await page.locator(".error-banner").innerText(),
    /"code"|"custom"|Zod/,
  );
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page
    .locator(".error-banner")
    .getByRole("button", {
      name: "Dein öffentliches LinkedIn-Profil",
      exact: true,
    })
    .click();
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("data-editor-field") ===
      "integration-linkedin",
  );
  await page.getByTestId("language-switch").selectOption("en");
  await page
    .getByText(/Please enter the full LinkedIn link starting/)
    .first()
    .waitFor();
  await page.getByTestId("language-switch").selectOption("de");
  await linkedinInput.fill("https://www.linkedin.com/in/perl-m-iris");
  await page.waitForTimeout(1400);
  assert.equal(await linkedinInput.getAttribute("aria-invalid"), null);
  assert.equal(await page.locator(".error-banner").count(), 0);
  // Invalid imports explain the exact field without replacing the existing draft.
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  const importFile = page.locator(
    'input[type="file"][accept="application/json,.json"]',
  );
  const beforeImport = (
    await (await page.request.get(base + "/api/draft")).json()
  ).site;
  const invalidBackup = {
    ...beforeImport,
    integrations: {
      ...beforeImport.integrations,
      linkedinUrl: "www.linkedin.com/in/perl-m-iris",
    },
  };
  await importFile.setInputFiles({
    name: "invalid-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalidBackup)),
  });
  await page
    .locator(".error-banner")
    .getByText(/Die Sicherung enthält ungültige Angaben/)
    .waitFor();
  assert.match(
    await page.locator(".error-banner").innerText(),
    /LinkedIn.*https:\/\//,
  );
  assert.deepEqual(
    (await (await page.request.get(base + "/api/draft")).json()).site,
    beforeImport,
  );
  await importFile.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{ broken"),
  });
  await page
    .locator(".error-banner")
    .getByText(/Die Datei enthält kein gültiges JSON/)
    .waitFor();
  await page
    .getByRole("button", { name: "Fehlermeldung schließen", exact: true })
    .click();
  await page.getByRole("button", { name: "Anbindungen", exact: true }).click();
  await linkedinInput.fill("");
  await page.getByLabel("GitHub-Benutzername", { exact: true }).fill("octocat");
  await page.getByRole("button", { name: "Repositories importieren" }).click();
  await page.getByText("2 Repositories importiert", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "zweites-projekt: Entfernen", exact: true })
    .click();
  await page.getByText("1 Repositories importiert", { exact: true }).waitFor();
  assert.equal(await page.locator(".repo-grid article").count(), 1);
  assert.equal(
    await page
      .locator('.repo-grid a[href="https://github.com/octocat/Hello-World"]')
      .count(),
    1,
  );
  assert.equal(await page.locator('[data-repo="2"]').count(), 0);
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await page
    .getByRole("button", { name: "zweites-projekt: Entfernen", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Wiederholen", exact: true }).click();
  await page.getByText("1 Repositories importiert", { exact: true }).waitFor();
  await page.waitForTimeout(1400);
  assert.deepEqual(
    (await (await page.request.get(base + "/api/draft")).json()).site.repos.map(
      (repo: any) => repo.id,
    ),
    [1],
  );
  await page.reload();
  await page.getByRole("button", { name: "Anbindungen", exact: true }).click();
  await page
    .getByRole("button", { name: "mein-projekt: Entfernen", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "zweites-projekt: Entfernen", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "mein-projekt: Entfernen", exact: true })
    .click();
  assert.equal(await page.locator(".repo-grid article").count(), 0);
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await page.getByText("1 Repositories importiert", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Inhalte", exact: true }).click();
  await page.locator(".template-choice").click();
  await page
    .locator(".template-card")
    .filter({ hasText: "Rechtsanwaltskanzlei" })
    .click();
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  assert.equal(
    (await (await page.request.get(base + "/api/draft")).json()).site
      .profession,
    "developer",
  );
  await page.route("**/api/draft", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 503,
        json: { error: "Speichern fehlgeschlagen" },
      });
    else await route.continue();
  });
  await page.locator(".template-choice").click();
  await page
    .locator(".template-card")
    .filter({ hasText: "Rechtsanwaltskanzlei" })
    .click();
  await page
    .getByRole("button", { name: "Entwurf ersetzen", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("alert").waitFor();
  assert.equal(
    (await (await page.request.get(base + "/api/draft")).json()).site
      .profession,
    "developer",
  );
  await page
    .locator(".project-badge")
    .filter({ hasText: "Softwareentwicklung" })
    .waitFor();
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.unroute("**/api/draft");
  await page.getByRole("button", { name: "Inhalte", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Bereich GitHub-Projekte entfernen",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Bereich entfernen", exact: true })
    .click();
  assert.equal(await page.locator(".site-projects").count(), 0);
  await page
    .getByRole("button", {
      name: "Bereich GitHub-Projekte wieder einfügen",
      exact: true,
    })
    .click();
  assert.equal(await page.locator(".site-projects").count(), 1);
  // An import started for the previous profession must not repopulate the new draft.
  let finishOldImport!: () => Promise<void>;
  const oldImportStarted = new Promise<void>((resolve) => {
    void page.route("**/api/github", (route) => {
      finishOldImport = () =>
        route.fulfill({
          json: {
            repos: [
              {
                id: 99,
                name: "stale-project",
                description: "Old import",
                url: "https://github.com/octocat/stale",
                language: "TypeScript",
                stars: 0,
                fork: false,
              },
            ],
          },
        });
      resolve();
    });
  });
  await page.getByRole("button", { name: "Anbindungen", exact: true }).click();
  await page.getByRole("button", { name: "Repositories importieren" }).click();
  await oldImportStarted;
  await page.getByRole("button", { name: "Inhalte", exact: true }).click();
  // A completed career switch clears configured links/projects and changes available tools.
  await page.locator(".template-choice").click();
  await page
    .locator(".template-card")
    .filter({ hasText: "Rechtsanwaltskanzlei" })
    .click();
  await page
    .getByRole("button", { name: "Entwurf ersetzen", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Anbindungen", exact: true }).click();
  assert.equal(
    await page.getByLabel("GitHub-Benutzername", { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByLabel("Dein Anbieter").inputValue(), "ra-micro");
  assert.equal(
    await page
      .getByLabel("Dein Anbieter")
      .locator('option[value="doctena"]')
      .count(),
    0,
  );
  await finishOldImport();
  await page.waitForTimeout(1200);
  const lawDraft = (await (await page.request.get(base + "/api/draft")).json())
    .site;
  assert.deepEqual(lawDraft.repos, []);
  assert.equal(lawDraft.integrations.githubUser, "");
  assert.equal(lawDraft.integrations.bookingUrl, "");
  assert.equal(lawDraft.integrations.linkedinUrl, "");
  assert.equal(lawDraft.integrations.appStoreUrl, "");
  assert.equal(
    await page.getByLabel("Dein App-Store-Eintrag", { exact: true }).count(),
    0,
  );
  assert.equal(
    await page.locator(`.site-contact a[href="${appStoreUrl}"]`).count(),
    0,
  );
  await page.reload();
  await page.getByRole("button", { name: "Anbindungen", exact: true }).click();
  assert.equal(
    await page.getByLabel("GitHub-Benutzername", { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByLabel("Dein Anbieter").inputValue(), "ra-micro");
  // Domain is editable, validated, persisted and published; existing areas can be removed.
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  const domainInput = page.getByLabel("Eigene Domain", { exact: true });
  await domainInput.fill("https://my-domain.at/path");
  assert.equal(await domainInput.getAttribute("aria-invalid"), "true");
  await page
    .getByText(/Bitte eine Domain wie meine-domain.at/)
    .first()
    .waitFor();
  await domainInput.fill("my-domain.at");
  await page.getByTestId("language-switch").selectOption("en");
  await page.getByLabel("Own domain", { exact: true }).waitFor();
  await page.getByTestId("language-switch").selectOption("de");
  await page.waitForTimeout(1400);
  assert.equal(
    (await (await page.request.get(base + "/api/draft")).json()).site.domain,
    "https://my-domain.at",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  assert.equal(await domainInput.inputValue(), "https://my-domain.at");
  await page.getByRole("button", { name: "Inhalte", exact: true }).click();
  const initialSections = (
    await (await page.request.get(base + "/api/draft")).json()
  ).site.sections;
  const lastLabel = initialSections[initialSections.length - 1].label;
  await page
    .getByRole("button", {
      name: `Bereich ${lastLabel} entfernen`,
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Abbrechen", exact: true })
    .click();
  assert.equal(await page.locator(".site-canvas").count(), 2);
  await page
    .getByRole("button", {
      name: `Bereich ${lastLabel} entfernen`,
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Bereich entfernen", exact: true })
    .click();
  assert.equal(await page.locator(".site-canvas").count(), 1);
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  assert.equal(await page.locator(".site-canvas").count(), 2);
  await page.getByRole("button", { name: "Wiederholen", exact: true }).click();
  assert.equal(await page.locator(".site-canvas").count(), 1);
  await page
    .getByRole("button", {
      name: `Bereich ${initialSections[0].label} entfernen`,
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Bereich entfernen", exact: true })
    .click();
  assert.equal(await page.locator(".site-canvas").count(), 0);
  await page.waitForTimeout(1400);
  await page.reload();
  await page.getByRole("button", { name: "Raster", exact: true }).click();
  assert.equal(
    await page.getByLabel("Abschnittshöhe (px)", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Inhalte", exact: true }).click();
  await page.getByRole("button", { name: "Überschrift", exact: true }).click();
  await page.locator("#block-text").fill("Neue Startseite");
  assert.equal(await page.locator(".site-canvas").count(), 1);
  for (const label of ["Leistungen", "Kontakt"]) {
    await page
      .getByRole("button", { name: `Bereich ${label} entfernen`, exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Bereich entfernen", exact: true })
      .click();
  }
  assert.equal(await page.locator(".site-services, .site-contact").count(), 0);
  assert.equal(
    await page
      .locator(
        '.site-header nav a[href="#leistungen"], .site-header nav a[href="#kontakt"]',
      )
      .count(),
    0,
  );
  await live.reload();
  assert.equal(
    await live.locator(".site-contact").count(),
    1,
    "draft deletion must not affect published site",
  );
  await page.waitForTimeout(1400);
  await page.reload();
  await page.getByRole("button", { name: "Inhalte", exact: true }).click();
  assert.equal(await page.locator(".site-services, .site-contact").count(), 0);
  await page
    .getByRole("button", {
      name: "Bereich Kontakt wieder einfügen",
      exact: true,
    })
    .click();
  assert.equal(await page.locator(".site-contact").count(), 1);
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  assert.equal(await page.locator(".site-contact").count(), 0);
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await page.getByText("Impressum & Datenschutz", { exact: true }).click();
  await page.getByLabel("Impressum", { exact: true }).fill("Test Impressum");
  await page
    .getByLabel("Datenschutzerklärung", { exact: true })
    .fill("Test Datenschutz");
  await page
    .getByRole("button", { name: "Veröffentlichen", exact: true })
    .click();
  await page.getByRole("button", { name: "Jetzt veröffentlichen" }).click();
  await page
    .getByText("Deine Website ist veröffentlicht.", { exact: true })
    .waitFor();
  await live.reload();
  assert.equal(await live.locator(".site-services, .site-contact").count(), 0);
  assert.equal(
    await live.locator('link[rel="canonical"]').getAttribute("href"),
    "https://my-domain.at/",
  );
  assert.match(
    await (await page.request.get(base + "/sitemap.xml")).text(),
    /https:\/\/my-domain.at/,
  );
  // A profession/template change must retain the configured website domain.
  await page.getByRole("button", { name: "Inhalte", exact: true }).click();
  await page.locator(".template-choice").click();
  await page
    .locator(".template-card")
    .filter({ hasText: "Softwareentwicklung" })
    .click();
  await page
    .getByRole("button", { name: "Entwurf ersetzen", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    (await (await page.request.get(base + "/api/draft")).json()).site.domain,
    "https://my-domain.at",
  );
  await live.close();
  assert.deepEqual(errors, []);
  console.log(
    "Browserprüfung erfolgreich: SQLite-Erstanmeldung, Pflicht-Passwortwechsel, DE/EN-Umschalter und Sprachspeicherung, Text, Koordinaten, Drag, Palette, Schrift, GitHub, Veröffentlichung, Entwurf/Live, Handy, Dialog.",
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
