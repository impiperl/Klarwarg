import { createRequire } from "node:module";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const require = createRequire(import.meta.url);
const maxText = 50000;
const fail = (text) => {
  throw new Error(text);
};
const clean = (text) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function office(bytes, format) {
  const entry = format === "docx" ? "word/document.xml" : "content.xml";
  let tooLarge = false;
  let extractedSize = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (file.name !== entry) return false;
      extractedSize += file.originalSize;
      if (extractedSize > 4 * 1024 * 1024) {
        tooLarge = true;
        return false;
      }
      return true;
    },
  });
  if (tooLarge) fail("Der Lebenslauf ist zu lang (höchstens 50.000 Zeichen).");
  if (!files[entry]) fail("Die Datei passt nicht zum gewählten Dateiformat.");
  const xml = strFromU8(files[entry]);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    fail("Der Lebenslauf konnte nicht verarbeitet werden.");
  const tree = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: false,
    processEntities: true,
  }).parse(xml);
  const paragraphs = format === "docx" ? ["w:p"] : ["text:p", "text:h"];
  const output = [];
  function inline(nodes) {
    return nodes
      .map((node) =>
        Object.entries(node)
          .map(([key, value]) => {
            if (key === "#text") return String(value);
            if (key === "w:tab" || key === "text:tab") return "\t";
            if (["w:br", "w:cr", "text:line-break"].includes(key)) return "\n";
            if (key === "text:s")
              return " ".repeat(
                Math.min(100, Number(node[":@"]?.["@_text:c"]) || 1),
              );
            if (Array.isArray(value)) return inline(value);
            return "";
          })
          .join(""),
      )
      .join("");
  }
  function visit(nodes) {
    for (const node of nodes)
      for (const [key, value] of Object.entries(node)) {
        if (!Array.isArray(value)) continue;
        if (paragraphs.includes(key)) output.push(inline(value));
        else visit(value);
      }
  }
  visit(tree);
  return { text: clean(output.join("\n\n")), ocr: false };
}

async function pdf(bytes, ocrDir) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const task = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
    stopAtErrors: true,
    cMapUrl: path.join(pdfDir, "cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: path.join(pdfDir, "standard_fonts/"),
    wasmUrl: path.join(pdfDir, "wasm/"),
  });
  let doc, worker;
  let ocr = false;
  const pages = [];
  try {
    doc = await task.promise;
    if (doc.numPages > 20)
      fail("Bitte einen Lebenslauf mit höchstens 20 Seiten auswählen.");
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      let text = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("");
      // OCR per page also covers mixed documents (text pages alongside scans).
      if (text.replace(/\s/g, "").length < 30) {
        if (!worker) {
          const { createWorker } = await import("tesseract.js");
          worker = await createWorker("deu+eng", 1, {
            langPath: ocrDir,
            cacheMethod: "none",
            gzip: true,
          });
        }
        const { createCanvas } = await import("@napi-rs/canvas");
        const initial = page.getViewport({ scale: 1 });
        const scale = Math.min(
          2.5,
          2400 / Math.max(initial.width, initial.height),
        );
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        );
        await page.render({ canvas, viewport }).promise;
        const result = await worker.recognize(canvas.toBuffer("image/png"));
        if (result.data.text.trim().length > text.trim().length)
          text = result.data.text;
        canvas.width = canvas.height = 1;
        ocr = true;
      }
      pages.push(clean(text));
      if (pages.join("\n\n").length > maxText)
        fail("Der Lebenslauf ist zu lang (höchstens 50.000 Zeichen).");
      page.cleanup();
    }
    return { text: clean(pages.join("\n\n")), ocr };
  } finally {
    if (worker) await worker.terminate();
    await task.destroy();
  }
}

process.once("message", async ({ format, bytes, ocrDir }) => {
  try {
    const result =
      format === "pdf" ? await pdf(bytes, ocrDir) : office(bytes, format);
    process.send?.(result);
  } catch (error) {
    const allowed = [
      "Bitte einen Lebenslauf mit höchstens 20 Seiten auswählen.",
      "Der Lebenslauf ist zu lang (höchstens 50.000 Zeichen).",
      "Die Datei passt nicht zum gewählten Dateiformat.",
    ];
    const message =
      error?.name === "PasswordException"
        ? "Bitte eine PDF-Datei ohne Passwortschutz auswählen."
        : allowed.includes(error?.message)
          ? error.message
          : "Der Lebenslauf konnte nicht verarbeitet werden.";
    process.send?.({ error: message });
  }
});
