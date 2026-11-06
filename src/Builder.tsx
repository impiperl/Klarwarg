import BrandLogo from "./BrandLogo";
import { useI18n, I18nProvider, LanguageSwitch } from "./i18n";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Columns3,
  Download,
  ExternalLink,
  FileText,
  Github,
  Globe,
  Grip,
  ImagePlus,
  Layers,
  LayoutTemplate,
  Leaf,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Monitor,
  MousePointer2,
  Paintbrush,
  Plus,
  Redo2,
  Save,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
  ZoomIn,
  Move,
  Copy,
  AlertCircle,
  CalendarDays,
  Linkedin,
  RefreshCw,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import SiteSurface, {
  legalPaths,
  legalTitles,
  type PublicPage,
  type Selection,
} from "./SiteSurface";
import { api, API } from "./api";
import { getUiLanguage } from "./locale";
import {
  maxSitePathLength,
  sitePathBase,
  sitePathProblem,
  suggestSitePath,
} from "./sitePath";
import {
  careers,
  changeVoice,
  colorNames,
  contrast,
  createBlock,
  createSite,
  fonts,
  imageShapes,
  namePlaceholder,
  otherAddress,
  palettes,
  siteSchema,
  snapBlock,
  uid,
  type Block,
  type Site,
  type Voice,
} from "./model";
import "./styles.css";
import { ZodError } from "zod";
import { describeIssue, validationNotice } from "./validation";
import { sourceUrl } from "./source";
const FieldErrors = React.createContext<Record<string, string>>({});

type Tab = "content" | "design" | "layout" | "integrations" | "settings";
const tabs: { id: Tab; label: string; icon: typeof Layers }[] = [
  { id: "content", label: "Inhalte", icon: Layers },
  { id: "design", label: "Design", icon: Paintbrush },
  { id: "layout", label: "Raster", icon: Columns3 },
  { id: "integrations", label: "Anbindungen", icon: Link2 },
  { id: "settings", label: "Einstellungen", icon: Settings2 },
];
/** Längste Kante eines hochgeladenen Fotos — reicht für die 1200 px breite Fläche auch doppelt dicht. */
const MAX_IMAGE_EDGE = 2400;

/**
 * Fotos werden vor dem Hochladen im Browser neu gezeichnet: auf höchstens 2400 px verkleinert und
 * als WebP gespeichert. Das spart Besuchern Megabytes und entfernt die Metadaten der Kamera —
 * Aufnahmeort (GPS), Gerät, Datum. Die Ausrichtung wendet der Browser vorher an, Hochformatfotos
 * bleiben also aufrecht. GIFs bleiben unverändert, sonst ginge die Animation verloren.
 */
async function prepareImage(file: File): Promise<string> {
  const read = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  if (file.type === "image/gif" || typeof createImageBitmap !== "function")
    return read(file);
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.86),
    );
    // Ältere Browser ohne WebP-Ausgabe liefern PNG; das kann größer sein als das Original.
    if (!blob || blob.type !== "image/webp") return read(file);
    return read(blob);
  } catch {
    return read(file);
  }
}

function Field({
  label,
  children,
  hint,
  path,
}: {
  path?: string;
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const { t, language } = useI18n();
  const id = React.useId();
  const errors = React.useContext(FieldErrors);
  const error = path ? errors[path] : undefined;
  const labelChild = (node: ReactNode): ReactNode => {
    if (!React.isValidElement<{ id?: string; children?: ReactNode }>(node))
      return node;
    if (["input", "select", "textarea"].includes(String(node.type)))
      return React.cloneElement(node as React.ReactElement<any>, {
        id,
        "data-validation-path": path,
        "aria-invalid": error ? true : undefined,
        "aria-describedby":
          [hint ? id + "-hint" : "", error ? id + "-error" : ""]
            .filter(Boolean)
            .join(" ") || undefined,
      });
    return node.props.children
      ? React.cloneElement(
          node,
          {},
          React.Children.map(node.props.children, labelChild),
        )
      : node;
  };
  return (
    <div className="field">
      <label htmlFor={id}>{t(label)}</label>
      {labelChild(children)}
      {hint && <small id={id + "-hint"}>{t(hint)}</small>}
      {error && (
        <small id={id + "-error"} role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const { t, language } = useI18n();
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current!;
    const focusable = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]',
        ),
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  const id = React.useId();
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={"modal " + (wide ? "modal-wide" : "")}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <div className="modal-top">
          <h2 id={id}>{t(title)}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("Schließen")}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Auth({
  setup,
  needsCode,
  onSuccess,
}: {
  setup: boolean;
  needsCode?: boolean;
  onSuccess: (mustChangePassword: boolean) => void;
}) {
  const { t, language } = useI18n();
  const [user, setUser] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <LanguageSwitch className="auth-language-switch" />
      <a href="/" className="wordmark">
        <span className="brand-mark klarwarg-mark">
          <BrandLogo size={34} />
        </span>
        klarwarg<span className="brand-dot">.</span>
      </a>
      <div className="auth-card">
        <div className="auth-icon klarwarg-auth-logo">
          <BrandLogo size={56} label="Klarwarg" />
        </div>
        <span className="eyebrow">{t("DEIN AUFTRITT BEGINNT HIER")}</span>
        <h1>{setup ? t("Ein guter Anfang.") : t("Schön, dass du da bist.")}</h1>
        <p>
          {setup
            ? t(
                "Richte deinen persönlichen Adminzugang ein. Danach gestalten wir deine Website.",
              )
            : t("Melde dich an und mach deine Website zu deiner.")}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const result = await api<{ mustChangePassword?: boolean }>(
                setup ? "/setup" : "/login",
                {
                  username: user,
                  password,
                  ...(setup && needsCode ? { setupCode: code } : {}),
                },
              );
              onSuccess(!!result.mustChangePassword);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t("Benutzername")}>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={80}
              required
              autoFocus
            />
          </Field>
          {setup && needsCode && (
            <Field
              label={t("Einrichtungscode")}
              hint={t(
                "Steht in der Konsole, in der der Klarwarg-Server läuft.",
              )}
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                maxLength={20}
                required
              />
            </Field>
          )}
          <Field
            label={t("Passwort")}
            hint={setup ? t("Mindestens 12 Zeichen.") : undefined}
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={setup ? "new-password" : "current-password"}
              minLength={setup ? 12 : 1}
              maxLength={200}
              required
            />
          </Field>
          {error && (
            <p className="error-message" role="alert">
              {t(error)}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : null}
            {setup ? t("Adminzugang erstellen") : t("Anmelden")}
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="auth-foot">
          <ShieldCheck size={15} />
          {t("Deine Inhalte bleiben auf deinem Server.")}
        </div>
      </div>
      <p className="auth-caption">
        {t("Einfach gestalten. Selbstständig durchstarten.")}
      </p>
    </div>
  );
}
/**
 * Die öffentliche Website im Expo-Entwicklungsserver. Im Betrieb liefert der Klarwarg-Server sie
 * als fertiges HTML aus (`server/render.ts`); hier dient sie nur der Vorschau unter `npm run dev`.
 */
function PublicSite() {
  const { t, language } = useI18n();
  const [site, setSite] = useState<Site | null>(null),
    [error, setError] = useState("");
  const path =
    typeof window !== "undefined"
      ? window.location.pathname.replace(/\/$/, "")
      : "";
  // "/iris/impressum" → Website "iris", Impressum; "/impressum" → Startseiten-Website.
  const segments = path.split("/").filter(Boolean);
  const legalPage = (segment?: string): PublicPage | null =>
    segment && "/" + segment === legalPaths.imprint
      ? "imprint"
      : segment && "/" + segment === legalPaths.privacy
        ? "privacy"
        : null;
  const sitePath = segments[0] && !legalPage(segments[0]) ? segments[0] : "";
  const page: PublicPage =
    legalPage(sitePath ? segments[1] : segments[0]) || "home";
  useEffect(() => {
    api("/site?path=" + encodeURIComponent(sitePath))
      .then((v) => setSite(v.site))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (site) {
      document.documentElement.lang = site.language;
      document.title =
        page === "home"
          ? site.name + " · " + site.tagline
          : legalTitles[page] + " · " + site.name;
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "description");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", site.tagline);
    }
  }, [site, page]);
  if (site)
    return (
      <div className="public-site">
        <SiteSurface site={site} page={page} base={sitePathBase(sitePath)} />
      </div>
    );
  return (
    <div className="auth-page">
      <LanguageSwitch className="auth-language-switch" />
      <div className="wordmark">
        <span className="brand-mark klarwarg-mark">
          <BrandLogo size={34} />
        </span>
        klarwarg.
      </div>
      <div className="auth-card">
        <span className="eyebrow">
          {t("PLATZ FÜR DEINEN NÄCHSTEN SCHRITT")}
        </span>
        <h1>
          {t("Deine Website.")}
          <br />
          {t("Dein Anfang.")}
        </h1>
        <p>{error || t("Website wird geladen …")}</p>
        {error && (
          <a className="primary" href="/admin">
            {t("Website gestalten ")}
            <ArrowRight size={18} />
          </a>
        )}
      </div>
    </div>
  );
}
function Screen() {
  const { t, language } = useI18n();
  const [auth, setAuth] = useState<{
      setup: boolean;
      setupCode?: boolean;
      authenticated: boolean;
      mustChangePassword?: boolean;
    } | null>(null),
    [error, setError] = useState("");
  const isAdmin =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/admin");
  useEffect(() => {
    if (isAdmin) {
      document.title = t("Klarwarg · Deine Website gestalten");
      api("/auth")
        .then(setAuth)
        .catch((e) => setError(e.message));
    }
  }, [isAdmin]);
  useEffect(() => {
    if (isAdmin) document.title = t("Klarwarg · Deine Website gestalten");
  }, [isAdmin, t]);
  if (!isAdmin) return <PublicSite />;
  if (error)
    return (
      <div className="auth-page">
        <LanguageSwitch className="auth-language-switch" />
        <div className="auth-card">
          <h1>{t("Server starten")}</h1>
          <p role="alert">{t(error)}</p>
          <button className="primary" onClick={() => window.location.reload()}>
            {t("Erneut versuchen")}
          </button>
        </div>
      </div>
    );
  if (!auth)
    return (
      <div className="loading-page">
        <LanguageSwitch />
        <LoaderCircle className="spin" />
        {t("Klarwarg wird geladen …")}
      </div>
    );
  if (!auth.authenticated)
    return (
      <Auth
        setup={auth.setup}
        needsCode={auth.setupCode}
        onSuccess={(mustChangePassword) =>
          setAuth({ setup: false, authenticated: true, mustChangePassword })
        }
      />
    );
  if (auth.mustChangePassword)
    return (
      <InitialPasswordChange
        onSuccess={() =>
          setAuth({
            setup: false,
            authenticated: true,
            mustChangePassword: false,
          })
        }
        onLogout={() => setAuth({ setup: false, authenticated: false })}
      />
    );
  return (
    <Workspace
      onLogout={() => setAuth({ setup: false, authenticated: false })}
    />
  );
}

type SiteEntry = {
  id: string;
  name: string;
  /** Veröffentlichte Adresse ("" = Startseite), `null` solange nicht veröffentlicht. */
  path: string | null;
  publishedAt: string | null;
};
const siteStorageKey = "klarwarg.site";
function rememberSite(id?: string) {
  try {
    if (id) window.localStorage.setItem(siteStorageKey, id);
    return window.localStorage.getItem(siteStorageKey);
  } catch {
    return null;
  }
}

/**
 * Mehrere Websites: Hier wird gewählt, welche im Editor offen ist. Beim Wechsel wird der Editor
 * neu aufgebaut (`key`), damit Entwurf, Revision, Verlauf und Auswahl nie in die andere Website
 * hinüberwandern. Gespeichert wird vorher im Editor selbst.
 */
