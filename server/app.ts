import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z, ZodError } from "zod";
import {
  createTranslator,
  isLanguage,
  type Language,
} from "../src/translations.ts";
import { Store, SitePathTakenError } from "./store.ts";
import { loginCredentials } from "./admin.ts";
import { githubRepos } from "./github.ts";
import {
  createSite,
  siteSchema,
  serviceSchema,
  type Site,
} from "../src/model.ts";
import {
  css,
  cssVersion,
  renderPage,
  renderUnpublished,
  robots,
  sitemap,
} from "./render.ts";
import type { PublicPage } from "../src/SiteSurface.tsx";
import {
  sitePathBase,
  sitePathProblem,
  maxSitePathLength,
} from "../src/sitePath.ts";

const credentials = z.object({
  username: z.string().min(3).max(80),
  password: z.string().min(12).max(200),
});
const digest = (password: string, salt: string) =>
  scryptSync(password, salt, 64).toString("hex");
const cookieName = "klarwerk_session";
export async function createApp(
  dir: string,
  options: { staticDir?: string; request?: typeof fetch } = {},
) {
  const store = await Store.open(dir),
    app = express(),
    request = options.request || fetch;
  const uploads = path.join(dir, "uploads");
  mkdirSync(uploads, { recursive: true });
  app.disable("x-powered-by");
  const requestLanguage = (req: Request): Language => {
    const value = String(req.query.lang || req.get("Accept-Language") || "de")
      .toLowerCase()
      .split(/[-,;]/)[0];
    return isLanguage(value) ? value : "de";
  };
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body) => {
      if (body && typeof body.error === "string") {
        const language = requestLanguage(req);
        const t = createTranslator(language, store.translations(language));
        body = { ...body, errorKey: body.error, error: t(body.error) };
      }
      return json(body);
    };
    next();
  });
  // Hinter einem Reverse-Proxy sähen sonst alle Besucher wie der Proxy aus: Die Loginsperre träfe
  // dann jeden, und das Protokoll wäre immer http. Standard ist ein Proxy auf demselben Rechner.
  app.set("trust proxy", process.env.TRUST_PROXY || "loopback");
  // Ohne Adminzugang braucht die Einrichtung einen Code aus der Serverkonsole, sobald der Server
  // nicht mehr nur lokal läuft. Sonst gehört der Admin dem, der /admin zuerst aufruft.
  const setupCode = randomBytes(5).toString("hex").toUpperCase();
  const isLocalRequest = (req: Request) => {
    const peer = req.socket.remoteAddress || "";
    const loopback =
      peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
    const forwarded =
      req.headers["x-forwarded-for"] ||
      req.headers["forwarded"] ||
      req.headers["x-real-ip"];
    const bindsLocally = ["127.0.0.1", "localhost", "::1", undefined].includes(
      process.env.HOST,
    );
    return loopback && !forwarded && bindsLocally && !process.env.PUBLIC_ORIGIN;
  };
  const allowedOrigins = new Set(
    [
      "http://localhost:8091",
      "http://127.0.0.1:8091",
      process.env.PUBLIC_ORIGIN,
    ].filter(Boolean),
  );
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    const origin = req.headers.origin;
    const ownOrigin = `${req.protocol}://${req.get("host")}`;
    if (origin && (allowedOrigins.has(origin) || origin === ownOrigin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept-Language",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,PUT,POST,DELETE,OPTIONS",
      );
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      ((origin && !allowedOrigins.has(origin) && origin !== ownOrigin) ||
        req.headers["sec-fetch-site"] === "cross-site")
    )
      return res
        .status(403)
        .json({ error: "Anfrage von dieser Website ist nicht erlaubt." });
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "12mb" }));
  const token = (req: Request) => {
    const match = req.headers.cookie?.match(
      /(?:^|;\s*)klarwerk_session=([a-f0-9]{64})(?:;|$)/,
    );
    return match?.[1] || "";
  };
  const mustChangePassword = () => {
    const admin = store.get("admin");
    return !!admin && JSON.parse(admin).mustChangePassword === true;
  };
  const auth = (req: Request, res: Response, next: NextFunction) => {
    if (!store.authenticated(token(req)))
      return res.status(401).json({ error: "Bitte zuerst anmelden." });
    if (
      mustChangePassword() &&
      !["/api/password", "/api/logout"].includes(req.path)
    )
      return res.status(403).json({
        code: "password_change_required",
        error: "Bitte ändere zuerst dein Startpasswort.",
      });
    next();
  };
  const session = (res: Response) => {
    const value = randomBytes(32).toString("hex");
    store.session(value, Date.now() + 12 * 60 * 60 * 1000);
    res.cookie(cookieName, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 12 * 60 * 60 * 1000,
      path: "/",
    });
  };
  const attempts = new Map<string, { count: number; until: number }>();
  const limited = (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || "local",
      now = Date.now();
    for (const [ip, a] of attempts) if (a.until < now) attempts.delete(ip);
    const a = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
    attempts.set(key, a);
    if (++a.count > 15)
      return res.status(429).json({
        error:
          "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.",
      });
    next();
  };
  app.get("/api/translations/:language", (req, res) => {
    const language = req.params.language;
    if (!isLanguage(language))
      return res.status(400).json({ error: "Nicht unterstützte Sprache." });
    res.setHeader("Cache-Control", "no-store");
    res.json({ language, messages: store.translations(language) });
  });
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, storage: "sqlite" }),
  );
  app.get("/api/auth", (req, res) =>
    res.json({
      setup: !store.get("admin"),
      setupCode: !store.get("admin") && !isLocalRequest(req),
      authenticated: store.authenticated(token(req)),
      mustChangePassword:
        store.authenticated(token(req)) && mustChangePassword(),
    }),
  );
  app.post("/api/setup", limited, (req, res) => {
    if (store.get("admin"))
      return res
        .status(409)
        .json({ error: "Der Adminzugang wurde bereits eingerichtet." });
    const data = credentials.parse(req.body),
      salt = randomBytes(16).toString("hex");
    const code = String(req.body?.setupCode || "")
      .trim()
      .toUpperCase();
    if (
      !isLocalRequest(req) &&
      (code.length !== setupCode.length ||
        !timingSafeEqual(Buffer.from(code), Buffer.from(setupCode)))
    )
      return res.status(403).json({
        error:
          "Der Einrichtungscode stimmt nicht. Er steht in der Konsole, in der der Server läuft.",
      });
    store.set(
      "admin",
      JSON.stringify({
        username: data.username,
        mustChangePassword: false,
        salt,
        hash: digest(data.password, salt),
      }),
    );
    if (!store.siteId()) store.createSite(createSite());
    session(res);
    res.json({ ok: true });
  });
  app.post("/api/login", limited, (req, res) => {
    const { username, password } = loginCredentials.parse(req.body),
      saved = store.get("admin");
    const admin = saved
      ? JSON.parse(saved)
      : { salt: "0".repeat(32), hash: "0".repeat(128), username: "" };
    const matches = timingSafeEqual(
      Buffer.from(admin.hash, "hex"),
      Buffer.from(digest(password, admin.salt), "hex"),
    );
    if (!matches || username !== admin.username)
      return res
        .status(401)
        .json({ error: "Benutzername oder Passwort stimmt nicht." });
    // Nur Fehlversuche zählen: Wer sich richtig anmeldet, fängt wieder bei null an.
    attempts.delete(req.ip || "local");
    session(res);
    res.json({ ok: true, mustChangePassword: mustChangePassword() });
  });
  app.post("/api/logout", auth, (req, res) => {
    store.logout(token(req));
    res.clearCookie(cookieName, { path: "/" });
    res.json({ ok: true });
  });
  // Mehrere Websites: Die Editor-Routen nehmen die Website als ?site=<id>. Ohne Angabe ist die
  // älteste gemeint, so wie es vor den mehreren Websites die einzige war.
  const siteParam = (req: Request) =>
    typeof req.query.site === "string" ? req.query.site : undefined;
  const withSite = (req: Request, res: Response, next: NextFunction) => {
    const id = store.siteId(siteParam(req));
    if (!id)
      return res
        .status(404)
        .json({ error: "Diese Website gibt es nicht mehr. Bitte neu laden." });
    res.locals.siteId = id;
    next();
  };
  app.get("/api/site", (req, res) => {
    const found = store.siteAt(
      typeof req.query.path === "string" ? req.query.path : "",
    );
    return found
      ? res.json({ site: found.site, publishedAt: found.publishedAt })
      : res
          .status(404)
          .json({ error: "Diese Website wurde noch nicht veröffentlicht." });
  });
  app.get("/api/sites", auth, (_req, res) =>
    res.json({
      sites: store.sites().map(({ id, name, path, publishedAt }) => ({
        id,
        name,
        path,
        publishedAt,
      })),
    }),
  );
  app.post("/api/sites", auth, (req, res) => {
    const { profession } = z
      .object({ profession: z.string().max(40).optional() })
      .parse(req.body ?? {});
    res.json({ id: store.createSite(createSite(profession)) });
  });
  app.delete("/api/sites/:id", auth, (req, res) => {
    const id = store.siteId(String(req.params.id));
    if (!id)
      return res
        .status(404)
        .json({ error: "Diese Website gibt es nicht mehr. Bitte neu laden." });
    if (store.sites().length < 2)
      return res.status(409).json({
        error: "Die letzte Website kann nicht gelöscht werden.",
      });
    store.deleteSite(id);
    res.json({ ok: true });
  });
  app.get("/api/draft", auth, withSite, (_req, res) => {
    const id = res.locals.siteId as string;
    res.json({
      id,
      site: store.draft(id),
      revision: store.revision(id),
      publishedAt: store.publishedAt(id) || null,
      path: store.path(id) ?? null,
    });
  });
  app.put("/api/draft", auth, withSite, (req, res) => {
    const { site, revision } = z
      .object({ site: siteSchema, revision: z.number().int().nonnegative() })
      .parse(req.body);
    const saved = store.save(site, revision, res.locals.siteId);
    if (saved === null)
      return res.status(409).json({
        error:
          "Der Entwurf wurde in einem anderen Fenster geändert. Bitte sichere deine Änderungen als JSON und lade die aktuelle Version neu.",
      });
    res.json({ revision: saved });
  });
  app.post("/api/publish", auth, withSite, (req, res) => {
    const id = res.locals.siteId as string;
    const { path: requested } = z
      .object({
        path: z.string().trim().toLowerCase().max(maxSitePathLength).optional(),
      })
      .parse(req.body ?? {});
    // Ohne Impressum und Datenschutzerklärung geht keine Website online (Impressumspflicht).
    const draft = store.draft(id);
    if (draft && (!draft.legal.imprint.trim() || !draft.legal.privacy.trim()))
      return res.status(409).json({
        error:
          "Bitte zuerst Impressum und Datenschutzerklärung ausfüllen (Einstellungen → Impressum & Datenschutz).",
      });
    const problem = requested === undefined ? null : sitePathProblem(requested);
    if (problem) return res.status(400).json({ error: problem, field: "path" });
    try {
      const result = store.publish(id, requested);
      res.json({ ...result, url: sitePathBase(result.path) || "/" });
    } catch (error) {
      if (error instanceof SitePathTakenError)
        return res.status(409).json({ error: error.message, field: "path" });
      throw error;
    }
  });
  app.get("/api/versions", auth, withSite, (_req, res) => {
    res.json({ versions: store.versions(res.locals.siteId) });
  });
  app.post("/api/restore/:id", auth, withSite, (req, res) => {
    const id = res.locals.siteId as string;
    const version = store.version(String(req.params.id), id);
    if (!version)
      return res.status(404).json({ error: "Version nicht gefunden." });
    const revision = store.save(version, store.revision(id), id);
    res.json({ revision, site: store.draft(id) });
  });
  app.post("/api/password", auth, (req, res) => {
    const data = z
        .object({
          current: z.string().max(200),
          password: z.string().min(12).max(200),
        })
        .parse(req.body),
      a = JSON.parse(store.get("admin")!);
    if (
      !timingSafeEqual(
        Buffer.from(a.hash, "hex"),
        Buffer.from(digest(data.current, a.salt), "hex"),
      )
    )
      return res
        .status(401)
        .json({ error: "Das bisherige Passwort stimmt nicht." });
    if (
      timingSafeEqual(
        Buffer.from(a.hash, "hex"),
        Buffer.from(digest(data.password, a.salt), "hex"),
      )
    )
      return res
        .status(400)
        .json({ error: "Bitte ein anderes Passwort als bisher wählen." });
    const salt = randomBytes(16).toString("hex");
    store.set(
      "admin",
      JSON.stringify({
        username: a.username,
        mustChangePassword: false,
        passwordChangedAt: new Date().toISOString(),
        salt,
        hash: digest(data.password, salt),
      }),
    );
    store.db.run("DELETE FROM sessions");
    session(res);
    res.json({ ok: true });
  });
  app.post("/api/upload", auth, (req, res) => {
    const { data } = z
      .object({ data: z.string().max(11200000) })
      .parse(req.body);
    const match =
      /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(data);
    if (!match)
      return res
        .status(400)
        .json({ error: "Bitte PNG, JPEG, WebP oder GIF auswählen." });
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 8 * 1024 * 1024)
      return res
        .status(413)
        .json({ error: "Das Bild darf höchstens 8 MB groß sein." });
    const type = match[1];
    const valid =
      type === "png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : type === "jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : type === "gif"
            ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())
            : bytes.subarray(0, 4).toString() === "RIFF" &&
              bytes.subarray(8, 12).toString() === "WEBP";
    if (!valid)
      return res
        .status(400)
        .json({ error: "Die Datei enthält kein gültiges Bild dieses Typs." });
    const name = randomUUID() + "." + (type === "jpeg" ? "jpg" : type);
    writeFileSync(path.join(uploads, name), bytes, { mode: 0o600 });
    res.json({ url: "/uploads/" + name });
  });
  app.use(
    "/uploads",
    express.static(uploads, {
      dotfiles: "deny",
      maxAge: "1d",
      setHeaders: (res) =>
        res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox"),
    }),
  );
  app.get("/api/integrations", auth, (_req, res) =>
    res.json({
      linkedin: !!(
        process.env.LINKEDIN_CLIENT_ID &&
        process.env.LINKEDIN_CLIENT_SECRET &&
        process.env.LINKEDIN_REDIRECT_URI
      ),
      business: !!process.env.BUSINESS_API_URL,
    }),
  );
  app.post("/api/github", auth, async (req, res) => {
    const { username } = z
      .object({ username: z.string().max(39) })
      .parse(req.body);
    res.json({
      repos: await githubRepos(username, request),
      syncedAt: new Date().toISOString(),
    });
  });
  app.post("/api/business/import", auth, async (_req, res) => {
    const endpoint = process.env.BUSINESS_API_URL;
    if (!endpoint)
      return res.status(409).json({
        error:
          "Die Berufssoftware muss zuerst auf dem Server eingerichtet werden (BUSINESS_API_URL).",
      });
    const url = new URL(endpoint);
    if (url.protocol !== "https:")
      return res
        .status(400)
        .json({ error: "Die Berufssoftware benötigt eine HTTPS-Adresse." });
    const response = await request(url, {
      headers: {
        Accept: "application/json",
        ...(process.env.BUSINESS_API_TOKEN
          ? { Authorization: `Bearer ${process.env.BUSINESS_API_TOKEN}` }
          : {}),
      },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok)
      return res.status(502).json({
        error:
          "Die Berufssoftware ist nicht erreichbar oder hat den Zugang abgelehnt.",
      });
    const data = z
      .object({ services: z.array(serviceSchema).max(100) })
      .parse(await response.json());
    res.json(data);
  });
  app.get("/api/linkedin/start", auth, (req, res) => {
    if (
      !process.env.LINKEDIN_CLIENT_ID ||
      !process.env.LINKEDIN_CLIENT_SECRET ||
      !process.env.LINKEDIN_REDIRECT_URI
    )
      return res
        .status(409)
        .send("LinkedIn-Zugang zuerst in der Serverumgebung einrichten.");
    const state = randomBytes(32).toString("hex");
    store.set(
      "linkedin:" + state,
      JSON.stringify({ session: token(req), expires: Date.now() + 600000 }),
    );
    store.flush();
    const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID,
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
      scope: "openid profile email",
      state,
    }).toString();
    res.redirect(url.toString());
  });
  app.get("/api/linkedin/callback", auth, async (req, res) => {
    const state = String(req.query.state || ""),
      saved = store.get("linkedin:" + state);
    store.db.run("DELETE FROM settings WHERE key=?", ["linkedin:" + state]);
    store.flush();
    const info = saved ? JSON.parse(saved) : null;
    if (!info || info.expires < Date.now() || info.session !== token(req))
      return res
        .status(400)
        .send("Die LinkedIn-Anmeldung ist abgelaufen. Bitte erneut starten.");
    if (!req.query.code)
      return res
        .status(400)
        .send("LinkedIn hat die Anmeldung nicht bestätigt.");
    const result = await request(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: String(req.query.code),
          redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
          client_id: process.env.LINKEDIN_CLIENT_ID!,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!result.ok)
      return res
        .status(502)
        .send("LinkedIn konnte die Anmeldung nicht abschließen.");
    const { access_token } = z
      .object({ access_token: z.string() })
      .parse(await result.json());
    const profileResponse = await request(
      "https://api.linkedin.com/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${access_token}` },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!profileResponse.ok)
      return res.status(502).send("LinkedIn konnte das Profil nicht liefern.");
    const profile = z
      .object({
        name: z.string().max(120),
        picture: z.string().url().optional(),
      })
      .parse(await profileResponse.json());
    store.set("linkedinProfile", JSON.stringify(profile));
    store.flush();
    res.redirect(
      (process.env.PUBLIC_ORIGIN || "http://localhost:8091") +
        "/admin?linkedin=connected",
    );
  });
  app.get("/api/linkedin/profile", auth, (_req, res) =>
    res.json({
      profile: store.get("linkedinProfile")
        ? JSON.parse(store.get("linkedinProfile")!)
        : null,
    }),
  );
  // Öffentliche Websites: fertiges HTML vom Server, ohne JavaScript im Browser.
  const hostOrigin = (req: Request) =>
    (
      process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get("host")}`
    ).replace(/\/+$/, "");
  const siteOrigin = (req: Request, site?: Site) =>
    (site?.domain || hostOrigin(req)).replace(/\/+$/, "");
  const legalSuffix = {
    home: "",
    imprint: "/impressum",
    privacy: "/datenschutz",
  };
  const notFound = (req: Request, res: Response) =>
    res
      .status(404)
      .type("html")
      .send(
        renderUnpublished(
          requestLanguage(req),
          store.translations(requestLanguage(req)),
        ),
      );
  /** Website unter `path` ("" = Startseite); eine frühere Adresse leitet auf die heutige weiter. */
  const serveSite = (
    path: string,
    page: PublicPage,
    req: Request,
    res: Response,
  ) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    res.setHeader("Cache-Control", "no-cache");
    const found = store.siteAt(path);
    if (found)
      return res
        .type("html")
        .send(
          renderPage(
            found.site,
            page,
            siteOrigin(req, found.site),
            store.translations(found.site.language),
            sitePathBase(path),
          ),
        );
    const moved = store.redirect(path);
    if (moved !== undefined)
      return res.redirect(301, sitePathBase(moved) + legalSuffix[page] || "/");
    notFound(req, res);
  };
  const publicPage = (page: PublicPage) => (req: Request, res: Response) =>
    serveSite("", page, req, res);
  app.get("/", publicPage("home"));
  app.get("/impressum", publicPage("imprint"));
  app.get("/datenschutz", publicPage("privacy"));
  app.get("/site.css", (req, res) => {
    res.setHeader(
      "Cache-Control",
      req.query.v === cssVersion
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );
    res.type("css").send(css);
  });
  app.get("/robots.txt", (req, res) =>
    res.type("text").send(robots(siteOrigin(req, store.siteAt("")?.site))),
  );
  app.get("/sitemap.xml", (req, res) => {
    const entries = store.sites().flatMap((record) => {
      const found =
        record.path === null ? undefined : store.siteAt(record.path);
      if (!found || record.path === null) return [];
      return [
        {
          loc: siteOrigin(req, found.site) + (sitePathBase(record.path) || "/"),
          lastmod: found.publishedAt,
        },
      ];
    });
    if (!entries.length) return res.status(404).type("text").send("");
    res.type("xml").send(sitemap(entries));
  });
  // Mitgelieferte Bilder auch ohne Expo-Export (Entwicklung, Tests).
  app.use(
    "/images",
    express.static(path.join(import.meta.dirname, "../public/images"), {
      maxAge: "1d",
    }),
  );
  const staticDir = options.staticDir || path.resolve("dist");
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false }));
    // Der Editor ist die Expo-App. Sie gehört nicht in Suchmaschinen und spricht Deutsch.
    const adminHtml = () =>
      readFileSync(path.join(staticDir, "index.html"), "utf8")
        .replace('<html lang="en">', '<html lang="de">')
        .replace(
          "<head>",
          '<head>\n    <meta name="robots" content="noindex, nofollow" />',
        );
    app.get("/admin", (_req, res) => res.type("html").send(adminHtml()));
  }
  // Weitere Websites unter /iris, /judith … – nach allen festen Pfaden, damit keiner überdeckt wird.
  const pathPage =
    (page: PublicPage) => (req: Request, res: Response, next: NextFunction) => {
      const path = String(req.params.path);
      if (sitePathProblem(path)) return next();
      serveSite(path, page, req, res);
    };
  app.get("/:path", pathPage("home"));
  app.get("/:path/impressum", pathPage("imprint"));
  app.get("/:path/datenschutz", pathPage("privacy"));
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof ZodError)
        return res.status(400).json({
          error: error.issues
            .map((i) => {
              const language = requestLanguage(_req);
              const t = createTranslator(
                language,
                store.translations(language),
              );
              const message =
                i.code === "too_small"
                  ? t("Der Wert ist zu klein (Minimum: {minimum}).", {
                      minimum: String(i.minimum),
                    })
                  : i.code === "too_big"
                    ? t("Der Wert ist zu groß (Maximum: {maximum}).", {
                        maximum: String(i.maximum),
                      })
                    : i.code === "invalid_type"
                      ? t("Ungültiger Wert.")
                      : i.code === "invalid_format"
                        ? t("Ungültiges Format.")
                        : t(i.message);
              return `${i.path.join(".")}: ${message}`;
            })
            .join("; "),
        });
      if (error instanceof SyntaxError)
        return res.status(400).json({ error: "Ungültige Anfrage." });
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 413
      )
        return res.status(413).json({ error: "Die Datei ist zu groß." });
      res.status(500).json({
        error:
          error instanceof Error &&
          /GitHub|Benutzername|Repositories/.test(error.message)
            ? error.message
            : "Die Aktion konnte nicht abgeschlossen werden. Bitte erneut versuchen.",
      });
    },
  );
  return { app, store, setupCode };
}
