import BrandLogo from "./BrandLogo";
import { useI18n } from "./i18n";
import { createTranslator, type Messages } from "./translations";
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  MapPin,
  Mail,
  Phone,
  Smartphone,
  Github,
  Linkedin,
  Star,
  Move,
  Leaf,
} from "lucide-react";
import {
  fillName,
  contactLink,
  resolveSiteLink,
  fonts,
  snapBlock,
  words,
  type Site,
  type Block,
} from "./model";
import { asset } from "./api";
import { sourceUrl } from "./source";

export type Selection = { section: string; block: string } | null;
/** Welche öffentliche Seite gezeigt wird: die Website selbst oder einer der Rechtstexte. */
export type PublicPage = "home" | "imprint" | "privacy" | "cv";
export const legalPaths = {
  cv: "/lebenslauf",
  imprint: "/impressum",
  privacy: "/datenschutz",
} as const;
export const legalTitles = {
  cv: "Lebenslauf",
  imprint: "Impressum",
  privacy: "Datenschutz",
} as const;
/**
 * Die öffentliche Ansicht skaliert die Arbeitsfläche mit CSS statt mit gemessener Breite. So
 * liefert der Server fertiges HTML ohne JavaScript, und es sieht genauso aus wie im Browser.
 * `min(100cqw, 1200px)` ist die Breite der Arbeitsfläche, `.site-surface` ist der Container.
 */
