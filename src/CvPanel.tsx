import React, { useRef, useState } from "react";
import { Upload, LoaderCircle, Trash2 } from "lucide-react";
import { useI18n } from "./i18n";
import { api } from "./api";
import type { Site } from "./model";

type Props = { site: Site; onChange: (cv: Site["cv"]) => void };
export default function CvPanel({ site, onChange }: Props) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{ text: string; ocr: boolean } | null>(
    null,
  );
  async function upload(file?: File) {
    if (!file || busy) return;
    setError("");
    setNotice("");
    setPending(null);
    if (!/\.(pdf|docx|odt)$/i.test(file.name)) {
      setError("Bitte eine PDF-, DOCX- oder ODT-Datei auswählen.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Bitte einen Lebenslauf bis 8 MB auswählen.");
      return;
    }
    setBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(
            new Error(
              "Die Datei konnte nicht gelesen werden. Bitte erneut auswählen.",
            ),
          );
        reader.readAsDataURL(file);
      });
      setPending(await api("/cv/parse", { name: file.name, data }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Der Lebenslauf konnte nicht verarbeitet werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="panel-section">
        <h3>{t("Lebenslauf / CV")}</h3>
        <p className="muted small">
          {t(
            "PDF, DOCX oder ODT · bis 8 MB und 20 PDF-Seiten. Scans werden mit Texterkennung gelesen.",
          )}
        </p>
        <p className="muted small">
          {t(
            "Die Originaldatei wird nur zum Auslesen verwendet und nicht gespeichert. Nur der übernommene Text bleibt im Entwurf.",
          )}
        </p>
        <input
          ref={input}
          type="file"
          accept=".pdf,.docx,.odt"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void upload(file);
          }}
        />
        <button
          className="secondary full"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Upload size={16} />
          )}
          {t(busy ? "Lebenslauf wird gelesen …" : "Lebenslauf hochladen")}
        </button>
        <p className="muted small" role="status">
          {busy
            ? t("Die Texterkennung kann bis zu zwei Minuten dauern.")
            : t(notice)}
        </p>
        {error && (
          <p className="error" role="alert">
            {t(error)}
          </p>
        )}
      </div>
      {pending && (
        <div className="panel-section">
          <h3>{t("Erkannten Text prüfen")}</h3>
          {pending.ocr && (
            <p className="muted small">
              {t(
                "Texterkennung verwendet. Bitte Namen, Jahreszahlen und Lesereihenfolge prüfen.",
              )}
            </p>
          )}
          <div className="field">
            <label htmlFor="cv-import-text">{t("Importvorschau")}</label>
            <textarea
              className="cv-editor"
              rows={16}
              maxLength={50000}
              id="cv-import-text"
              value={pending.text}
              onChange={(e) => setPending({ ...pending, text: e.target.value })}
            />
          </div>
          <button
            className="primary full"
            disabled={!pending.text.trim()}
            onClick={() => {
              onChange({ ...site.cv, text: pending.text.trim() });
              setPending(null);
              setNotice("Text in den Entwurf übernommen.");
            }}
          >
            {t("Text in den Entwurf übernehmen")}
          </button>
          <button className="text-button" onClick={() => setPending(null)}>
            {t("Import verwerfen")}
          </button>
        </div>
      )}
      <div className="panel-section">
        <div className="field">
          <label htmlFor="cv-text">{t("Lebenslauftext")}</label>
          <textarea
            id="cv-text"
            data-editor-field="cv-text"
            className="cv-editor"
            rows={16}
            maxLength={50000}
            value={site.cv.text}
            disabled={busy}
            onChange={(e) => onChange({ ...site.cv, text: e.target.value })}
          />
        </div>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={site.cv.enabled}
            disabled={!site.cv.text.trim() || busy}
            onChange={(e) =>
              onChange({ ...site.cv, enabled: e.target.checked })
            }
          />
          {t("Lebenslauf als öffentliche Unterseite anzeigen")}
        </label>
        <p className="muted small">
          {t(
            "Mit „Veröffentlichen“ wird der Text als verlinkte HTML-Seite unter /lebenslauf öffentlich und für Suchmaschinen zugänglich. Prüfe vorher, welche persönlichen Angaben du veröffentlichen möchtest.",
          )}
        </p>
        <button
          className="text-button"
          disabled={!site.cv.text || busy}
          onClick={() => {
            onChange({ text: "", enabled: false });
            setNotice("");
            setPending(null);
          }}
        >
          <Trash2 size={15} />
          {t("Lebenslauf aus dem Entwurf entfernen")}
        </button>
      </div>
    </>
  );
}
