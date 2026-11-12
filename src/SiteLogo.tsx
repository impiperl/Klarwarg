import React, { useRef } from "react";
import {
  Leaf,
  Heart,
  Stethoscope,
  Code2,
  Briefcase,
  Scale,
  Wrench,
  Sparkles,
  Star,
  Sun,
  Flower2,
  Building2,
  Upload,
  LoaderCircle,
} from "lucide-react";
import { useI18n } from "./i18n";
import type { Site } from "./model";
import { asset } from "./api";

export const logoIcons = [
  { id: "leaf", label: "Blatt", Icon: Leaf },
  { id: "heart", label: "Herz", Icon: Heart },
  { id: "stethoscope", label: "Medizin", Icon: Stethoscope },
  { id: "code", label: "Code", Icon: Code2 },
  { id: "briefcase", label: "Beratung", Icon: Briefcase },
  { id: "scale", label: "Waage", Icon: Scale },
  { id: "wrench", label: "Handwerk", Icon: Wrench },
  { id: "sparkles", label: "Funkeln", Icon: Sparkles },
  { id: "star", label: "Stern", Icon: Star },
  { id: "sun", label: "Sonne", Icon: Sun },
  { id: "flower", label: "Blume", Icon: Flower2 },
  { id: "building", label: "Unternehmen", Icon: Building2 },
] as const;

export function LogoEditor({
  logo,
  onChange,
  onUpload,
  busy,
}: {
  logo: Site["logo"];
  onChange: (logo: Site["logo"]) => void;
  onUpload: (file?: File) => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div data-editor-field="logo" tabIndex={-1}>
      <h3>{t("Logo neben dem Namen")}</h3>
      <div className="preset-buttons" role="group" aria-label={t("Logo-Art")}>
        <button
          type="button"
          aria-pressed={logo.mode === "icon"}
          className={logo.mode === "icon" ? "active" : ""}
          onClick={() => onChange({ ...logo, mode: "icon" })}
        >
          {t("Icon")}
        </button>
        <button
          type="button"
          aria-pressed={logo.mode === "image"}
          className={logo.mode === "image" ? "active" : ""}
          onClick={() => onChange({ ...logo, mode: "image" })}
        >
          {t("Eigenes Bild")}
        </button>
      </div>
      {logo.mode === "icon" ? (
        <div
          className="logo-icon-grid"
          role="group"
          aria-label={t("Logo-Symbol auswählen")}
        >
          {logoIcons.map(({ id, label, Icon }) => (
            <button
              type="button"
              key={id}
              className={logo.icon === id ? "secondary active" : "secondary"}
              aria-pressed={logo.icon === id}
              aria-label={t("Logo-Symbol: {name}", { name: t(label) })}
              onClick={() => onChange({ ...logo, mode: "icon", icon: id })}
            >
              <Icon size={22} aria-hidden="true" />
              <span>{t(label)}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {logo.src && (
            <img
              className="logo-upload-preview"
              src={asset(logo.src)}
              alt={t("Logo-Vorschau")}
            />
          )}
          <p className="muted small">
            {t(
              "PNG, JPG, WebP oder GIF. Transparente Bilder bleiben transparent. Das Logo wird vollständig eingepasst.",
            )}
          </p>
          <input
            type="file"
            ref={input}
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              onUpload(file);
            }}
          />
          <button
            type="button"
            className="secondary full"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Upload size={16} />
            )}
            {t(busy ? "Logo wird hochgeladen …" : "Logo-Bild hochladen")}
          </button>
        </>
      )}
    </div>
  );
}