function Workspace({ onLogout }: { onLogout: () => void }) {
  const { t } = useI18n();
  const [sites, setSites] = useState<SiteEntry[] | null>(null),
    [current, setCurrent] = useState<{ id: string; fresh: boolean } | null>(
      null,
    ),
    [error, setError] = useState("");
  const reload = useCallback(async () => {
    const data = await api<{ sites: SiteEntry[] }>("/sites");
    setSites(data.sites);
    return data.sites;
  }, []);
  const open = useCallback((id: string, fresh = false) => {
    rememberSite(id);
    setCurrent({ id, fresh });
  }, []);
  useEffect(() => {
    reload()
      .then(async (list) => {
        const remembered = rememberSite();
        const id =
          list.find((site) => site.id === remembered)?.id || list[0]?.id;
        if (id) return open(id);
        const created = await api<{ id: string }>("/sites", {});
        await reload();
        open(created.id, true);
      })
      .catch((e) => setError(e.message));
  }, [reload, open]);
  if (error || !sites || !current)
    return (
      <div className="loading-page">
        <LanguageSwitch />
        {error ? (
          <p role="alert">{t(error)}</p>
        ) : (
          <>
            <LoaderCircle className="spin" />
            {t("Klarwarg wird geladen …")}
          </>
        )}
      </div>
    );
  return (
    <Builder
      key={current.id}
      siteId={current.id}
      startWithTemplates={current.fresh}
      sites={sites}
      onSitesChanged={reload}
      onOpenSite={open}
      onLogout={onLogout}
    />
  );
}
function InitialPasswordChange({
  onSuccess,
  onLogout,
}: {
  onSuccess: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="auth-page">
      <LanguageSwitch className="auth-language-switch" />
      <div className="auth-card">
        <div className="auth-icon klarwarg-auth-logo">
          <BrandLogo size={56} label="Klarwarg" />
        </div>
        <h1>{t("Bitte ändere zuerst dein Startpasswort.")}</h1>
        <p>
          {t("Wähle ein eigenes Passwort, bevor du den Editor verwendest.")}
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            if (password !== confirmation)
              return setError("Die Passwörter stimmen nicht überein.");
            setBusy(true);
            try {
              await api("/password", { current, password });
              onSuccess();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t("Bisheriges Passwort")}>
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </Field>
          <Field label={t("Neues Passwort (mind. 12 Zeichen)")}>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={200}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label={t("Passwort wiederholen")}>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={200}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="error-message">
              {t(error)}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={18} />}
            {t("Passwort speichern und fortfahren")}
          </button>
        </form>
        <button
          className="text-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/logout", {});
              onLogout();
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {t("Abmelden")}
        </button>
      </div>
    </div>
  );
}

