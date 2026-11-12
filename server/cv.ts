import { fork } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export class CvError extends Error {}
export const cvMaxBytes = 8 * 1024 * 1024;
export const cvMaxText = 50000;

/** Ephemeral child owns parsing/OCR memory; no source file or extracted image is written. */
export async function parseCv(
  input: unknown,
): Promise<{ text: string; ocr: boolean }> {
  const value = input as { name?: unknown; data?: unknown } | null;
  if (
    !value ||
    typeof value.name !== "string" ||
    typeof value.data !== "string" ||
    !/\.(pdf|docx|odt)$/i.test(value.name)
  )
    throw new CvError("Bitte eine PDF-, DOCX- oder ODT-Datei auswählen.");
  const match = value.data.match(/^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match || !match[1] || match[1].length % 4 !== 0)
    throw new CvError(
      "Die Datei konnte nicht gelesen werden. Bitte erneut auswählen.",
    );
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > cvMaxBytes)
    throw new CvError("Bitte einen Lebenslauf bis 8 MB auswählen.");
  const format = value.name.split(".").pop()!.toLowerCase();
  if (
    (format === "pdf" &&
      !bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) ||
    (format !== "pdf" && bytes.subarray(0, 2).toString() !== "PK")
  )
    throw new CvError("Die Datei passt nicht zum gewählten Dateiformat.");
  const ocrDir = mkdtempSync(path.join(tmpdir(), "klarwarg-ocr-languages-"));
  try {
    for (const code of ["deu", "eng"]) {
      const data = require(`@tesseract.js-data/${code}`);
      symlinkSync(
        path.join(data.langPath, code + ".traineddata.gz"),
        path.join(ocrDir, code + ".traineddata.gz"),
      );
    }
  } catch (error) {
    rmSync(ocrDir, { recursive: true, force: true });
    throw error;
  }
  return new Promise((resolve, reject) => {
    const child = fork(path.join(import.meta.dirname, "cv-worker.mjs"), [], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      execArgv: ["--max-old-space-size=384"],
      serialization: "advanced",
    });
    let finished = false;
    const finish = (error?: Error, result?: { text: string; ocr: boolean }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      bytes.fill(0);
      rmSync(ocrDir, { recursive: true, force: true });
      if (error) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(
      () =>
        finish(
          new CvError(
            "Die Verarbeitung dauert zu lange. Bitte eine kleinere Datei verwenden.",
          ),
        ),
      120000,
    );
    child.once("error", () =>
      finish(new CvError("Der Lebenslauf konnte nicht verarbeitet werden.")),
    );
    child.once("exit", () =>
      finish(new CvError("Der Lebenslauf konnte nicht verarbeitet werden.")),
    );
    child.once("message", (message: any) => {
      if (message.error) return finish(new CvError(message.error));
      if (typeof message.text !== "string" || !message.text.trim())
        return finish(
          new CvError(
            "Es wurde kein Text erkannt. Bitte eine andere Datei verwenden oder den Text einfügen.",
          ),
        );
      if (message.text.length > cvMaxText)
        return finish(
          new CvError("Der Lebenslauf ist zu lang (höchstens 50.000 Zeichen)."),
        );
      finish(undefined, { text: message.text, ocr: !!message.ocr });
    });
    child.send({ format, bytes, ocrDir }, (error) => {
      if (error)
        finish(new CvError("Der Lebenslauf konnte nicht verarbeitet werden."));
    });
  });
}
