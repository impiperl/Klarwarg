import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
import { createCanvas } from "@napi-rs/canvas";
import { parseCv } from "../server/cv.ts";
import { createSite, siteSchema } from "../src/model.ts";
import { renderPage } from "../server/render.ts";
import { createApp } from "../server/app.ts";
import { exportTarget, exportWebsite } from "../server/export.ts";

export function documentInput(
  format: "docx" | "odt",
  text = "Entwicklung &amp; Beratung",
) {
  const entry = format === "docx" ? "word/document.xml" : "content.xml";
  const xml =
    format === "docx"
      ? `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Iris Perl</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`
      : `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:h>Iris Perl</text:h><text:p>${text}</text:p></office:text></office:body></office:document-content>`;
  return {
    name: "cv." + format,
    data:
      "data:application/octet-stream;base64," +
      Buffer.from(zipSync({ [entry]: strToU8(xml) })).toString("base64"),
  };
}

/** Small self-contained PDF with either selectable text or a scan; no fixture download. */
function makePdf(scan: boolean, count = 1) {
  const image = createCanvas(1000, 450);
  const ctx = image.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 1000, 450);
  ctx.fillStyle = "black";
  ctx.font = "40px sans-serif";
  ctx.fillText("IRIS PERL", 50, 90);
  ctx.fillText("Software Development", 50, 175);
  ctx.fillText("2020 - 2026", 50, 260);
  const jpeg = image.toBuffer("image/jpeg");
  const objects: Buffer[] = [];
  const add = (text: string | Buffer) =>
    objects.push(Buffer.isBuffer(text) ? text : Buffer.from(text));
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(
    `<< /Type /Pages /Count ${count} /Kids [${Array.from({ length: count }, (_, i) => `${6 + i} 0 R`).join(" ")}] >>`,
  );
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const commands = Buffer.from(
    scan
      ? "q 500 0 0 225 0 0 cm /Im0 Do Q"
      : "BT /F1 18 Tf 30 180 Td (Iris Perl - Software Development - 2020 - 2026) Tj ET",
  );
  add(
    Buffer.concat([
      Buffer.from(`<< /Length ${commands.length} >>\nstream\n`),
      commands,
      Buffer.from("\nendstream"),
    ]),
  );
  add(
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 1000 /Height 450 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      Buffer.from("\nendstream"),
    ]),
  );
  for (let i = 0; i < count; i++)
    add(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 225] /Resources << /Font << /F1 3 0 R >> /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>",
    );
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(
      Buffer.from(`${i + 1} 0 obj\n`),
      object,
      Buffer.from("\nendobj\n"),
    );
  });
  const start = Buffer.concat(chunks).length;
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
        .join(
          "",
        )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`,
    ),
  );
  return {
    name: "cv.pdf",
    data:
      "data:application/pdf;base64," + Buffer.concat(chunks).toString("base64"),
  };
}

test("CV imports Word tables and ODT paragraphs as plain text; rejects invalid and oversized input", async () => {
  for (const format of ["docx", "odt"] as const) {
    assert.deepEqual(await parseCv(documentInput(format)), {
      text: "Iris Perl\n\nEntwicklung & Beratung",
      ocr: false,
    });
    const hostile = await parseCv(
      documentInput(format, "&lt;script&gt;alert(1)&lt;/script&gt;"),
    );
    assert.ok(hostile.text.includes("<script>"));
  }
  for (const input of [
    null,
    { name: "cv.doc", data: "x" },
    { name: "cv.pdf", data: "data:application/pdf;base64,YWJj" },
    documentInput("docx", "x".repeat(51000)),
  ])
    await assert.rejects(parseCv(input));
  const huge = {
    name: "cv.pdf",
    data:
      "data:application/pdf;base64," +
      Buffer.alloc(8 * 1024 * 1024 + 1).toString("base64"),
  };
  await assert.rejects(parseCv(huge), /8 MB/);
});

test(
  "PDF selectable text, real scan OCR, and page limit",
  { timeout: 120000 },
  async () => {
    const text = await parseCv(makePdf(false));
    assert.equal(text.ocr, false);
    assert.match(text.text, /Iris Perl.*Software Development/);
    const scan = await parseCv(makePdf(true));
    assert.equal(scan.ocr, true);
    assert.match(scan.text, /IRIS PERL/i);
    assert.match(scan.text, /Software Development/i);
    await assert.rejects(parseCv(makePdf(false, 21)), /20 Seiten/);
  },
);

test("CV HTML is indexable, escaped, linked and exported at root and subfolder", () => {
  const site = createSite();
  const { cv, ...legacy } = site;
  assert.deepEqual(siteSchema.parse(legacy).cv, { text: "", enabled: false });
  site.cv = {
    text: "Iris Perl\n\nBeratung <script>alert(1)</script>",
    enabled: true,
  };
  const page = renderPage(site, "cv", "https://example.at", {}, "/iris");
  assert.match(
    page,
    /rel="canonical" href="https:\/\/example.at\/iris\/lebenslauf"/,
  );
  assert.match(page, /Beratung &lt;script&gt;/);
  assert.doesNotMatch(page, /noindex|<script>alert/);
  assert.match(
    renderPage(site, "home", "https://example.at", {}, "/iris"),
    /href="\/iris\/lebenslauf"/,
  );
  const dir = mkdtempSync(path.join(tmpdir(), "cv-export-"));
  try {
    for (const target of ["https://example.at", "https://example.at/iris/"]) {
      const files = unzipSync(exportWebsite(site, exportTarget(target), dir));
      const html = strFromU8(files["lebenslauf.html"]);
      assert.match(html, /href="index.html#kontakt"/);
      assert.match(html, /href="site.css"/);
      assert.match(html, /lebenslauf.html/);
      assert.match(strFromU8(files["index.html"]), /href="lebenslauf.html"/);
      assert.match(strFromU8(files["sitemap.xml"]), /lebenslauf.html/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CV parsing requires login, stores no original, and follows publication, paths and redirects", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cv-api-"));
  const { app, store } = await createApp(dir);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr !== "string");
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const call = (route: string, body?: unknown, cookie = "") =>
      fetch(base + route, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: body ? JSON.stringify(body) : undefined,
      });
    assert.equal(
      (await call("/api/cv/parse", documentInput("docx"))).status,
      401,
    );
    const setup = await call("/api/setup", {
      username: "admin",
      password: "test-password-12345",
    });
    const cookie = setup.headers.get("set-cookie")!.split(";")[0];
    const before = store.draft();
    const response = await call("/api/cv/parse", documentInput("docx"), cookie);
    assert.equal(response.status, 200);
    assert.equal(
      (await response.json()).text,
      "Iris Perl\n\nEntwicklung & Beratung",
    );
    assert.deepEqual(store.draft(), before);
    assert.deepEqual(readdirSync(path.join(dir, "uploads")), []);
    const site = createSite();
    site.legal = { imprint: "Imprint", privacy: "Privacy" };
    site.cv = { text: "Published career", enabled: true };
    store.save(site, store.revision());
    assert.equal((await call("/lebenslauf")).status, 404);
    store.publish(undefined, "iris");
    assert.match(
      await (await call("/iris/lebenslauf")).text(),
      /Published career/,
    );
    assert.match(await (await call("/sitemap.xml")).text(), /iris\/lebenslauf/);
    const draft = store.draft()!;
    draft.cv.text = "Private edit";
    store.save(draft, store.revision());
    assert.doesNotMatch(
      await (await call("/iris/lebenslauf")).text(),
      /Private edit/,
    );
    store.publish(undefined, "judith");
    const moved = await fetch(base + "/iris/lebenslauf", {
      redirect: "manual",
    });
    assert.equal(moved.status, 301);
    assert.equal(moved.headers.get("location"), "/judith/lebenslauf");
    draft.cv.enabled = false;
    store.save(draft, store.revision());
    store.publish();
    assert.equal((await call("/judith/lebenslauf")).status, 404);
    assert.doesNotMatch(
      await (await call("/sitemap.xml")).text(),
      /lebenslauf/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