const scaled = (value: number) => `calc(${value} * min(100cqw, 1200px) / 1200)`;
type Props = {
  page?: PublicPage;
  /** Pfadanfang der Website auf dem Server: "" für die Startseite, sonst z. B. "/iris". */
  base?: string;
  messages?: Messages;
  site: Site;
  editing?: boolean;
  selected?: Selection;
  onSelect?: (s: Selection) => void;
  onMove?: (section: string, block: Block, final: boolean) => void;
  mobile?: boolean;
  onTextEdit?: (selection: NonNullable<Selection>) => void;
  onEditField?: (field: string, section?: string) => void;
  /** Im Editor: Blöcke, deren Text länger ist als ihr Kasten, mit der nötigen Höhe (1200er-Maß). */
  onOverflow?: (section: string, blocks: Record<string, number>) => void;
  overflowing?: Record<string, number>;
};
function Canvas({
  section,
  site,
  editing,
  selected,
  onSelect,
  onMove,
  mobile,
  onTextEdit,
  onOverflow,
  overflowing,
}: Props & { section: Site["sections"][number] }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(1200);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  // Öffentlich und ohne erzwungene Handyansicht: Größen und Handylayout kommen allein aus dem CSS.
  const fluid = !editing && !mobile;
  const scale = width / 1200,
    small = mobile || (!fluid && width <= 600);
  // Nach jedem Zeichnen nachmessen: Text, der über seinen Kasten hinausläuft, überdeckt sonst
  // unbemerkt, was darunter steht. Gemessen wird nur auf der Arbeitsfläche, das Handylayout wächst mit.
  useLayoutEffect(() => {
    if (!editing || small || !onOverflow || !ref.current) return;
    const found: Record<string, number> = {};
    ref.current
      .querySelectorAll<HTMLElement>(".site-block:not(.block-image)")
      .forEach((el) => {
        const content = el.firstElementChild as HTMLElement | null;
        if (content && content.offsetHeight > el.clientHeight + 2)
          found[el.dataset.block!] = Math.ceil(content.offsetHeight / scale);
      });
    onOverflow(section.id, found);
  });
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    block: Block;
    last: Block;
    scale: number;
    pointer: number;
  } | null>(null);
  const dragged = useRef(false);
  function down(e: PointerEvent, block: Block) {
    if (!editing) return;
    dragged.current = false;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.({ section: section.id, block: block.id });
    if (small) return;
    drag.current = {
      id: block.id,
      startX: e.clientX,
      startY: e.clientY,
      block,
      last: block,
      scale: (ref.current?.getBoundingClientRect().width || 1200) / 1200,
      pointer: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4)
      dragged.current = true;
    if (!dragged.current) return;
    const updated = snapBlock(
      {
        ...d.block,
        x: d.block.x + (e.clientX - d.startX) / d.scale,
        y: Math.min(
          section.height - d.block.h,
          d.block.y + (e.clientY - d.startY) / d.scale,
        ),
      },
      site,
    );
    d.last = updated;
    onMove?.(section.id, updated, false);
  }
  function up() {
    const d = drag.current;
    if (d) {
      drag.current = null;
      if (dragged.current) onMove?.(section.id, d.last, true);
    }
  }
  return (
    <section
      id={section.id}
      className={"site-section " + (editing ? "editable-section" : "")}
    >
      <div
        ref={ref}
        className={"site-canvas " + (small || fluid ? "canvas-mobile" : "")}
        style={{
          height: small
            ? "auto"
            : fluid
              ? scaled(section.height)
              : section.height * scale,
        }}
      >
        {editing && site.grid.show && !small && (
          <div
            className="grid-overlay"
            aria-hidden="true"
            style={{
              gridTemplateColumns: `repeat(${site.grid.columns},1fr)`,
              gap: site.grid.gap * scale,
              backgroundSize: `100% ${site.grid.row * scale}px`,
            }}
          >
            {Array.from({ length: site.grid.columns }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        )}
        {section.blocks.map((block) => {
          const active = selected?.block === block.id,
            text = fillName(block.text, site.name);
          const style: CSSProperties = small
            ? {
                fontSize:
                  block.kind === "heading"
                    ? Math.min(block.fontSize, 40)
                    : block.fontSize,
              }
            : fluid
              ? {
                  left: `${block.x / 12}%`,
                  top: scaled(block.y),
                  width: `${block.w / 12}%`,
                  height: scaled(block.h),
                  fontSize: scaled(block.fontSize),
                }
              : {
                  left: `${block.x / 12}%`,
                  top: block.y * scale,
                  width: `${block.w / 12}%`,
                  height: block.h * scale,
                  fontSize: block.fontSize * scale,
                };
          const rawHref =
            block.kind === "button" &&
            section.id === "start" &&
            site.integrations.bookingUrl
              ? site.integrations.bookingUrl
              : block.href;
          const href = resolveSiteLink(rawHref || "#kontakt", site);
          let node: React.ReactNode;
          if (block.kind === "image")
            node = block.src ? (
              <img
                src={asset(block.src)}
                alt={block.alt}
                draggable={false}
                loading={section.id === "start" ? "eager" : "lazy"}
                onError={(e) => {
                  e.currentTarget.style.opacity = ".3";
                }}
              />
            ) : (
              <div className="empty-image">{t("Bild auswählen")}</div>
            );
          else if (block.kind === "heading")
            node =
              block.id ===
              site.sections
                .flatMap((s) => s.blocks)
                .find((b) => b.kind === "heading")?.id ? (
                <h1>{text}</h1>
              ) : (
                <h2>{text}</h2>
              );
          else if (block.kind === "button")
            node =
              editing || !href ? (
                <span className="site-cta">
                  {text}
                  <ArrowUpRight size={18} />
                </span>
              ) : (
                <a
                  className="site-cta"
                  href={href || "#kontakt"}
                  {...(href.startsWith("https:")
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {text}
                  <ArrowUpRight size={18} />
                </a>
              );
          else node = <p>{text}</p>;
          return (
            <div
              key={block.id}
              className={`site-block block-${block.kind} ${editing ? "can-edit" : ""} ${active ? "is-selected" : ""} ${editing && !small && overflowing?.[block.id] ? "is-overflowing" : ""}`}
              data-block={editing ? block.id : undefined}
              data-image-shape={
                block.kind === "image" ? block.imageShape : undefined
              }
              style={style}
              onPointerDown={(e) => down(e, block)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onLostPointerCapture={up}
              onClick={() => {
                if (editing && !dragged.current)
                  onTextEdit?.({ section: section.id, block: block.id });
              }}
              tabIndex={editing ? 0 : undefined}
              aria-label={
                editing
                  ? t("{label} bearbeiten", {
                      label:
                        block.kind === "image" ? t("Bild") : text.slice(0, 60),
                    })
                  : undefined
              }
              onKeyDown={(e) => {
                if (!editing) return;
                if (e.key === "Enter") {
                  onSelect?.({ section: section.id, block: block.id });
                  onTextEdit?.({ section: section.id, block: block.id });
                }
                if (
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  ) &&
                  !small
                ) {
                  e.preventDefault();
                  onSelect?.({ section: section.id, block: block.id });
                  const step = e.shiftKey ? 16 : 1;
                  onMove?.(
                    section.id,
                    snapBlock(
                      {
                        ...block,
                        x:
                          block.x +
                          (e.key === "ArrowLeft"
                            ? -step
                            : e.key === "ArrowRight"
                              ? step
                              : 0),
                        y: Math.min(
                          section.height - block.h,
                          block.y +
                            (e.key === "ArrowUp"
                              ? -step
                              : e.key === "ArrowDown"
                                ? step
                                : 0),
                        ),
                      },
                      site,
                    ),
                    true,
                  );
                }
              }}
            >
              {node}
              {editing && active && (
                <>
                  <span className="selection-label">
                    <Move size={11} />{" "}
                    {block.kind === "image"
                      ? t("Bild")
                      : block.kind === "heading"
                        ? t("Überschrift")
                        : block.kind === "button"
                          ? t("Button")
                          : t("Text")}
                  </span>
                  <i className="handle h1" />
                  <i className="handle h2" />
                  <i className="handle h3" />
                  <i className="handle h4" />
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
export default function SiteSurface(props: Props) {
  const i18n = useI18n();
  const displayLanguage = props.editing ? i18n.language : props.site.language;
  const t = props.editing
    ? i18n.t
    : createTranslator(
        displayLanguage,
        props.messages ?? i18n.messages[displayLanguage],
      );
  const { site, editing, mobile, page = "home" } = props;
  const [legal, setLegal] = useState<"imprint" | "privacy" | null>(null);
  // Öffentlich sind Impressum und Datenschutz eigene Seiten; im Editor klappen sie auf.
  const fluid = !editing && !mobile;
  const legalPage = page === "imprint" || page === "privacy" ? page : null;
  const hasCv = site.cv.enabled && !!site.cv.text.trim();
  const base = props.base || "";
  const home = page !== "home" ? base || "/" : "";
  const contactHref = contactLink(site);
  const headerHref = site.contact.email ? "mailto:" + site.contact.email : "";
  const showServices = !site.hiddenSections.includes("services");
  const showContact = !site.hiddenSections.includes("contact");
  const voice = site.voice,
    w =
      displayLanguage === "en"
        ? {
            ...words(voice),
            dich: "you",
            meine: voice.team ? "our" : "my",
            deine: "you",
          }
        : words(voice);
  const variables = {
    "--site-primary": site.colors[0],
    "--site-accent": site.colors[1],
    "--site-bg": site.colors[2],
    "--site-surface": site.colors[3],
    "--site-text": site.colors[4],
    "--site-muted": site.colors[5],
    "--site-heading": fonts.find((f) => f.id === site.font)?.value,
  } as CSSProperties;
  const edit = (field: string, section?: string) =>
    editing
      ? {
          "data-edit-field": field,
          "data-edit-section": section,
          tabIndex: 0,
          onKeyDown: (event: React.KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              props.onEditField?.(field, section);
            }
          },
        }
      : {};
  const prevent = (e: React.MouseEvent) => {
    if (editing) e.preventDefault();
  };
  return (
    <div
      className={"site-surface " + (mobile ? "site-mobile" : "")}
      style={variables}
      onClickCapture={
        editing
          ? (event) => {
              const target = (event.target as HTMLElement).closest<HTMLElement>(
                "[data-edit-field]",
              );
              if (!target) return;
              event.preventDefault();
              event.stopPropagation();
              props.onEditField?.(
                target.dataset.editField!,
                target.dataset.editSection,
              );
            }
          : undefined
      }
    >
      <a className="skip-link" href="#site-content">
        {t("Zum Inhalt springen")}
      </a>
      <header className="site-header">
        <a
          href={home + "#" + (site.sections[0]?.id || "site-content")}
          onClick={prevent}
          className="site-brand"
          {...edit("name")}
        >
          <span className="site-brand-icon">
            <Leaf size={22} />
          </span>
          <span>
            {site.name}
            <small {...edit("tagline")}>{site.tagline}</small>
          </span>
        </a>
        <nav aria-label={t("Webseiten-Navigation")}>
          {site.sections.map((s) => (
            <a
              key={s.id}
              href={home + "#" + s.id}
              onClick={prevent}
              {...edit("section-label", s.id)}
            >
              {s.label}
            </a>
          ))}
          {showServices && (
            <a
              href={home + "#leistungen"}
              onClick={prevent}
              {...edit("service-0-title")}
            >
              {t("Leistungen")}
            </a>
          )}
          {showContact && (
            <a
              href={home + "#kontakt"}
              onClick={prevent}
              {...edit("contact-email")}
            >
              {t("Kontakt")}
            </a>
          )}
          {hasCv && (
            <a
              href={base + legalPaths.cv}
              onClick={prevent}
              {...edit("cv-text")}
            >
              {t("Lebenslauf")}
            </a>
          )}
        </nav>
        {headerHref && (
          <a
            className="site-header-cta"
            {...edit("contact-email")}
            href={headerHref}
            onClick={prevent}
          >
            {t("Kontakt aufnehmen ")}
            <ArrowUpRight size={14} />
          </a>
        )}
      </header>
      {page === "cv" ? (
        <main id="site-content">
          <section className="legal-content cv-content">
            <h1>
              {t("Lebenslauf")} · {site.name}
            </h1>
            {site.cv.text
              .split(/\n\s*\n/)
              .filter(Boolean)
              .map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            <a className="legal-back" href={base || "/"}>
              {t("Zur Startseite")}
            </a>
          </section>
        </main>
      ) : legalPage ? (
        <main id="site-content">
          <section className="legal-content">
            <h1>{t(legalTitles[legalPage])}</h1>
            <p>
              {site.legal[legalPage] ||
                t("Die Angaben werden vom Betreiber dieser Website ergänzt.")}
            </p>
            <a className="legal-back" href={base || "/"}>
              {t("Zur Startseite")}
            </a>
          </section>
        </main>
      ) : (
        <main id="site-content">
          {site.sections.map((section) => (
            <Canvas key={section.id} {...props} section={section} />
          ))}
          {showServices && (
            <section className="site-services" id="leistungen">
              <div className="section-intro">
                <span className="site-eyebrow">
                  {(voice.team
                    ? t("Wobei wir {you} unterstützen", { you: w.dich })
                    : t("Wobei ich {you} unterstütze", { you: w.dich })
                  ).toUpperCase()}
                </span>
                <h2>
                  {t(
                    voice.team
                      ? "So können wir für {you} da sein."
                      : "So kann ich für {you} da sein.",
                    { you: w.dich },
                  )}
                </h2>
                <p>
                  {t("Individuell. Persönlich. Mit einem Blick für das Ganze.")}
                </p>
              </div>
              <div className="service-grid">
                {site.services.map((service, i) => (
                  <article key={i} {...edit(`service-${i}-title`)}>
                    <span className="service-number">0{i + 1}</span>
                    <h3>{service.title}</h3>
                    <p {...edit(`service-${i}-description`)}>
                      {service.description}
                    </p>
                    {contactHref && (
                      <a
                        href={contactHref}
                        onClick={prevent}
                        aria-label={t("Kontakt zu {service}", {
                          service: service.title,
                        })}
                      >
                        <ArrowUpRight size={22} />
                      </a>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {!site.hiddenSections.includes("projects") &&
            site.integrations.showRepos &&
            site.repos.length > 0 && (
              <section
                className="site-projects"
                id="projekte"
                {...edit("integration-github")}
              >
                <span className="site-eyebrow">OPEN SOURCE · GITHUB</span>
                <h2>{t("Ein Blick in {my} Projekte.", { my: w.meine })}</h2>
                <div className="repo-grid">
                  {site.repos.map((repo) => (
                    <article key={repo.id}>
                      <Github size={22} />
                      <a
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={prevent}
                      >
                        <h3>
                          {repo.name}
                          <ArrowUpRight size={16} />
                        </h3>
                      </a>
                      <p>
                        {repo.description ||
                          t("Open-Source-Projekt auf GitHub")}
                      </p>
                      <div className="repo-meta">
                        <span>
                          {repo.language || "Repository"}
                          {repo.fork ? " · Fork" : ""}
                        </span>
                        <span>
                          <Star size={13} /> {repo.stars}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          {showContact && (
            <section className="site-contact" id="kontakt">
              <div>
                <span className="site-eyebrow">
                  {t("DER ERSTE SCHRITT IST OFT EIN GESPRÄCH.")}
                </span>
                <h2>
                  {voice.formal
                    ? t("Lernen wir uns kennen.")
                    : t("Lass uns kennenlernen.")}
                </h2>
                <p>
                  {t(
                    voice.team
                      ? "Wir freuen uns auf {your} Nachricht."
                      : "Ich freue mich auf {your} Nachricht.",
                    { your: w.deine },
                  )}
                </p>
                {site.integrations.bookingUrl && (
                  <a
                    className="site-cta"
                    href={site.integrations.bookingUrl}
                    {...edit("integration-booking")}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={prevent}
                  >
                    {t("Termin vereinbaren ")}
                    <ArrowUpRight size={18} />
                  </a>
                )}
              </div>
              <address>
                {site.contact.email && (
                  <a
                    href={"mailto:" + site.contact.email}
                    onClick={prevent}
                    {...edit("contact-email")}
                  >
                    <Mail size={18} />
                    {site.contact.email}
                  </a>
                )}
                {site.contact.phone && (
                  <a
                    {...edit("contact-phone")}
                    href={"tel:" + site.contact.phone.replace(/[^+\d]/g, "")}
                    onClick={prevent}
                  >
                    <Phone size={18} />
                    {site.contact.phone}
                  </a>
                )}
                {site.contact.address && (
                  <p {...edit("contact-address")}>
                    <MapPin size={18} />
                    {site.contact.address}
                  </p>
                )}
                {!site.contact.email &&
                  !site.contact.phone &&
                  !site.contact.address &&
                  editing && (
                    <p {...edit("contact-email")}>
                      {t("Deine Kontaktdaten ergänzt du unter „Inhalte“.")}
                    </p>
                  )}
                {site.integrations.appStoreUrl && (
                  <a
                    href={site.integrations.appStoreUrl}
                    {...edit("integration-appstore")}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={prevent}
                  >
                    <Smartphone size={18} />
                    App Store <ArrowUpRight size={14} />
                  </a>
                )}
                {site.integrations.googlePlayUrl && (
                  <a
                    href={site.integrations.googlePlayUrl}
                    {...edit("integration-googleplay")}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={prevent}
                  >
                    <Smartphone size={18} />
                    {t("Google Play")} <ArrowUpRight size={14} />
                  </a>
                )}
                {site.integrations.linkedinUrl && (
                  <a
                    href={site.integrations.linkedinUrl}
                    {...edit("integration-linkedin")}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={prevent}
                  >
                    <Linkedin size={18} />
                    LinkedIn <ArrowUpRight size={14} />
                  </a>
                )}
              </address>
            </section>
          )}
        </main>
      )}
      <footer className="site-footer">
        <span {...edit("name")}>
          © {new Date().getFullYear()} {site.name}
        </span>
        <div>
          {fluid ? (
            <>
              <a href={base + legalPaths.imprint}>{t("Impressum")}</a>
              <a href={base + legalPaths.privacy}>{t("Datenschutz")}</a>
            </>
          ) : (
            <>
              <button
                {...edit("legal-imprint")}
                onClick={() => setLegal(legal === "imprint" ? null : "imprint")}
                aria-expanded={legal === "imprint"}
              >
                {t("Impressum")}
              </button>
              <button
                {...edit("legal-privacy")}
                onClick={() => setLegal(legal === "privacy" ? null : "privacy")}
                aria-expanded={legal === "privacy"}
              >
                {t("Datenschutz")}
              </button>
            </>
          )}
          <a
            className="klarwarg-credit"
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={t("Quellcode von Klarwarg")}
            onClick={prevent}
          >
            {t("Mit Klarwarg gestaltet ")}
            <ArrowRight size={12} />
          </a>
        </div>
      </footer>
      <span className="klarwarg-badge">
        <BrandLogo size={30} label="Klarwarg" />
      </span>
      {legal && !fluid && (
        <section className="legal-content">
          <h2>{legal === "imprint" ? t("Impressum") : t("Datenschutz")}</h2>
          <p>
            {site.legal[legal] ||
              t("Die Angaben werden vom Betreiber dieser Website ergänzt.")}
          </p>
          <button onClick={() => setLegal(null)}>{t("Schließen")}</button>
        </section>
      )}
    </div>
  );
}