function Builder({
  onLogout,
  siteId,
  sites,
  startWithTemplates = false,
  onSitesChanged,
  onOpenSite,
}: {
  onLogout: () => void;
  siteId: string;
  sites: SiteEntry[];
  /** Neu angelegte Website: gleich mit der Berufswahl beginnen. */
  startWithTemplates?: boolean;
  onSitesChanged: () => Promise<SiteEntry[]>;
  onOpenSite: (id: string, fresh?: boolean) => void;
}) {
  const { t, language } = useI18n();
  // Jede Anfrage an Entwurf, Veröffentlichung und Versionen nennt die Website ausdrücklich.
  const siteQuery = "?site=" + encodeURIComponent(siteId);
  const [site, setSite] = useState<Site | null>(null),
    [tab, setTab] = useState<Tab>("content"),
    [selected, setSelected] = useState<Selection>(null),
    [status, setStatus] = useState("Gespeichert"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [mobile, setMobile] = useState(() => window.innerWidth <= 760),
    [preview, setPreview] = useState(false),
    [templates, setTemplates] = useState(startWithTemplates),
    [templateChoice, setTemplateChoice] = useState<string | null>(null),
    [templateBusy, setTemplateBusy] = useState(false),
    [templateError, setTemplateError] = useState(""),
    [help, setHelp] = useState(false),
    [publishedAt, setPublishedAt] = useState<string | null>(null),
    [publishing, setPublishing] = useState(false),
    [publishOpen, setPublishOpen] = useState(false),
    [sitePath, setSitePath] = useState<string | null>(null),
    [publishPath, setPublishPath] = useState(""),
    [siteBusy, setSiteBusy] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false),
    [showPanel, setShowPanel] = useState(() => window.innerWidth > 760),
    [inspectorOpen, setInspectorOpen] = useState(
      () => window.innerWidth > 1050,
    );
  const [exportUrl, setExportUrl] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{
    kind: "canvas" | "static";
    id: string;
    label: string;
  } | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ field: string } | null>(
    null,
  );
  useEffect(() => {
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() => {
      const field = focusRequest.field.startsWith("validation:")
        ? document.querySelector<HTMLElement>(
            `[data-validation-path="${focusRequest.field.slice(11)}"]`,
          )
        : document.querySelector<HTMLElement>(
            `[data-editor-field="${focusRequest.field}"]`,
          );
      if (!field) return;
      let parent = field.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      field.scrollIntoView({ block: "nearest", inline: "nearest" });
      field.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);
  const [historyCount, setHistoryCount] = useState([0, 0]),
    [stageWidth, setStageWidth] = useState(900),
    [sectionId, setSectionId] = useState("start"),
    [integrationStatus, setIntegrationStatus] = useState({
      linkedin: false,
      business: false,
    }),
    [syncing, setSyncing] = useState(""),
    // Je Abschnitt: Blöcke, deren Text über den Kasten hinausläuft, mit der nötigen Höhe.
    [overflow, setOverflow] = useState<Record<string, Record<string, number>>>(
      {},
    );
  const [versions, setVersions] = useState<{ id: string; created: string }[]>(
      [],
    ),
    [currentPassword, setCurrentPassword] = useState(""),
    [newPassword, setNewPassword] = useState("");
  const draft = useRef<Site | null>(null),
    revision = useRef(0),
    saved = useRef(""),
    queue = useRef(Promise.resolve()),
    conflict = useRef(false),
    // Nach dem Löschen darf kein verspätetes automatisches Speichern mehr losgehen.
    deleted = useRef(false),
    integrationGeneration = useRef(0),
    undo = useRef<Site[]>([]),
    redo = useRef<Site[]>([]),
    dragStart = useRef<Site | null>(null),
    stage = useRef<HTMLDivElement>(null),
    importInput = useRef<HTMLInputElement>(null),
    uploadInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api("/draft" + siteQuery)
      .then((data) => {
        draft.current = data.site;
        setSitePath(data.path ?? null);
        setSite(data.site);
        revision.current = data.revision;
        saved.current = JSON.stringify(data.site);
        setPublishedAt(data.publishedAt);
        const first = data.site.sections[0];
        setSectionId(first?.id || "");
        setSelected(
          first
            ? {
                section: first.id,
                block:
                  first.blocks.find((b: Block) => b.kind === "heading")?.id ||
                  first.blocks[0]?.id,
              }
            : null,
        );
      })
      .catch((e) => setError(e.message));
    api("/integrations")
      .then(setIntegrationStatus)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!stage.current) return;
    const el = stage.current;
    const obs = new ResizeObserver(() => setStageWidth(el.clientWidth));
    obs.observe(el);
    return () => obs.disconnect();
  }, [site, preview]);
  const change = useCallback((next: Site, history = true) => {
    if (history && draft.current) {
      undo.current = [...undo.current.slice(-59), draft.current];
      redo.current = [];
      setHistoryCount([undo.current.length, 0]);
    }
    draft.current = next;
    setSite(next);
  }, []);
  function patch(patch: Partial<Site>) {
    if (draft.current) change({ ...draft.current, ...patch });
  }
  function mutateBlock(patch: Partial<Block>) {
    if (!draft.current || !selected) return;
    change({
      ...draft.current,
      sections: draft.current.sections.map((s) =>
        s.id === selected.section
          ? {
              ...s,
              blocks: s.blocks.map((b) => {
                if (b.id !== selected.block) return b;
                const next = { ...b, ...patch };
                return { ...next, x: Math.min(next.x, 1200 - next.w) };
              }),
            }
          : s,
      ),
    });
  }
  const reportOverflow = useCallback(
    (section: string, blocks: Record<string, number>) =>
      setOverflow((prev) =>
        JSON.stringify(prev[section] || {}) === JSON.stringify(blocks)
          ? prev
          : { ...prev, [section]: blocks },
      ),
    [],
  );
  /** Kasten auf die Höhe seines Textes bringen; der Abschnitt wächst mit, wenn es nötig ist. */
  function fitBlock(section: string, id: string, needed: number) {
    if (!draft.current) return;
    const { row, snap } = draft.current.grid;
    const h = Math.min(1500, snap ? Math.ceil(needed / row) * row : needed);
    change({
      ...draft.current,
      sections: draft.current.sections.map((s) =>
        s.id === section
          ? {
              ...s,
              height: Math.min(
                3500,
                Math.max(
                  s.height,
                  ...s.blocks.filter((b) => b.id === id).map((b) => b.y + h),
                ),
              ),
              blocks: s.blocks.map((b) => (b.id === id ? { ...b, h } : b)),
            }
          : s,
      ),
    });
  }
  function setVoice(voice: Voice) {
    if (!draft.current) return;
    const next = changeVoice(draft.current, voice),
      left = otherAddress(next);
    change(next);
    const count = left.blocks.length + (left.tagline ? 1 : 0) + left.services;
    setNotice(
      count
        ? "Die Vorlagentexte sind umgestellt. Eigene Texte bitte selbst anpassen."
        : "Die Texte sind umgestellt.",
    );
  }
  function moveBlock(section: string, block: Block, final: boolean) {
    if (!draft.current) return;
    if (!dragStart.current) dragStart.current = draft.current;
    const next = {
      ...draft.current,
      sections: draft.current.sections.map((s) =>
        s.id === section
          ? {
              ...s,
              blocks: s.blocks.map((b) => (b.id === block.id ? block : b)),
            }
          : s,
      ),
    };
    if (final) {
      undo.current = [...undo.current.slice(-59), dragStart.current];
      redo.current = [];
      setHistoryCount([undo.current.length, 0]);
      dragStart.current = null;
    }
    change(next, false);
  }
  const save = useCallback(async () => {
    const snapshot = draft.current;
    if (!snapshot || deleted.current) return;
    const json = JSON.stringify(snapshot);
    const job = queue.current
      .catch(() => {})
      .then(async () => {
        if (conflict.current)
          throw new Error(
            "Speicherkonflikt: Bitte JSON sichern und die aktuelle Version neu laden.",
          );
        if (json === saved.current) return;
        setStatus("Wird gespeichert …");
        try {
          const validated = siteSchema.parse(snapshot);
          const result = await api(
            "/draft" + siteQuery,
            { site: validated, revision: revision.current },
            "PUT",
          );
          revision.current = result.revision;
          saved.current = json;
          setStatus(
            JSON.stringify(draft.current) === json
              ? "Gespeichert"
              : "Änderungen offen",
          );
          setError("");
        } catch (e) {
          const message = (e as Error).message;
          if (message.includes("anderen Fenster")) conflict.current = true;
          setStatus("Nicht gespeichert");
          if (e instanceof ZodError) throw new Error(validationNotice);
          throw e;
        }
      });
    queue.current = job;
    return job;
  }, []);
  function openTemplates() {
    setTemplateChoice(null);
    setTemplateError("");
    setTemplates(true);
  }
  function closeTemplates() {
    if (templateBusy) return;
    setTemplates(false);
    setTemplateChoice(null);
    setTemplateError("");
  }
  async function applyTemplate() {
    if (!templateChoice || templateBusy || !draft.current) return;
    const previous = draft.current;
    setTemplateBusy(true);
    setTemplateError("");
    try {
      const next = { ...createSite(templateChoice), domain: previous.domain };
      integrationGeneration.current += 1;
      dragStart.current = null;
      change(next, false);
      // Queue the replacement behind pending saves and acknowledge it only after SQLite accepted it.
      await save();
      undo.current = [...undo.current.slice(-59), previous];
      redo.current = [];
      setHistoryCount([undo.current.length, 0]);
      setSelected({
        section: next.sections[0].id,
        block: next.sections[0].blocks.find(
          (block) => block.kind === "heading",
        )!.id,
      });
      setSectionId(next.sections[0]?.id || "");
      setOverflow({});
      setTemplates(false);
      setTemplateChoice(null);
      setNotice("Deine neue Vorlage ist bereit. Mach sie zu deiner.");
    } catch (error) {
      // A rejected save must not pretend the new profession is the persisted draft.
      change(previous, false);
      setStatus(
        JSON.stringify(previous) === saved.current
          ? "Gespeichert"
          : "Änderungen offen",
      );
      setTemplateError((error as Error).message);
    } finally {
      setTemplateBusy(false);
    }
  }
  useEffect(() => {
    if (!site || dragStart.current || JSON.stringify(site) === saved.current)
      return;
    setStatus("Änderungen offen");
    const timer = setTimeout(
      () => save().catch((e) => setError(e.message)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [site, save]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (draft.current && JSON.stringify(draft.current) !== saved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  function travel(direction: "undo" | "redo") {
    if (!draft.current) return;
    const from = direction === "undo" ? undo : redo,
      to = direction === "undo" ? redo : undo;
    const next = from.current.pop();
    if (!next) return;
    to.current.push(draft.current);
    change(next, false);
    setSelected(null);
    setHistoryCount([undo.current.length, redo.current.length]);
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save().catch((e) => setError(e.message));
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "z" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        e.preventDefault();
        travel(e.shiftKey ? "redo" : "undo");
      }
      if (
        e.key === "Escape" &&
        !templates &&
        !help &&
        !publishOpen &&
        !deleteOpen &&
        !removeTarget
      ) {
        setPreview(false);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function select(s: Selection) {
    setSelected(s);
    if (s) setSectionId(s.section);
    setInspectorOpen(true);
  }
  function editField(field: string) {
    setSelected(null);
    setTab(
      field.startsWith("integration-")
        ? "integrations"
        : field === "domain" || field.startsWith("legal-")
          ? "settings"
          : field === "section-label"
            ? "layout"
            : "content",
    );
    setShowPanel(true);
    if (window.innerWidth <= 1050) setInspectorOpen(false);
    setFocusRequest({ field });
  }
  function editBlock(selection: NonNullable<Selection>) {
    select(selection);
    const current = draft.current?.sections
      .find((s) => s.id === selection.section)
      ?.blocks.find((b) => b.id === selection.block);
    setInspectorOpen(true);
    if (window.innerWidth <= 1050) setShowPanel(false);
    setFocusRequest({
      field: current?.kind === "image" ? "block-image" : "block-text",
    });
  }
  function addBlock(kind: Block["kind"]) {
    if (!draft.current) return;
    if (!draft.current.sections.length) {
      const section = {
        id: "abschnitt-" + uid().slice(0, 8),
        label: t("Neuer Abschnitt"),
        height: 400,
        blocks: [createBlock(kind)],
      };
      change({ ...draft.current, sections: [section] });
      select({ section: section.id, block: section.blocks[0].id });
      return;
    }
    const section =
      draft.current.sections.find((s) => s.id === sectionId) ||
      draft.current.sections[0];
    const last = Math.max(48, ...section.blocks.map((b) => b.y + b.h + 32));
    const block = createBlock(kind, { y: last, x: 64 });
    change({
      ...draft.current,
      sections: draft.current.sections.map((s) =>
        s.id === section.id
          ? {
              ...s,
              height: Math.max(s.height, last + block.h + 64),
              blocks: [...s.blocks, block],
            }
          : s,
      ),
    });
    select({ section: section.id, block: block.id });
    setNotice(
      "Element hinzugefügt. Text und Position kannst du rechts ändern.",
    );
  }
  function download() {
    if (!site) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(site, null, 2)], { type: "application/json" }),
    );
    // Je Website ein eigener Dateiname, damit sich Sicherungen mehrerer Websites nicht verwechseln.
    a.download = `klarwarg-${sitePath || suggestSitePath(site.name) || "website"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setNotice("Deine Website wurde als JSON gesichert.");
  }
  async function downloadHtml() {
    if (!draft.current || exportBusy) return;
    setExportBusy(true);
    setError("");
    try {
      const response = await fetch(API + "/api/export" + siteQuery, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": getUiLanguage(),
        },
        body: JSON.stringify({
          site: draft.current,
          targetUrl: exportUrl || draft.current.domain,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.errorKey || result.error);
      }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `klarwarg-${sitePath || suggestSitePath(draft.current.name) || "website"}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "HTML-Website als ZIP exportiert. Entpacke die ZIP und lade ihren Inhalt in den Zielordner deines Webspace hoch.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExportBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    // Fotos werden vor dem Hochladen verkleinert, deshalb dürfen sie größer sein als GIFs.
    const limit = file.type === "image/gif" ? 8 : 30;
    if (file.size > limit * 1024 * 1024) {
      setError(`Bitte ein Bild bis ${limit} MB auswählen.`);
      return;
    }
    setSyncing("upload");
    try {
      const data = await prepareImage(file);
      const result = await api("/upload", { data });
      mutateBlock({ src: result.url, alt: file.name.replace(/\.[^.]+$/, "") });
      setNotice("Bild hochgeladen. Ergänze eine passende Bildbeschreibung.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing("");
    }
  }
  async function syncGithub() {
    if (!draft.current) return;
    const generation = integrationGeneration.current;
    setSyncing("github");
    setError("");
    try {
      const username = draft.current.integrations.githubUser;
      const data = await api("/github", { username });
      if (
        generation !== integrationGeneration.current ||
        draft.current?.integrations.githubUser !== username
      )
        return;
      if (draft.current) change({ ...draft.current, repos: data.repos });
      setNotice(`${data.repos.length} öffentliche Repositories importiert.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing("");
    }
  }
  async function publish() {
    setPublishing(true);
    setError("");
    try {
      await save();
      const result = await api("/publish" + siteQuery, {
        path: publishPath.trim().toLowerCase(),
      });
      setPublishedAt(result.created);
      setSitePath(result.path);
      onSitesChanged().catch(() => {});
      setPublishOpen(false);
      setNotice("Deine Website ist veröffentlicht.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }
  /** Andere Website öffnen; vorher wird der Entwurf dieser Website gespeichert. */
  async function switchSite(id: string) {
    if (id === siteId || siteBusy) return;
    setSiteBusy(true);
    try {
      await save();
      onOpenSite(id);
    } catch (e) {
      setError((e as Error).message);
      setSiteBusy(false);
    }
  }
  async function createNewSite() {
    if (siteBusy) return;
    setSiteBusy(true);
    try {
      await save();
      const { id } = await api<{ id: string }>("/sites", {});
      await onSitesChanged();
      onOpenSite(id, true);
    } catch (e) {
      setError((e as Error).message);
      setSiteBusy(false);
    }
  }
  async function deleteThisSite() {
    if (siteBusy) return;
    setSiteBusy(true);
    deleted.current = true;
    try {
      await api("/sites/" + encodeURIComponent(siteId), undefined, "DELETE");
      const list = await onSitesChanged();
      onOpenSite(list[0].id);
    } catch (e) {
      deleted.current = false;
      setError((e as Error).message);
      setSiteBusy(false);
    }
  }
  const siteLabel = (entry: SiteEntry) => {
    const name =
      (entry.id === siteId ? site?.name : entry.name) || t("Ohne Namen");
    const path = entry.id === siteId ? sitePath : entry.path;
    return path === null ? name : `${name} · /${path}`;
  };
  const siteOptions = sites.map((entry) => (
    <option key={entry.id} value={entry.id}>
      {siteLabel(entry)}
    </option>
  ));
  function openPublish() {
    const rootTaken = sites.some(
      (entry) => entry.id !== siteId && entry.path === "",
    );
    setPublishPath(
      sitePath ?? (rootTaken ? suggestSitePath(site?.name || "") : ""),
    );
    setError("");
    setPublishOpen(true);
  }
  const normalizedPublishPath = publishPath.trim().toLowerCase();
  const publishPathTakenBy = sites.find(
    (entry) => entry.id !== siteId && entry.path === normalizedPublishPath,
  );
  const publishPathProblem = sitePathProblem(normalizedPublishPath);
  const publishPathError = publishPathProblem
    ? t(publishPathProblem)
    : publishPathTakenBy
      ? t("Diese Adresse hat schon die Website „{name}“.", {
          name: publishPathTakenBy.name || t("Ohne Namen"),
        })
      : "";
  const validationResult = React.useMemo(
    () => (site ? siteSchema.safeParse(site) : null),
    [site],
  );
  const validationIssues =
    validationResult && !validationResult.success
      ? validationResult.error.issues
      : [];
  const describedIssues = validationIssues.map((issue) =>
    describeIssue(issue, t),
  );
  const fieldErrors = Object.fromEntries(
    describedIssues.map((issue) => [issue.key, issue.message]),
  );
  if (!site)
    return (
      <div className="loading-page">
        <LanguageSwitch />
        {error ? (
          <p role="alert">{t(error)}</p>
        ) : (
          <>
            <LoaderCircle className="spin" />
            {t("Dein Arbeitsbereich wird vorbereitet …")}
          </>
        )}
      </div>
    );
  const currentCareer =
      careers.find((c) => c.id === site.profession) || careers[0],
    block = site.sections
      .find((s) => s.id === selected?.section)
      ?.blocks.find((b) => b.id === selected?.block),
    activeSection =
      site.sections.find((s) => s.id === sectionId) || site.sections[0];
  const blockPath = `sections.${site.sections.findIndex((s) => s.id === selected?.section)}.blocks.${site.sections.find((s) => s.id === selected?.section)?.blocks.findIndex((b) => b.id === selected?.block) ?? -1}`;
  const overflowing: Record<string, number> = Object.assign(
      {},
      ...Object.values(overflow),
    ),
    needed = block && !mobile ? overflowing[block.id] : undefined,
    mismatch = otherAddress(site),
    mismatchCount =
      mismatch.blocks.length + (mismatch.tagline ? 1 : 0) + mismatch.services;
  function showInvalidField(key: string) {
    const path = key.split(".");
    const fields: Record<string, string> = {
      domain: "domain",
      name: "name",
      tagline: "tagline",
      "contact.email": "contact-email",
      "contact.phone": "contact-phone",
      "contact.address": "contact-address",
      "integrations.linkedinUrl": "integration-linkedin",
      "integrations.bookingUrl": "integration-booking",
      "integrations.appStoreUrl": "integration-appstore",
      "integrations.googlePlayUrl": "integration-googleplay",
      "integrations.githubUser": "integration-github",
      "legal.imprint": "legal-imprint",
      "legal.privacy": "legal-privacy",
    };
    if (fields[key]) return editField(fields[key]);
    if (path[0] === "services")
      return editField(`service-${path[1]}-${path[2]}`);
    if (path[0] === "sections") {
      const section = site!.sections[Number(path[1])];
      if (path[2] === "blocks" && section?.blocks[Number(path[3])]) {
        editBlock({
          section: section.id,
          block: section.blocks[Number(path[3])].id,
        });
        setFocusRequest({ field: "validation:" + key });
        return;
      }
      if (section) {
        setSectionId(section.id);
        editField("section-label");
        return;
      }
    }
    setShowPanel(true);
    setTab(
      path[0] === "grid"
        ? "layout"
        : path[0] === "font" || path[0] === "colors"
          ? "design"
          : "settings",
    );
  }
  function showMismatch() {
    const first = mismatch.blocks[0];
    if (first) {
      select(first);
      document
        .querySelector(`[data-block="${first.block}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else
      openDetails(mismatch.tagline ? "header-settings" : "services-settings");
  }
  const paperWidth = mobile ? 390 : 1200,
    scale = Math.min(1, (stageWidth - 64) / paperWidth);
  const finishCount = [
    !!site.name && !site.name.includes("Berger"),
    !!site.contact.email || !!site.contact.phone,
    !!publishedAt,
  ].filter(Boolean).length;
  const medicalCareer = [
    "psychiatry",
    "medicine",
    "therapy",
    "physio",
  ].includes(site.profession);
  const providerOptions = [
    ["none", "Kein Anbieter"],
    ...(medicalCareer
      ? [
          ["doctena", "Doctena"],
          ["doctolib", "Doctolib"],
          ["jameda", "jameda"],
        ]
      : []),
    ...(site.profession === "law"
      ? [
          ["ra-micro", "RA-MICRO / Mandantenportal"],
          ["advoware", "advoware / Mandantenportal"],
        ]
      : []),
    ["calendly", "Calendly"],
    ["custom", "Anderer Anbieter"],
  ];
  // Keep an explicitly configured provider editable when loading an older/custom draft.
  if (!providerOptions.some(([id]) => id === site.integrations.provider)) {
    const providerNames = {
      doctena: "Doctena",
      doctolib: "Doctolib",
      jameda: "jameda",
      "ra-micro": "RA-MICRO / Mandantenportal",
      advoware: "advoware / Mandantenportal",
    };
    providerOptions.push([
      site.integrations.provider,
      providerNames[site.integrations.provider as keyof typeof providerNames] ||
        site.integrations.provider,
    ]);
  }
  const showGithub =
    site.profession === "developer" ||
    !!site.integrations.githubUser ||
    site.repos.length > 0;
  const updateIntegrations = (p: Partial<Site["integrations"]>) =>
    patch({ integrations: { ...site.integrations, ...p } });
  const fixedSections = [
    {
      id: "services" as const,
      label: t("Leistungen"),
      icon: LayoutTemplate,
      target: "services-settings",
    },
    {
      id: "projects" as const,
      label: t("GitHub-Projekte"),
      icon: Github,
      target: "integrations",
    },
    {
      id: "contact" as const,
      label: t("Kontakt"),
      icon: MailIcon,
      target: "header-settings",
    },
  ];
  function removeSection() {
    if (!removeTarget || !draft.current) return;
    const current = draft.current;
    if (removeTarget.kind === "canvas") {
      const sections = current.sections.filter(
        (section) => section.id !== removeTarget.id,
      );
      patch({ sections });
      setSectionId(sections[0]?.id || "");
    } else {
      const id = removeTarget.id as Site["hiddenSections"][number];
      patch({ hiddenSections: [...new Set([...current.hiddenSections, id])] });
    }
    setSelected(null);
    setRemoveTarget(null);
  }
  function openDetails(id: string) {
    const el = document.getElementById(id) as HTMLDetailsElement | null;
    if (el) {
      el.open = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.querySelector("input")?.focus({ preventScroll: true });
    }
  }
  const panelContent =
    tab === "content" ? (
      <>
        <div className="panel-section">
          <span className="eyebrow">{t("DEIN AUSGANGSPUNKT")}</span>
          <button className="template-choice" onClick={openTemplates}>
            <span className="career-symbol">{currentCareer.symbol}</span>
            <span>
              <strong>{t(currentCareer.name)}</strong>
              <small>{t("Vorlage wechseln")}</small>
            </span>
            <ChevronDown size={16} />
          </button>
        </div>
        <div className="panel-section">
          <h3>{t("Anrede")}</h3>
          <p className="muted small">
            {t(
              "Gilt für die Vorlagentexte und die festen Überschriften der Website.",
            )}
          </p>
          {(
            [
              {
                key: "formal",
                label: t("Besucher ansprechen mit"),
                options: [t("Du"), t("Sie")],
              },
              {
                key: "team",
                label: t("Wer spricht"),
                options: [t("Ich"), t("Wir")],
              },
            ] as const
          ).map((group) => (
            <div
              key={group.key}
              className="field"
              role="group"
              aria-labelledby={"voice-" + group.key}
            >
              <span className="inspector-label" id={"voice-" + group.key}>
                {t(group.label)}
              </span>
              <div className="preset-buttons voice-buttons">
                {group.options.map((option, i) => (
                  <button
                    key={t(option)}
                    className={site.voice[group.key] === !!i ? "active" : ""}
                    aria-pressed={site.voice[group.key] === !!i}
                    onClick={() =>
                      site.voice[group.key] !== !!i &&
                      setVoice({ ...site.voice, [group.key]: !!i })
                    }
                  >
                    {t(option)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {mismatchCount > 0 && (
            <p className="contrast-warning voice-warning">
              <AlertCircle size={15} />
              <span>
                {mismatchCount === 1
                  ? t("In einem Text")
                  : t("In {count} Texten", { count: mismatchCount })}{" "}
                {t("steht noch ")}
                {site.voice.formal ? t("„du“") : t("„Sie“")}.{" "}
                <button className="text-button" onClick={showMismatch}>
                  {t("Zeigen")}
                </button>
              </span>
            </p>
          )}
        </div>
        <div className="panel-section">
          <div className="section-heading">
            <h3>{t("Seitenabschnitte")}</h3>
            <span className="count">
              {site.sections.length +
                fixedSections.filter(
                  (section) =>
                    !site.hiddenSections.includes(section.id) &&
                    (section.id !== "projects" ||
                      (site.repos.length > 0 && site.integrations.showRepos)),
                ).length}
            </span>
          </div>
          <p className="muted small">
            {t("Die Navigation entsteht automatisch.")}
          </p>
          <div className="section-list">
            <button
              className="section-static"
              onClick={() => openDetails("header-settings")}
            >
              <Menu size={15} />
              <span>{t("Header & Navigation")}</span>
              <ChevronRight size={12} />
            </button>
            {site.sections.map((s, i) => (
              <div
                key={s.id}
                className={
                  "section-row " + (sectionId === s.id ? "active" : "")
                }
              >
                <button
                  onClick={() => {
                    setSectionId(s.id);
                    select({ section: s.id, block: s.blocks[0]?.id });
                    document
                      .getElementById(s.id)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  <Grip size={14} />
                  <span>{s.label}</span>
                </button>
                <button
                  className="tiny-button"
                  aria-label={t("{label} nach oben", { label: s.label })}
                  disabled={i === 0}
                  onClick={() => {
                    const sections = [...site.sections];
                    [sections[i - 1], sections[i]] = [
                      sections[i],
                      sections[i - 1],
                    ];
                    patch({ sections });
                  }}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  className="tiny-button"
                  aria-label={t("Bereich {label} entfernen", {
                    label: s.label,
                  })}
                  onClick={() =>
                    setRemoveTarget({
                      kind: "canvas",
                      id: s.id,
                      label: s.label,
                    })
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {fixedSections
              .filter(
                (section) =>
                  !site.hiddenSections.includes(section.id) &&
                  (section.id !== "projects" ||
                    (site.repos.length > 0 && site.integrations.showRepos)),
              )
              .map((section) => (
                <div className="section-row" key={section.id}>
                  <button
                    onClick={() => {
                      if (section.target === "integrations") {
                        setTab("integrations");
                        setShowPanel(true);
                      } else openDetails(section.target);
                    }}
                  >
                    <section.icon size={15} />
                    <span>{section.label}</span>
                    <ChevronRight size={12} />
                  </button>
                  <button
                    className="tiny-button"
                    aria-label={t("Bereich {label} entfernen", {
                      label: section.label,
                    })}
                    onClick={() =>
                      setRemoveTarget({
                        kind: "static",
                        id: section.id,
                        label: section.label,
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            {fixedSections
              .filter((section) => site.hiddenSections.includes(section.id))
              .map((section) => (
                <button
                  className="text-button"
                  key={section.id}
                  onClick={() =>
                    patch({
                      hiddenSections: site.hiddenSections.filter(
                        (id) => id !== section.id,
                      ),
                    })
                  }
                >
                  <Plus size={14} />
                  {t("Bereich {label} wieder einfügen", {
                    label: section.label,
                  })}
                </button>
              ))}
          </div>
          <button
            className="text-button"
            onClick={() => {
              const id = "abschnitt-" + uid().slice(0, 8);
              const b = createBlock("heading", {
                text: t("Ein neuer Abschnitt"),
                fontSize: 40,
              });
              patch({
                sections: [
                  ...site.sections,
                  { id, label: t("Neuer Abschnitt"), height: 320, blocks: [b] },
                ],
              });
              setSectionId(id);
              select({ section: id, block: b.id });
            }}
          >
            <Plus size={15} />
            {t("Abschnitt hinzufügen")}
          </button>
        </div>
        <div className="panel-section">
          <h3>{t("Was möchtest du hinzufügen?")}</h3>
          <p className="muted small">
            {t("Ein Klick. Dann direkt gestalten.")}
          </p>
          <div className="element-grid">
            {(
              [
                { kind: "heading", label: t("Überschrift"), icon: Type },
                { kind: "text", label: t("Text"), icon: FileText },
                { kind: "image", label: t("Bild"), icon: ImagePlus },
                { kind: "button", label: t("Button"), icon: MousePointer2 },
              ] as const
            ).map((item) => (
              <button key={item.kind} onClick={() => addBlock(item.kind)}>
                <item.icon size={22} />
                {t(item.label)}
                <Plus size={12} />
              </button>
            ))}
          </div>
        </div>
        <details className="panel-section" id="header-settings">
          <summary>
            {t("Header & Kontaktdaten ")}
            <ChevronDown size={14} />
          </summary>
          <div className="details-content">
            <Field
              path="name"
              label={t("Name / Unternehmen")}
              hint={t("In Texten setzt {placeholder} diesen Namen ein.", {
                placeholder: namePlaceholder,
              })}
            >
              <input
                data-editor-field={"name"}
                value={site.name}
                maxLength={120}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Field>
            <Field path="tagline" label={t("Unterzeile")}>
              <input
                data-editor-field={"tagline"}
                value={site.tagline}
                maxLength={250}
                onChange={(e) => patch({ tagline: e.target.value })}
              />
            </Field>
            {(["email", "phone", "address"] as const).map((key, i) => (
              <Field
                key={key}
                path={"contact." + key}
                label={[t("E-Mail"), t("Telefon"), t("Adresse")][i]}
              >
                <input
                  type={key === "email" ? "email" : "text"}
                  data-editor-field={`contact-${key}`}
                  value={site.contact[key]}
                  onChange={(e) =>
                    patch({
                      contact: { ...site.contact, [key]: e.target.value },
                    })
                  }
                />
              </Field>
            ))}
          </div>
        </details>
        <details className="panel-section" id="services-settings">
          <summary>
            {t("Leistungen bearbeiten ")}
            <ChevronDown size={14} />
          </summary>
          <div className="details-content">
            {site.services.map((s, i) => (
              <div key={i} className="service-edit">
                <Field
                  path={`services.${i}.title`}
                  label={t("Leistung ") + (i + 1)}
                >
                  <input
                    data-editor-field={`service-${i}-title`}
                    value={s.title}
                    onChange={(e) =>
                      patch({
                        services: site.services.map((x, j) =>
                          i === j ? { ...x, title: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
                <Field
                  path={`services.${i}.description`}
                  label={t("Beschreibung")}
                >
                  <textarea
                    rows={3}
                    data-editor-field={`service-${i}-description`}
                    value={s.description}
                    onChange={(e) =>
                      patch({
                        services: site.services.map((x, j) =>
                          i === j ? { ...x, description: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
                <button
                  className="text-button danger"
                  onClick={() =>
                    patch({ services: site.services.filter((_, j) => j !== i) })
                  }
                >
                  <Trash2 size={13} />
                  {t("Entfernen")}
                </button>
              </div>
            ))}
            <button
              className="text-button"
              onClick={() =>
                patch({
                  services: [
                    ...site.services,
                    {
                      title: t("Neue Leistung"),
                      description: t("Beschreibe hier dein Angebot."),
                    },
                  ],
                })
              }
            >
              <Plus size={14} />
              {t("Leistung hinzufügen")}
            </button>
          </div>
        </details>
      </>
    ) : tab === "design" ? (
      <>
        <div className="panel-section">
          <span className="eyebrow">
            {t("DEIN STIL. EIN STIMMIGER AUFTRITT.")}
          </span>
          <h3>{t("Farben, die zu dir passen.")}</h3>
          <p className="muted small">
            {t(
              "Starte mit einer Palette oder wähle deine eigenen sechs Farben.",
            )}
          </p>
          <div className="palette-list">
            {palettes.map((p) => (
              <button
                key={t(p.name)}
                className={
                  "palette " +
                  (p.colors.join() === site.colors.join() ? "chosen" : "")
                }
                onClick={() => patch({ colors: [...p.colors] })}
              >
                <span className="palette-swatches">
                  {p.colors.slice(0, 4).map((c, i) => (
                    <i key={i} style={{ background: c }} />
                  ))}
                </span>
                <span>{t(p.name)}</span>
                {p.colors.join() === site.colors.join() && <Check size={14} />}
              </button>
            ))}
          </div>
          <div className="color-fields">
            {site.colors.map((color, i) => (
              <label key={i} className="color-field">
                <input
                  type="color"
                  value={color}
                  onChange={(e) =>
                    patch({
                      colors: site.colors.map((c, j) =>
                        j === i ? e.target.value : c,
                      ),
                    })
                  }
                />
                <span>
                  {t(colorNames[i])}
                  <small>{color.toUpperCase()}</small>
                </span>
              </label>
            ))}
          </div>
          {site.colors
            .slice(0, 1)
            .concat(site.colors.slice(4))
            .some((c) => contrast(c, site.colors[2]) < 4.5) && (
            <p className="contrast-warning">
              <AlertCircle size={15} />
              {t(
                " Eine Textfarbe hat wenig Kontrast zum Hintergrund. Wähle für gut lesbare Texte dunklere Farben oder eine unserer Paletten.",
              )}
            </p>
          )}
        </div>
        <div className="panel-section">
          <h3>{t("Deine Schrift")}</h3>
          <p className="muted small">
            {t("Geräteschriften, ohne externe Downloads.")}
          </p>
          <div className="font-list">
            {fonts.map((f) => (
              <button
                key={f.id}
                onClick={() => patch({ font: f.id })}
                className={site.font === f.id ? "chosen" : ""}
              >
                <span style={{ fontFamily: f.value }}>Aa</span>
                <span>
                  <strong>{t(f.name)}</strong>
                  <small>{t(f.detail)}</small>
                </span>
                {site.font === f.id && <Check size={15} />}
              </button>
            ))}
          </div>
        </div>
      </>
    ) : tab === "layout" ? (
      <>
        <div className="panel-section">
          <span className="eyebrow">{t("ORDNUNG, DIE MAN NICHT SIEHT.")}</span>
          <h3>{t("Dein unsichtbarer Helfer.")}</h3>
          <p className="muted small">
            {t(
              "Ein Raster hält Texte und Bilder auf einer Linie. Oder du platzierst alles ganz frei.",
            )}
          </p>
          <label className="toggle-row">
            <span>
              {t("Am Raster einrasten")}
              <small>{t("Beim Ziehen automatisch ausrichten")}</small>
            </span>
            <input
              type="checkbox"
              checked={site.grid.snap}
              onChange={(e) =>
                patch({ grid: { ...site.grid, snap: e.target.checked } })
              }
            />
          </label>
          <label className="toggle-row">
            <span>
              {t("Raster einblenden")}
              <small>{t("Nur im Editor sichtbar")}</small>
            </span>
            <input
              type="checkbox"
              checked={site.grid.show}
              onChange={(e) =>
                patch({ grid: { ...site.grid, show: e.target.checked } })
              }
            />
          </label>
          <div className="preset-buttons">
            {[4, 6, 12].map((n) => (
              <button
                key={n}
                className={site.grid.columns === n ? "active" : ""}
                onClick={() => patch({ grid: { ...site.grid, columns: n } })}
              >
                {n}
                {t(" Spalten")}
              </button>
            ))}
          </div>
          <Field path={"grid.columns"} label={t("Eigene Spaltenanzahl (1–24)")}>
            <input
              type="number"
              min={1}
              max={24}
              value={site.grid.columns}
              onChange={(e) =>
                patch({
                  grid: {
                    ...site.grid,
                    columns: Math.max(1, Math.min(24, Number(e.target.value))),
                  },
                })
              }
            />
          </Field>
          <Field
            path="grid.gap"
            label={t("Spaltenabstand · ") + site.grid.gap + " px"}
          >
            <input
              type="range"
              min={0}
              max={80}
              value={site.grid.gap}
              onChange={(e) =>
                patch({ grid: { ...site.grid, gap: Number(e.target.value) } })
              }
            />
          </Field>
          <Field
            path="grid.row"
            label={t("Zeilenraster · ") + site.grid.row + " px"}
          >
            <input
              type="range"
              min={4}
              max={100}
              step={4}
              value={site.grid.row}
              onChange={(e) =>
                patch({ grid: { ...site.grid, row: Number(e.target.value) } })
              }
            />
          </Field>
        </div>
        {activeSection && (
          <div className="panel-section">
            <h3>{t("Aktueller Abschnitt")}</h3>
            <Field label={t("Abschnitt auswählen")}>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                {site.sections.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              path={`sections.${site.sections.indexOf(activeSection)}.label`}
              label={t("Name in der Navigation")}
            >
              <input
                data-editor-field={"section-label"}
                value={activeSection.label}
                onChange={(e) =>
                  patch({
                    sections: site.sections.map((s) =>
                      s.id === activeSection.id
                        ? { ...s, label: e.target.value }
                        : s,
                    ),
                  })
                }
              />
            </Field>
            <Field
              path={`sections.${site.sections.indexOf(activeSection)}.height`}
              label={t("Abschnittshöhe (px)")}
            >
              <input
                type="number"
                min={160}
                max={3500}
                step={16}
                value={activeSection.height}
                onChange={(e) =>
                  patch({
                    sections: site.sections.map((s) =>
                      s.id === activeSection.id
                        ? {
                            ...s,
                            height: Math.max(
                              160,
                              Math.min(3500, Number(e.target.value)),
                            ),
                          }
                        : s,
                    ),
                  })
                }
              />
            </Field>
            <button
              className="secondary full"
              onClick={() => {
                const current = draft.current!;
                patch({
                  sections: site.sections.map((s) =>
                    s.id === sectionId
                      ? {
                          ...s,
                          blocks: s.blocks.map((b) =>
                            snapBlock(b, {
                              ...current,
                              grid: { ...current.grid, snap: true },
                            }),
                          ),
                        }
                      : s,
                  ),
                });
                setNotice("Die Elemente sind am Raster ausgerichtet.");
              }}
            >
              <Columns3 size={16} />
              {t("Abschnitt ausrichten")}
            </button>
            <button
              className="text-button danger"
              onClick={() =>
                setRemoveTarget({
                  kind: "canvas",
                  id: activeSection.id,
                  label: activeSection.label,
                })
              }
            >
              <Trash2 size={14} />
              {t("Abschnitt entfernen")}
            </button>
          </div>
        )}
      </>
    ) : tab === "integrations" ? (
      <>
        <div className="panel-section">
          <span className="eyebrow">{t("DEINE WERKZEUGE. AN EINEM ORT.")}</span>
          <h3>{t("Weniger Aufwand. Mehr Verbindung.")}</h3>
          <p className="muted small">
            {t(
              "Buchungen, Berufsprofil und Projekte direkt auf deiner Website.",
            )}
          </p>
        </div>
        <div className="panel-section">
          <div className="integration-title">
            <CalendarDays size={21} />
            <h3>{t("Termine & Berufssoftware")}</h3>
          </div>
          <Field path={"integrations.provider"} label={t("Dein Anbieter")}>
            <select
              value={site.integrations.provider}
              onChange={(e) =>
                updateIntegrations({
                  provider: e.target.value as Site["integrations"]["provider"],
                })
              }
            >
              {providerOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {t(label)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            path="integrations.bookingUrl"
            label={t("Öffentlicher Buchungs- oder Portallink")}
            hint={t(
              "Kopiere den Link aus deinem Anbieterkonto. Der Hauptbutton öffnet diese Adresse.",
            )}
          >
            <input
              type="url"
              placeholder="https://…"
              data-editor-field={"integration-booking"}
              value={site.integrations.bookingUrl}
              onChange={(e) =>
                updateIntegrations({ bookingUrl: e.target.value })
              }
            />
          </Field>
          <div className="inline-info">
            <Link2 size={15} />
            <span>
              {site.integrations.bookingUrl
                ? t(
                    "Buchungslink hinterlegt. Beim Veröffentlichen wird er übernommen.",
                  )
                : t(
                    "Deinen Buchungslink einfügen – schon können Besucher Termine anfragen.",
                  )}
            </span>
          </div>
          <p className="small muted">
            {t(
              "Direkter Zugriff auf Praxis- oder Kanzleidaten benötigt eine vom Anbieter freigeschaltete API. Hier werden keine Patienten- oder Mandantendaten importiert.",
            )}
          </p>
        </div>
        {showGithub && (
          <div className="panel-section">
            <div className="integration-title">
              <Github size={21} />
              <h3>{t("GitHub-Projekte")}</h3>
              <span className="badge">API</span>
            </div>
            <Field
              path="integrations.githubUser"
              label={t("GitHub-Benutzername")}
              hint={t(
                "Alle öffentlichen eigenen Repositories werden importiert, auch über mehrere Seiten.",
              )}
            >
              <input
                data-editor-field={"integration-github"}
                value={site.integrations.githubUser}
                placeholder="z. B. octocat"
                maxLength={39}
                onChange={(e) =>
                  updateIntegrations({ githubUser: e.target.value.trim() })
                }
              />
            </Field>
            <button
              className="secondary full"
              disabled={!site.integrations.githubUser || !!syncing}
              onClick={syncGithub}
            >
              {syncing === "github" ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              {t("Repositories importieren")}
            </button>
            {site.repos.length > 0 && (
              <div className="inline-info">
                <Check size={15} />
                {site.repos.length}
                {t(" Repositories importiert")}
              </div>
            )}
            {site.repos.map((repo) => (
              <div key={repo.id} className="service-edit" data-repo={repo.id}>
                <p className="small">
                  <strong>{repo.name}</strong>
                </p>
                <button
                  className="text-button danger"
                  aria-label={`${repo.name}: ${t("Entfernen")}`}
                  onClick={() =>
                    patch({
                      repos: site.repos.filter((item) => item.id !== repo.id),
                    })
                  }
                >
                  <Trash2 size={13} />
                  {t("Entfernen")}
                </button>
              </div>
            ))}
            <label className="toggle-row">
              <span>{t("Projekte auf Website zeigen")}</span>
              <input
                type="checkbox"
                checked={site.integrations.showRepos}
                onChange={(e) =>
                  updateIntegrations({ showRepos: e.target.checked })
                }
              />
            </label>
          </div>
        )}
        {(site.profession === "developer" ||
          !!site.integrations.appStoreUrl ||
          !!site.integrations.googlePlayUrl) && (
          <div className="panel-section">
            <div className="integration-title">
              <Smartphone size={21} />
              <h3>{t("App Stores")}</h3>
            </div>
            <Field
              path="integrations.appStoreUrl"
              label={t("Dein App-Store-Eintrag")}
              hint={t(
                "Füge den öffentlichen Link zu deiner App im Apple App Store ein.",
              )}
            >
              <input
                type="url"
                placeholder="https://apps.apple.com/…"
                data-editor-field="integration-appstore"
                value={site.integrations.appStoreUrl}
                onChange={(event) =>
                  updateIntegrations({ appStoreUrl: event.target.value.trim() })
                }
              />
            </Field>
            <Field
              path="integrations.googlePlayUrl"
              label={t("Dein Google-Play-Eintrag")}
              hint={t(
                "Füge den öffentlichen Link zu deiner App im Google Play Store ein.",
              )}
            >
              <input
                type="url"
                placeholder="https://play.google.com/store/apps/details?id=…"
                data-editor-field="integration-googleplay"
                value={site.integrations.googlePlayUrl}
                onChange={(event) =>
                  updateIntegrations({
                    googlePlayUrl: event.target.value.trim(),
                  })
                }
              />
            </Field>
          </div>
        )}
        <div className="panel-section">
          <div className="integration-title">
            <Linkedin size={21} />
            <h3>LinkedIn</h3>
          </div>
          <Field
            path="integrations.linkedinUrl"
            label={t("Dein öffentliches LinkedIn-Profil")}
          >
            <input
              type="url"
              placeholder="https://www.linkedin.com/in/…"
              data-editor-field={"integration-linkedin"}
              value={site.integrations.linkedinUrl}
              onChange={(e) =>
                updateIntegrations({ linkedinUrl: e.target.value })
              }
            />
          </Field>
          {integrationStatus.linkedin ? (
            <>
              <a
                className="secondary full"
                href={API + "/api/linkedin/start"}
                onClick={(e) => {
                  e.preventDefault();
                  save()
                    .then(() => {
                      window.location.href = API + "/api/linkedin/start";
                    })
                    .catch((e) => setError(e.message));
                }}
              >
                {t("Mit LinkedIn verbinden ")}
                <ArrowUpRight size={15} />
              </a>
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    const generation = integrationGeneration.current;
                    const { profile } = await api("/linkedin/profile");
                    if (generation !== integrationGeneration.current) return;
                    if (profile?.name) {
                      patch({ name: profile.name });
                      setNotice("Dein Name wurde aus LinkedIn übernommen.");
                    } else setNotice("Bitte zuerst mit LinkedIn verbinden.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {t("Profilnamen übernehmen")}
              </button>
            </>
          ) : (
            <div className="inline-info">
              <LockKeyhole size={15} />
              <span>
                {t(
                  "Profillink sofort nutzbar. Profilimport nach Einrichtung einer LinkedIn-App auf dem Server.",
                )}
              </span>
            </div>
          )}
        </div>
        <div className="panel-section">
          <div className="integration-title">
            <Code2 size={21} />
            <h3>{t("Eigene Berufssoftware")}</h3>
          </div>
          <p className="muted small">
            {t(
              "Importiere öffentliche Leistungsbeschreibungen über eine serverseitig konfigurierte API-Brücke.",
            )}
          </p>
          <button
            className="secondary full"
            disabled={!integrationStatus.business || !!syncing}
            onClick={async () => {
              const generation = integrationGeneration.current;
              setSyncing("business");
              try {
                const data = await api("/business/import", {});
                if (generation !== integrationGeneration.current) return;
                if (draft.current) patch({ services: data.services });
                setNotice("Leistungen aus der Berufssoftware importiert.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSyncing("");
              }
            }}
          >
            {t("Leistungen importieren ")}
            <Download size={15} />
          </button>
          <p className="small muted">
            {integrationStatus.business
              ? t("API auf dem Server eingerichtet.")
              : t(
                  "Einrichtung: BUSINESS_API_URL und optional BUSINESS_API_TOKEN in der Serverumgebung. Details im README.",
                )}
          </p>
        </div>
      </>
    ) : (
      <>
        <div className="panel-section">
          <h3>{t("Deine Websites")}</h3>
          <p className="muted small">
            {t(
              "Jede Website hat ihren eigenen Entwurf, ihre eigenen Versionen und ihre eigene Adresse. Die Adresse legst du beim Veröffentlichen fest.",
            )}
          </p>
          <Field label={t("Website bearbeiten")}>
            <select
              value={siteId}
              disabled={siteBusy}
              data-editor-field="site-switch"
              onChange={(event) => switchSite(event.currentTarget.value)}
            >
              {siteOptions}
            </select>
          </Field>
          <button
            className="secondary full"
            disabled={siteBusy}
            onClick={createNewSite}
          >
            <Plus size={16} />
            {t("Neue Website anlegen")}
          </button>
          <button
            className="text-button"
            disabled={siteBusy || sites.length < 2}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={15} />
            {t("Diese Website löschen")}
          </button>
          {sites.length < 2 && (
            <p className="muted small">
              {t("Die letzte Website kann nicht gelöscht werden.")}
            </p>
          )}
        </div>
        <div className="panel-section">
          <span className="eyebrow">{t("ALLES GUT AUFGEHOBEN.")}</span>
          <h3>{t("Deine Website verwalten.")}</h3>
          <Field
            path="domain"
            label={t("Eigene Domain")}
            hint={t(
              "Zum Beispiel meine-domain.at. Die Domain wird mit dem Entwurf veröffentlicht und für Website-Links verwendet. DNS, HTTPS und die Weiterleitung auf diesen Server müssen beim Hosting eingerichtet sein.",
            )}
          >
            <input
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="meine-domain.at"
              value={site.domain}
              data-editor-field="domain"
              onChange={(event) => patch({ domain: event.target.value })}
            />
          </Field>
          <Field path={"language"} label={t("Sprache der Website")}>
            <select
              value={site.language}
              onChange={(event) =>
                patch({ language: event.currentTarget.value as "de" | "en" })
              }
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </Field>
          <div className="storage-card">
            <ShieldCheck size={22} />
            <span>
              <strong>{t("SQLite auf deinem Server")}</strong>
              <small>{t("Entwurf und Veröffentlichung getrennt")}</small>
            </span>
          </div>
          <Field
            label={t("Zieladresse für HTML-Export")}
            hint={t(
              "Die spätere Webadresse einschließlich Unterordner, z. B. https://example.at/iris/. Leer verwendet die eigene Domain.",
            )}
          >
            <input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://example.at/iris/"
              value={exportUrl}
              onChange={(event) => setExportUrl(event.target.value)}
            />
          </Field>
          <button
            className="secondary full"
            onClick={downloadHtml}
            disabled={exportBusy}
            aria-busy={exportBusy}
          >
            <Download size={16} />
            {t(
              exportBusy
                ? "HTML-Export wird erstellt …"
                : "Website als HTML-ZIP exportieren",
            )}
          </button>
          <p className="hint">
            {t(
              "Exportiert den aktuellen Entwurf mit Bildern, Impressum und Datenschutz. Nach Änderungen erneut exportieren und hochladen. Externe Bilder bleiben verlinkt.",
            )}
          </p>
          <button className="secondary full" onClick={download}>
            <Download size={16} />
            {t("Website als JSON sichern")}
          </button>
          <button
            className="text-button"
            onClick={() => importInput.current?.click()}
          >
            <Upload size={15} />
            {t("JSON-Sicherung laden")}
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 10 * 1024 * 1024)
                  throw new Error("Die Sicherung ist zu groß.");
                const next = siteSchema.parse(JSON.parse(await file.text()));
                if (
                  window.confirm(
                    t(
                      "Den Entwurf der Website „{name}“ durch diese Sicherung ersetzen? Die Adresse der Website bleibt, wie sie ist.",
                      { name: site.name || t("Ohne Namen") },
                    ),
                  )
                ) {
                  change(next);
                  setSelected(null);
                  setSectionId(next.sections[0]?.id || "");
                  setNotice("Sicherung als Entwurf geladen.");
                }
                setError("");
              } catch (error) {
                if (error instanceof ZodError)
                  setError(
                    t("Die Sicherung enthält ungültige Angaben:") +
                      "\n" +
                      error.issues
                        .map((issue) => {
                          const item = describeIssue(issue, t);
                          return `${item.label}: ${item.message}`;
                        })
                        .join("\n"),
                  );
                else if (error instanceof SyntaxError)
                  setError(
                    t(
                      "Die Datei enthält kein gültiges JSON. Bitte eine unveränderte JSON-Sicherung auswählen.",
                    ),
                  );
                else
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Diese Datei ist keine gültige Klarwarg-Sicherung.",
                  );
              }
              e.target.value = "";
            }}
          />
        </div>
        <details className="panel-section">
          <summary>
            {t("Impressum & Datenschutz")}
            <ChevronDown size={14} />
          </summary>
          <div className="details-content">
            <p className="muted small">
              {t(
                "Trage hier die für deinen Betrieb passenden Angaben ein. Sie werden im Footer verlinkt.",
              )}
            </p>
            <Field path={"legal.imprint"} label={t("Impressum")}>
              <textarea
                rows={7}
                data-editor-field={"legal-imprint"}
                value={site.legal.imprint}
                onChange={(e) =>
                  patch({ legal: { ...site.legal, imprint: e.target.value } })
                }
              />
            </Field>
            <Field path={"legal.privacy"} label={t("Datenschutzerklärung")}>
              <textarea
                rows={7}
                data-editor-field={"legal-privacy"}
                value={site.legal.privacy}
                onChange={(e) =>
                  patch({ legal: { ...site.legal, privacy: e.target.value } })
                }
              />
            </Field>
          </div>
        </details>
        <div className="panel-section">
          <h3>{t("Veröffentlichte Versionen")}</h3>
          <p className="muted small">
            {t("Die letzten 20 Stände bleiben erhalten.")}
          </p>
          <button
            className="text-button"
            onClick={() =>
              api("/versions" + siteQuery)
                .then((data) => setVersions(data.versions))
                .catch((e) => setError(e.message))
            }
          >
            <RefreshCw size={14} />
            {t("Versionen laden")}
          </button>
          {versions.map((v) => (
            <div className="version-row" key={v.id}>
              <span>
                {new Date(v.created).toLocaleString(
                  language === "de" ? "de-AT" : "en-GB",
                )}
              </span>
              <button
                className="tiny-button"
                aria-label={t("Version als Entwurf wiederherstellen")}
                onClick={async () => {
                  if (
                    !window.confirm(
                      t(
                        "Diesen veröffentlichten Stand als Entwurf wiederherstellen?",
                      ),
                    )
                  )
                    return;
                  try {
                    await save();
                    const data = await api(
                      "/restore/" + encodeURIComponent(v.id) + siteQuery,
                      {},
                    );
                    revision.current = data.revision;
                    saved.current = JSON.stringify(data.site);
                    change(data.site);
                    setSelected(null);
                    setSectionId(data.site.sections[0]?.id || "");
                    setNotice("Version als Entwurf wiederhergestellt.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Undo2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <details className="panel-section">
          <summary>
            {t("Passwort ändern")}
            <ChevronDown size={14} />
          </summary>
          <form
            className="details-content"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/password", {
                  current: currentPassword,
                  password: newPassword,
                });
                setCurrentPassword("");
                setNewPassword("");
                setNotice(
                  "Passwort geändert. Andere Sitzungen wurden abgemeldet.",
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Field label={t("Bisheriges Passwort")}>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>
            <Field label={t("Neues Passwort (mind. 12 Zeichen)")}>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Field>
            <button className="secondary full">
              {t("Passwort speichern")}
            </button>
          </form>
        </details>
        <div className="panel-section">
          <h3>{t("Quellcode")}</h3>
          <p className="muted small">
            {t(
              "Klarwarg ist freie Software unter der GNU Affero General Public License 3.0.",
            )}
          </p>
          <a
            className="text-button"
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={14} />
            {t("Quellcode ansehen")}
          </a>
        </div>
        <button
          className="text-button logout"
          onClick={async () => {
            try {
              await save();
              await api("/logout", {});
              onLogout();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <LogOut size={16} />
          {t("Abmelden")}
        </button>
      </>
    );
  return (
    <FieldErrors.Provider value={fieldErrors}>
      <div className={"builder " + (preview ? "preview-mode" : "")}>
        <a className="skip-link" href="#workspace">
          {t("Zum Editor springen")}
        </a>
        <header className="app-header">
          <a className="wordmark" href="/admin" aria-label="Klarwarg">
            <span className="brand-mark klarwarg-mark">
              <BrandLogo size={34} />
            </span>
            klarwarg<span className="brand-dot">.</span>
          </a>
          <span className="header-divider" />
          <span className="project-name">
            <select
              className="site-switcher"
              aria-label={t("Website wählen")}
              value={siteId}
              disabled={siteBusy}
              onChange={(event) => switchSite(event.currentTarget.value)}
            >
              {siteOptions}
            </select>
            <span className="project-badge">{t(currentCareer.name)}</span>
          </span>
          <div className="header-actions">
            <LanguageSwitch />
            <span
              className={"save-status " + (error ? "has-error" : "")}
              aria-live="polite"
            >
              {status === "Wird gespeichert …" ? (
                <LoaderCircle size={14} className="spin" />
              ) : error ? (
                <AlertCircle size={14} />
              ) : (
                <Check size={14} />
              )}
              <span>{t(status)}</span>
            </span>
            <button
              className="secondary preview-button"
              aria-label={preview ? t("Zurück zum Editor") : t("Vorschau")}
              title={preview ? t("Zurück zum Editor") : t("Vorschau")}
              onClick={() => setPreview(!preview)}
            >
              <Monitor size={16} />
              <span className="header-action-label">
                {preview ? t("Zurück zum Editor") : t("Vorschau")}
              </span>
            </button>
            <button
              className="primary publish-button"
              aria-label={
                publishing ? t("Veröffentlicht …") : t("Veröffentlichen")
              }
              title={t("Veröffentlichen")}
              onClick={openPublish}
              disabled={publishing}
            >
              <Globe size={16} />
              <span className="header-action-label">
                {publishing ? t("Veröffentlicht …") : t("Veröffentlichen")}
              </span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </header>
        <div className="app-body">
          {!preview && (
            <>
              <nav className="tool-rail" aria-label={t("Editor-Werkzeuge")}>
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    className={tab === item.id && showPanel ? "active" : ""}
                    onClick={() => {
                      setTab(item.id);
                      setShowPanel(true);
                    }}
                    aria-pressed={tab === item.id && showPanel}
                  >
                    <item.icon size={21} />
                    <span>{t(item.label)}</span>
                  </button>
                ))}
                <button className="help-button" onClick={() => setHelp(true)}>
                  <CircleHelp size={21} />
                  <span>{t("Kurze Hilfe")}</span>
                </button>
                <div className="avatar" aria-label="Admin">
                  A
                </div>
              </nav>
              {showPanel && (
                <aside className="left-panel">
                  <div className="panel-title">
                    <h2>
                      {t(tabs.find((item) => item.id === tab)?.label || "")}
                    </h2>
                    <button
                      className="icon-button panel-close"
                      onClick={() => setShowPanel(false)}
                      aria-label={t("Werkzeuge einklappen")}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <div className="panel-scroll">
                    {panelContent}
                    <div className="panel-tip">
                      <Sparkles size={17} />
                      <div>
                        <strong>{t("Du kannst nichts kaputtmachen.")}</strong>
                        <p>
                          {t(
                            "Mit dem Zurück-Pfeil nimmst du Änderungen einfach wieder zurück.",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </aside>
              )}
            </>
          )}
          <main className="workspace" id="workspace">
            <div className="workspace-top">
              <div>
                <div className="workspace-heading">
                  <h1>
                    {preview
                      ? t("So sieht deine Website aus.")
                      : t("Deine Website. Dein Anfang.")}
                  </h1>
                  <span className="draft-tag">
                    {preview ? t("Vorschau") : t("Entwurf")}
                  </span>
                </div>
                <p>
                  {preview
                    ? t("Teste deinen Auftritt auf Desktop und Handy.")
                    : t("Klicke ein Element an und mach es zu deinem.")}
                </p>
              </div>
              <div className="workspace-tools">
                <div className="device-switch" aria-label={t("Vorschaugröße")}>
                  <button
                    className={!mobile ? "active" : ""}
                    aria-label={t("Desktop-Vorschau")}
                    aria-pressed={!mobile}
                    onClick={() => setMobile(false)}
                  >
                    <Monitor size={17} />
                  </button>
                  <button
                    className={mobile ? "active" : ""}
                    aria-label={t("Handy-Vorschau")}
                    aria-pressed={mobile}
                    onClick={() => setMobile(true)}
                  >
                    <Smartphone size={17} />
                  </button>
                </div>
                {!preview && (
                  <>
                    <div className="undo-tools">
                      <button
                        className="icon-button"
                        disabled={!historyCount[0]}
                        onClick={() => travel("undo")}
                        aria-label={t("Rückgängig")}
                      >
                        <Undo2 size={18} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={!historyCount[1]}
                        onClick={() => travel("redo")}
                        aria-label={t("Wiederholen")}
                      >
                        <Redo2 size={18} />
                      </button>
                    </div>
                    <button
                      className="icon-button inspector-toggle"
                      onClick={() => setInspectorOpen(!inspectorOpen)}
                      aria-label={t("Elementeigenschaften umschalten")}
                    >
                      <Settings2 size={18} />
                    </button>
                  </>
                )}
              </div>
            </div>
            {!preview && finishCount < 3 && (
              <div className="start-strip">
                <span className="start-spark">
                  <Sparkles size={17} />
                </span>
                <div>
                  <strong>
                    {t("In wenigen Schritten zu deinem Auftritt")}
                  </strong>
                  <span>
                    {t(
                      "Deine Vorlage ist bereit. Jetzt kommt deine persönliche Note.",
                    )}
                  </span>
                </div>
                <span className="progress-count">
                  {finishCount}
                  {t(" von 3")}
                </span>
                <div className="progress-track">
                  <i style={{ width: `${(finishCount / 3) * 100}%` }} />
                </div>
                <button
                  onClick={() => {
                    setHelp(true);
                  }}
                  aria-label={t("Erste Schritte anzeigen")}
                >
                  <ArrowRight size={17} />
                </button>
              </div>
            )}
            {describedIssues.length > 0 && (
              <div className="error-banner" role="alert">
                <AlertCircle size={17} />
                <div>
                  <strong>{t(validationNotice)}</strong>
                  <ul>
                    {describedIssues.map((issue, index) => (
                      <li key={issue.key + index}>
                        <button
                          className="text-button"
                          onClick={() => showInvalidField(issue.key)}
                        >
                          {issue.label}
                        </button>
                        {": "}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {error &&
              !(describedIssues.length > 0 && error === validationNotice) && (
                <div className="error-banner" role="alert">
                  <AlertCircle size={17} />
                  <span style={{ whiteSpace: "pre-line" }}>{t(error)}</span>
                  <button
                    onClick={() => save().catch((e) => setError(e.message))}
                  >
                    {t("Erneut speichern")}
                  </button>
                  <button
                    onClick={() => setError("")}
                    aria-label={t("Fehlermeldung schließen")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            <div className="canvas-toolbar">
              <span>
                <span className="browser-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <LockKeyhole size={12} />
                {site.domain ||
                  site.name
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, "-")
                    .replace(/-+/g, "-") + ".de"}{" "}
                {!site.domain && (
                  <span className="example-domain">
                    {t("· Beispieladresse")}
                  </span>
                )}
              </span>
              <span>
                {mobile ? t("Handy") : t("Desktop")}
                <ChevronDown size={12} />
              </span>
            </div>
            <div className="stage" ref={stage}>
              <div
                className={"paper-wrap " + (mobile ? "phone-paper" : "")}
                style={{ width: paperWidth * scale }}
              >
                <div
                  className="paper"
                  style={
                    {
                      width: paperWidth,
                      zoom: Math.max(0.12, scale),
                    } as CSSProperties
                  }
                >
                  <SiteSurface
                    site={site}
                    editing={!preview}
                    selected={selected}
                    onSelect={(selection) => {
                      setSelected(selection);
                      if (selection) setSectionId(selection.section);
                    }}
                    onMove={moveBlock}
                    mobile={mobile}
                    onOverflow={reportOverflow}
                    overflowing={overflowing}
                    onEditField={(field, section) => {
                      if (section) setSectionId(section);
                      editField(field);
                    }}
                    onTextEdit={editBlock}
                  />
                </div>
              </div>
            </div>
            <div className="workspace-bottom">
              <span>
                <MousePointer2 size={14} />
                {preview
                  ? t("Deine Besucher sehen nur die veröffentlichte Version.")
                  : mobile
                    ? t(
                        "Handyvorschau · Positionen werden auf kleinen Displays gestapelt.",
                      )
                    : t("Anklicken zum Bearbeiten · Ziehen zum Verschieben")}
              </span>
              <button
                className="zoom-indicator"
                onClick={() => setMobile(!mobile)}
              >
                <ZoomIn size={14} />
                {Math.round(scale * 100)} %<ChevronDown size={12} />
              </button>
            </div>
          </main>
          {!preview && inspectorOpen && (
            <aside className="inspector">
              <div className="panel-title">
                <h2>{t("Element bearbeiten")}</h2>
                <button
                  className="icon-button"
                  onClick={() => setInspectorOpen(false)}
                  aria-label={t("Eigenschaften schließen")}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="panel-scroll">
                {block ? (
                  <>
                    <div className="panel-section">
                      <div className="selected-type">
                        {block.kind === "image" ? (
                          <ImagePlus size={20} />
                        ) : block.kind === "button" ? (
                          <MousePointer2 size={20} />
                        ) : (
                          <Type size={20} />
                        )}
                        <span>
                          {block.kind === "image"
                            ? t("Bild")
                            : block.kind === "heading"
                              ? t("Überschrift")
                              : block.kind === "button"
                                ? t("Button")
                                : block.kind === "eyebrow"
                                  ? t("Kleine Überschrift")
                                  : t("Text")}
                        </span>
                        <span className="selected-dot" />
                      </div>
                      {block.kind !== "image" ? (
                        <>
                          <label
                            className="inspector-label"
                            htmlFor="block-text"
                          >
                            {block.kind === "button"
                              ? t("Beschriftung")
                              : t("Dein Text")}
                          </label>
                          <textarea
                            aria-invalid={
                              fieldErrors[blockPath + ".text"]
                                ? true
                                : undefined
                            }
                            aria-describedby={
                              fieldErrors[blockPath + ".text"]
                                ? "block-text-error"
                                : undefined
                            }
                            id="block-text"
                            data-editor-field="block-text"
                            data-validation-path={blockPath + ".text"}
                            className="block-text"
                            rows={block.kind === "button" ? 2 : 5}
                            value={block.text}
                            onChange={(e) =>
                              mutateBlock({ text: e.target.value })
                            }
                          />
                          {fieldErrors[blockPath + ".text"] && (
                            <small id="block-text-error" role="alert">
                              {fieldErrors[blockPath + ".text"]}
                            </small>
                          )}
                          <span className="input-note">
                            {block.text.includes(namePlaceholder)
                              ? t("{placeholder} wird zu „{name}“.", {
                                  placeholder: namePlaceholder,
                                  name: site.name,
                                })
                              : t("Änderungen siehst du sofort.")}
                          </span>
                          {needed && selected && (
                            <p className="contrast-warning overflow-warning">
                              <AlertCircle size={15} />
                              <span>
                                {t(
                                  "Der Text ist länger als sein Kasten und überdeckt sonst, was darunter steht.",
                                )}{" "}
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    fitBlock(selected.section, block.id, needed)
                                  }
                                >
                                  {t("Kasten anpassen")}
                                </button>
                              </span>
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="image-thumb">
                            {block.src && (
                              <img
                                src={
                                  block.src.startsWith("/uploads/")
                                    ? API + block.src
                                    : block.src
                                }
                                alt={block.alt}
                              />
                            )}
                          </div>
                          <button
                            className="secondary full"
                            data-editor-field="block-image"
                            onClick={() => uploadInput.current?.click()}
                            disabled={syncing === "upload"}
                          >
                            {syncing === "upload" ? (
                              <LoaderCircle size={16} className="spin" />
                            ) : (
                              <Upload size={16} />
                            )}
                            {t("Eigenes Bild hochladen")}
                          </button>
                          <input
                            ref={uploadInput}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            hidden
                            onChange={(e) => {
                              upload(e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                          <p className="small muted">
                            {t("PNG, JPG oder WebP bis 30 MB · GIF bis 8 MB")}
                          </p>
                          <Field
                            path={blockPath + ".imageShape"}
                            label={t("Bildform")}
                          >
                            <select
                              value={block.imageShape}
                              onChange={(event) =>
                                mutateBlock({
                                  imageShape: event.target
                                    .value as Block["imageShape"],
                                })
                              }
                            >
                              {imageShapes.map((shape) => (
                                <option key={shape.id} value={shape.id}>
                                  {t(shape.label)}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field
                            path={blockPath + ".alt"}
                            label={t("Bildbeschreibung")}
                            hint={t(
                              "Beschreibe kurz den Inhalt für Menschen, die das Bild nicht sehen können.",
                            )}
                          >
                            <input
                              value={block.alt}
                              onChange={(e) =>
                                mutateBlock({ alt: e.target.value })
                              }
                            />
                          </Field>
                        </>
                      )}
                      {block.kind === "button" && (
                        <Field
                          path={blockPath + ".href"}
                          label={t("Ziel des Buttons")}
                          hint={t("HTTPS-Adresse, #kontakt, mailto: oder tel:")}
                        >
                          <input
                            value={block.href}
                            onChange={(e) =>
                              mutateBlock({ href: e.target.value })
                            }
                          />
                        </Field>
                      )}
                      {block.kind === "button" &&
                        selected?.section === "start" &&
                        site.integrations.bookingUrl && (
                          <p className="small muted">
                            {t(
                              "Dieser Startseiten-Button verwendet deinen Buchungslink aus „Anbindungen“.",
                            )}
                          </p>
                        )}
                      {block.kind !== "image" && (
                        <Field
                          path={blockPath + ".fontSize"}
                          label={t("Schriftgröße")}
                        >
                          <div className="size-field">
                            <input
                              aria-label={t("Schriftgröße in Pixeln")}
                              type="number"
                              min={12}
                              max={96}
                              value={block.fontSize}
                              onChange={(e) =>
                                mutateBlock({
                                  fontSize: Math.max(
                                    12,
                                    Math.min(96, Number(e.target.value)),
                                  ),
                                })
                              }
                            />
                            <span>px</span>
                          </div>
                        </Field>
                      )}
                    </div>
                    <div className="panel-section">
                      <div className="section-heading">
                        <h3>{t("Position & Größe")}</h3>
                        <Move size={15} />
                      </div>
                      <p className="small muted">
                        {t("Auf einer 1200 px breiten Arbeitsfläche.")}
                      </p>
                      <div className="coordinate-grid">
                        {(["x", "y", "w", "h"] as const).map((key, i) => (
                          <Field
                            key={key}
                            path={blockPath + "." + key}
                            label={
                              [
                                t("X · horizontal"),
                                t("Y · vertikal"),
                                t("Breite"),
                                t("Höhe"),
                              ][i]
                            }
                          >
                            <input
                              type="number"
                              step={1}
                              min={key === "w" ? 60 : key === "h" ? 30 : 0}
                              max={
                                key === "y" ? 3000 : key === "h" ? 1500 : 1200
                              }
                              value={Math.round(block[key])}
                              onChange={(e) => {
                                const min =
                                    key === "w" ? 60 : key === "h" ? 30 : 0,
                                  max =
                                    key === "y"
                                      ? 3000
                                      : key === "h"
                                        ? 1500
                                        : 1200;
                                mutateBlock({
                                  [key]: Math.max(
                                    min,
                                    Math.min(max, Number(e.target.value)),
                                  ),
                                });
                              }}
                            />
                          </Field>
                        ))}
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          mutateBlock(
                            snapBlock(block, {
                              ...site,
                              grid: { ...site.grid, snap: true },
                            }),
                          );
                          setNotice("Element am Raster ausgerichtet.");
                        }}
                      >
                        <Columns3 size={14} />
                        {t("Am Raster ausrichten")}
                      </button>
                      <label className="toggle-row compact">
                        <span>{t("Einrasten aktiv")}</span>
                        <input
                          type="checkbox"
                          checked={site.grid.snap}
                          onChange={(e) =>
                            patch({
                              grid: { ...site.grid, snap: e.target.checked },
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="panel-section">
                      <Field
                        path={`sections.${site.sections.findIndex((s) => s.id === selected?.section)}.label`}
                        label={t("Name des Abschnitts")}
                      >
                        <input
                          value={
                            site.sections.find(
                              (s) => s.id === selected?.section,
                            )?.label || ""
                          }
                          onChange={(e) =>
                            patch({
                              sections: site.sections.map((s) =>
                                s.id === selected?.section
                                  ? { ...s, label: e.target.value }
                                  : s,
                              ),
                            })
                          }
                        />
                      </Field>
                      <div className="element-actions">
                        <button
                          className="secondary"
                          onClick={() => {
                            if (!selected) return;
                            const copy = {
                              ...block,
                              id: uid(),
                              x: Math.min(1200 - block.w, block.x + 24),
                              y: block.y + 24,
                            };
                            patch({
                              sections: site.sections.map((s) =>
                                s.id === selected.section
                                  ? {
                                      ...s,
                                      height: Math.max(
                                        s.height,
                                        copy.y + copy.h + 32,
                                      ),
                                      blocks: [...s.blocks, copy],
                                    }
                                  : s,
                              ),
                            });
                            select({
                              section: selected.section,
                              block: copy.id,
                            });
                          }}
                        >
                          <Copy size={14} />
                          {t("Duplizieren")}
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={() => {
                            patch({
                              sections: site.sections.map((s) =>
                                s.id === selected?.section
                                  ? {
                                      ...s,
                                      blocks: s.blocks.filter(
                                        (b) => b.id !== block.id,
                                      ),
                                    }
                                  : s,
                              ),
                            });
                            setSelected(null);
                          }}
                          aria-label={t("Element löschen")}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-inspector">
                    <MousePointer2 size={32} />
                    <h3>{t("Was möchtest du ändern?")}</h3>
                    <p>
                      {t(
                        "Klicke auf einen Text, ein Bild oder einen Button in deiner Website.",
                      )}
                    </p>
                  </div>
                )}
                <div className="inspector-hint">
                  <Leaf size={20} />
                  <strong>{t("Weniger ist oft mehr.")}</strong>
                  <p>
                    {t(
                      "Ein klarer Text und ein gutes Bild sind ein wunderbarer Anfang.",
                    )}
                  </p>
                </div>
              </div>
            </aside>
          )}
        </div>
        {notice && (
          <div className="toast" role="status">
            <Check size={17} />
            {t(notice)}
            <button
              onClick={() => setNotice("")}
              aria-label={t("Hinweis schließen")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {templates && (
          <Modal
            title={t("Ein guter Start für deinen Beruf.")}
            wide
            onClose={closeTemplates}
          >
            <p className="modal-subtitle">
              {t(
                "Wähle eine Vorlage. Farben, Texte und Bilder kannst du danach frei anpassen.",
              )}
            </p>
            <div className="template-grid">
              {careers.map((c) => (
                <button
                  key={c.id}
                  className={
                    "template-card " +
                    ((templateChoice ?? site.profession) === c.id
                      ? "chosen"
                      : "")
                  }
                  aria-pressed={(templateChoice ?? site.profession) === c.id}
                  disabled={templateBusy}
                  onClick={() => {
                    setTemplateChoice(c.id);
                    setTemplateError("");
                  }}
                >
                  <span className="career-symbol">{c.symbol}</span>
                  <small>{t(c.category)}</small>
                  <strong>{t(c.name)}</strong>
                  <span>
                    {t("Vorlage verwenden ")}
                    <ArrowRight size={14} />
                  </span>
                  {(templateChoice ?? site.profession) === c.id && (
                    <Check className="template-check" size={17} />
                  )}
                </button>
              ))}
            </div>

            {templateChoice && (
              <div className="template-confirmation">
                <h2>
                  {t(
                    careers.find((career) => career.id === templateChoice)!
                      .name,
                  )}
                </h2>
                <p>
                  {t(
                    "Diese Vorlage ersetzt deinen aktuellen Entwurf. Du kannst die Änderung mit „Rückgängig“ zurücknehmen. Fortfahren?",
                  )}
                </p>
                {templateError && (
                  <p className="error-message" role="alert">
                    {t(templateError)}
                  </p>
                )}
                <div className="template-confirmation-actions">
                  <button
                    className="secondary"
                    disabled={templateBusy}
                    onClick={closeTemplates}
                  >
                    {t("Abbrechen")}
                  </button>
                  <button
                    className="primary"
                    disabled={templateBusy}
                    onClick={applyTemplate}
                  >
                    {templateBusy && (
                      <LoaderCircle size={16} className="spin" />
                    )}
                    {t(
                      templateBusy ? "Wird gespeichert …" : "Entwurf ersetzen",
                    )}
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}
        {help && (
          <Modal
            title={t("Deine Website in drei Schritten.")}
            onClose={() => setHelp(false)}
          >
            <p className="modal-subtitle">
              {t("Die Vorlage ist dein Anfang. Du machst den Rest persönlich.")}
            </p>
            <ol className="help-steps">
              <li>
                <span>1</span>
                <div>
                  <strong>{t("Mach sie zu deiner.")}</strong>
                  <p>
                    {t(
                      "Unter „Inhalte“ wählst du deinen Beruf und änderst deinen Namen. Klicke Texte oder Bilder direkt in der Vorschau an.",
                    )}
                  </p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>{t("Gib ihr deinen Stil.")}</strong>
                  <p>
                    {t(
                      "Sechs Farben und deine Schrift findest du unter „Design“. Ziehe Elemente an ihren Platz. Das Raster hilft beim Ausrichten.",
                    )}
                  </p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>{t("Bereit für deine Besucher.")}</strong>
                  <p>
                    {t(
                      "Ergänze Kontakt und Anbieterlinks. Prüfe die Handyvorschau und klicke auf „Veröffentlichen“.",
                    )}
                  </p>
                </div>
              </li>
            </ol>
            <div className="keyboard-help">
              <span>
                <kbd>⌘ / Ctrl</kbd> + <kbd>S</kbd>
                {t(" speichern")}
              </span>
              <span>
                <kbd>⌘ / Ctrl</kbd> + <kbd>Z</kbd>
                {t(" rückgängig")}
              </span>
              <span>
                <kbd>↑ ↓ ← →</kbd>
                {t(" Element verschieben")}
              </span>
            </div>
            <button className="primary full" onClick={() => setHelp(false)}>
              {t("Los geht’s ")}
              <ArrowRight size={17} />
            </button>
          </Modal>
        )}
        {removeTarget && (
          <Modal
            title={t("Bereich entfernen?")}
            onClose={() => setRemoveTarget(null)}
          >
            <p>
              {t(
                "Den Bereich „{label}“ aus der Website entfernen? Die Änderung wird erst beim Veröffentlichen öffentlich sichtbar und kann rückgängig gemacht werden.",
                { label: removeTarget.label },
              )}
            </p>
            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => setRemoveTarget(null)}
              >
                {t("Abbrechen")}
              </button>
              <button className="primary" onClick={removeSection}>
                {t("Bereich entfernen")}
              </button>
            </div>
          </Modal>
        )}
        {deleteOpen && (
          <Modal
            title={t("Website „{name}“ löschen?", {
              name: site.name || t("Ohne Namen"),
            })}
            onClose={() => !siteBusy && setDeleteOpen(false)}
          >
            <p className="modal-subtitle">
              {t(
                "Entwurf, veröffentlichte Website und alle gesicherten Versionen dieser Website werden gelöscht, ihre Adresse wird frei. Hochgeladene Bilder bleiben auf dem Server. Sichere die Website vorher als JSON, wenn du sie behalten willst.",
              )}
            </p>
            {error && (
              <p role="alert" className="error-message">
                {t(error)}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="secondary"
                disabled={siteBusy}
                onClick={() => setDeleteOpen(false)}
              >
                {t("Abbrechen")}
              </button>
              <button
                className="primary"
                disabled={siteBusy}
                onClick={deleteThisSite}
              >
                {t("Website löschen")}
              </button>
            </div>
          </Modal>
        )}
        {publishOpen && (
          <Modal
            title={
              publishedAt
                ? t("Deine Änderungen veröffentlichen.")
                : t("Dein Auftritt kann beginnen.")
            }
            onClose={() => setPublishOpen(false)}
          >
            <div className="publish-illustration">
              <Globe size={48} />
              <span>
                <Check size={20} />
              </span>
            </div>
            <p className="modal-subtitle">
              {t(
                "Dein gespeicherter Entwurf wird zur sichtbaren Website. Die bisherige Version bleibt als Sicherung erhalten.",
              )}
            </p>
            <ul className="publish-checks">
              <li>
                <Check size={17} />
                {t("Desktop- und Handyansicht sind verfügbar.")}
              </li>
              <li>
                {site.contact.email || site.contact.phone ? (
                  <Check size={17} />
                ) : (
                  <AlertCircle size={17} />
                )}{" "}
                {site.contact.email || site.contact.phone
                  ? t("Kontaktdaten sind hinterlegt.")
                  : t("Kontaktdaten sind noch nicht ergänzt.")}
              </li>
              <li>
                {site.legal.imprint.trim() && site.legal.privacy.trim() ? (
                  <Check size={17} />
                ) : (
                  <AlertCircle size={17} />
                )}{" "}
                {site.legal.imprint.trim() && site.legal.privacy.trim()
                  ? t("Impressum und Datenschutz sind hinterlegt.")
                  : t(
                      "Impressum oder Datenschutz fehlen noch. Ohne beides geht die Website nicht online (Einstellungen → Impressum & Datenschutz).",
                    )}
              </li>
            </ul>
            <FieldErrors.Provider
              value={publishPathError ? { sitePath: publishPathError } : {}}
            >
              <Field
                path="sitePath"
                label={t("Adresse der Website")}
                hint={t(
                  "Leer lassen für die Startseite. Änderst du die Adresse später, leitet die alte automatisch auf die neue weiter.",
                )}
              >
                <div className="site-path-input">
                  <span aria-hidden="true">
                    {(site.domain || window.location.origin).replace(
                      /^https?:\/\//,
                      "",
                    )}
                    /
                  </span>
                  <input
                    type="text"
                    autoCapitalize="none"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={maxSitePathLength}
                    placeholder={t("Startseite")}
                    value={publishPath}
                    data-editor-field="site-path"
                    onChange={(event) => setPublishPath(event.target.value)}
                  />
                </div>
              </Field>
            </FieldErrors.Provider>
            {error && (
              <p role="alert" className="error-message">
                {t(error)}
              </p>
            )}
            <button
              className="primary full"
              disabled={
                publishing ||
                !!publishPathError ||
                !site.legal.imprint.trim() ||
                !site.legal.privacy.trim()
              }
              onClick={publish}
            >
              {publishing ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Globe size={17} />
              )}
              {t("Jetzt veröffentlichen ")}
              <ArrowUpRight size={17} />
            </button>
            {publishedAt && (
              <a
                className="text-button centered"
                href={sitePathBase(sitePath) || "/"}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("Veröffentlichte Website öffnen ")}
                <ExternalLink size={14} />
              </a>
            )}
            <p className="small muted centered">
              {t(
                "Veröffentlicht auf diesem Server. Deine Domain verwaltest du unter Einstellungen.",
              )}
            </p>
          </Modal>
        )}
      </div>
    </FieldErrors.Provider>
  );
}
function MailIcon() {
  return <FileText size={15} />;
}

export default function App() {
  return (
    <I18nProvider>
      <Screen />
    </I18nProvider>
  );
}
