import initSqlJs, { type Database } from "sql.js";
import {
  mkdirSync,
  existsSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  catalogue,
  isLanguage,
  type Language,
  type Messages,
} from "../src/translations.ts";
import { siteSchema, type Site } from "../src/model.ts";

export type SiteRecord = {
  id: string;
  created: string;
  name: string;
  revision: number;
  /** Veröffentlichte Adresse ("" = Startseite), `null` solange nicht veröffentlicht. */
  path: string | null;
  publishedAt: string | null;
};

export class SitePathTakenError extends Error {
  constructor(public path: string) {
    super("Diese Adresse hat schon eine andere Website.");
  }
}

/** Gespeicherte Website mit den Vorgaben für Felder, die ältere Fassungen noch nicht kannten. */
function parseSite(value: unknown): Site | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = JSON.parse(String(value)),
    parsed = siteSchema.safeParse(raw);
  return parsed.success ? parsed.data : raw;
}

export class Store {
  private constructor(
    public db: Database,
    private file: string,
  ) {}
  static async open(dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const SQL = await initSqlJs();
    const file = path.join(dir, "klarwerk.sqlite");
    const db = new SQL.Database(
      existsSync(file) ? readFileSync(file) : undefined,
    );
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY,created TEXT NOT NULL,document TEXT NOT NULL,site_id TEXT);
      CREATE TABLE IF NOT EXISTS translations (key TEXT PRIMARY KEY,de TEXT NOT NULL,en TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY,created TEXT NOT NULL,draft TEXT NOT NULL,revision INTEGER NOT NULL,published TEXT,published_at TEXT,path TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS sites_path ON sites(path) WHERE path IS NOT NULL;
      CREATE TABLE IF NOT EXISTS redirects (path TEXT PRIMARY KEY,site_id TEXT NOT NULL);`);
    const store = new Store(db, file);
    let added = store.migrateToSites(dir);
    const insert = db.prepare(
      "INSERT OR IGNORE INTO translations(key,de,en) VALUES(?,?,?)",
    );
    try {
      db.run("BEGIN");
      for (const [key, pair] of Object.entries(catalogue)) {
        insert.run([key, pair.de, pair.en]);
        added += db.getRowsModified();
      }
      db.run("COMMIT");
    } catch (error) {
      db.run("ROLLBACK");
      db.close();
      throw error;
    } finally {
      insert.free();
    }
    const savedAdmin = store.get("admin");
    if (savedAdmin) {
      const admin = JSON.parse(savedAdmin);
      // Existing installations without a rotation flag complete the initial password change once.
      if (admin.mustChangePassword === undefined) {
        store.set(
          "admin",
          JSON.stringify({ ...admin, mustChangePassword: true }),
        );
        added++;
      }
    }
    if (added) store.flush();
    return store;
  }
  /**
   * Bis 2026-11 kannte Klarwarg genau eine Website (Einträge draft/published/revision/publishedAt
   * in settings). Sie wird einmalig zur ersten Website unter der Startseite; die Datei wird
   * vorher nach backups/ kopiert.
   */
  private migrateToSites(dir: string) {
    const versionColumns = this.db
      .exec("PRAGMA table_info(versions)")[0]
      ?.values.map((row) => String(row[1]));
    const needsColumn = !versionColumns?.includes("site_id");
    const legacy = this.get("draft");
    if (!needsColumn && !legacy) return 0;
    if (existsSync(this.file)) {
      const backups = path.join(dir, "backups");
      mkdirSync(backups, { recursive: true, mode: 0o700 });
      copyFileSync(
        this.file,
        path.join(
          backups,
          `klarwarg-before-sites-${new Date().toISOString().replace(/[:.]/g, "")}.sqlite`,
        ),
      );
    }
    this.db.run("BEGIN");
    try {
      if (needsColumn)
        this.db.run("ALTER TABLE versions ADD COLUMN site_id TEXT");
      if (legacy && !this.siteId()) {
        const id = randomUUID(),
          published = this.get("published") ?? null,
          publishedAt = this.get("publishedAt") ?? null;
        this.db.run(
          "INSERT INTO sites(id,created,draft,revision,published,published_at,path) VALUES(?,?,?,?,?,?,?)",
          [
            id,
            publishedAt || new Date().toISOString(),
            legacy,
            Number(this.get("revision") || 0),
            published,
            published ? publishedAt || new Date().toISOString() : null,
            published ? "" : null,
          ],
        );
        this.db.run("UPDATE versions SET site_id=? WHERE site_id IS NULL", [
          id,
        ]);
      }
      this.db.run(
        "DELETE FROM settings WHERE key IN ('draft','published','revision','publishedAt')",
      );
      this.db.run("COMMIT");
    } catch (error) {
      this.db.run("ROLLBACK");
      this.db.close();
      throw error;
    }
    return 1;
  }
  translations(language: Language): Messages {
    if (!isLanguage(language)) throw new Error("Unsupported language");
    const rows = this.db.exec(
      `SELECT key,${language} FROM translations ORDER BY key`,
    );
    return Object.fromEntries(
      (rows[0]?.values || []).map(([key, value]) => [
        String(key),
        String(value),
      ]),
    );
  }
  get(key: string): string | undefined {
    const r = this.db.exec("SELECT value FROM settings WHERE key = ?", [key]);
    return r[0]?.values[0]?.[0] as string | undefined;
  }
  set(key: string, value: string) {
    this.db.run(
      "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [key, value],
    );
  }
  flush() {
    const tmp = this.file + ".tmp";
    writeFileSync(tmp, this.db.export(), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
  /** Alle Websites, die älteste zuerst. Der Name kommt aus dem Entwurf. */
  sites(): SiteRecord[] {
    const rows = this.db.exec(
      "SELECT id,created,draft,revision,path,published_at FROM sites ORDER BY created,rowid",
    );
    return (rows[0]?.values || []).map(
      ([id, created, draft, revision, path, publishedAt]) => {
        let name = "";
        try {
          name = String(JSON.parse(String(draft)).name || "");
        } catch {}
        return {
          id: String(id),
          created: String(created),
          name,
          revision: Number(revision),
          path: path === null ? null : String(path),
          publishedAt: publishedAt === null ? null : String(publishedAt),
        };
      },
    );
  }
  /** Die gemeinte Website: die angegebene, falls es sie gibt, ohne Angabe die älteste. */
  siteId(id?: string): string | undefined {
    if (id === undefined)
      return this.db.exec(
        "SELECT id FROM sites ORDER BY created,rowid LIMIT 1",
      )[0]?.values[0]?.[0] as string | undefined;
    return this.db.exec("SELECT id FROM sites WHERE id=?", [id])[0]?.values
      .length
      ? id
      : undefined;
  }
  private column(id: string | undefined, column: string) {
    const siteId = this.siteId(id);
    if (!siteId) return undefined;
    const value = this.db.exec(`SELECT ${column} FROM sites WHERE id=?`, [
      siteId,
    ])[0]?.values[0]?.[0];
    return value === null || value === undefined ? undefined : value;
  }
  createSite(site: Site): string {
    const id = randomUUID();
    this.db.run(
      "INSERT INTO sites(id,created,draft,revision) VALUES(?,?,?,1)",
      [id, new Date().toISOString(), JSON.stringify(site)],
    );
    this.flush();
    return id;
  }
  deleteSite(id: string) {
    this.db.run("BEGIN");
    try {
      this.db.run("DELETE FROM versions WHERE site_id=?", [id]);
      this.db.run("DELETE FROM redirects WHERE site_id=?", [id]);
      this.db.run("DELETE FROM sites WHERE id=?", [id]);
      this.db.run("COMMIT");
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
    this.flush();
  }
  draft(id?: string): Site | undefined {
    return parseSite(this.column(id, "draft"));
  }
  publicSite(id?: string): Site | undefined {
    return parseSite(this.column(id, "published"));
  }
  revision(id?: string): number {
    return Number(this.column(id, "revision") || 0);
  }
  publishedAt(id?: string): string | undefined {
    const value = this.column(id, "published_at");
    return value === undefined ? undefined : String(value);
  }
  /** Veröffentlichte Adresse; `undefined`, solange die Website nicht online ist. */
  path(id?: string): string | undefined {
    const value = this.column(id, "path");
    return value === undefined ? undefined : String(value);
  }
  /** Die veröffentlichte Website unter dieser Adresse ("" = Startseite). */
  siteAt(path: string) {
    const row = this.db.exec(
      "SELECT id,published,published_at FROM sites WHERE path=? AND published IS NOT NULL",
      [path],
    )[0]?.values[0];
    if (!row) return undefined;
    const site = parseSite(row[1]);
    return site
      ? { id: String(row[0]), site, publishedAt: String(row[2]) }
      : undefined;
  }
  /** Wohin eine frühere Adresse heute führt, solange die Website noch online ist. */
  redirect(path: string): string | undefined {
    const row = this.db.exec(
      "SELECT s.path FROM redirects r JOIN sites s ON s.id=r.site_id WHERE r.path=? AND s.path IS NOT NULL",
      [path],
    )[0]?.values[0];
    return row ? String(row[0]) : undefined;
  }
  /** Ohne Website-ID: die älteste; gibt es noch keine, legt Revision 0 die erste an. */
  save(site: Site, expected: number, id?: string) {
    const siteId = this.siteId(id);
    if (!siteId) {
      if (id !== undefined || expected !== 0) return null;
      this.createSite(site);
      return 1;
    }
    const revision = this.revision(siteId);
    if (expected !== revision) return null;
    this.db.run("UPDATE sites SET draft=?,revision=? WHERE id=?", [
      JSON.stringify(site),
      revision + 1,
      siteId,
    ]);
    this.flush();
    return revision + 1;
  }
  /**
   * Entwurf veröffentlichen. Ohne `path` bleibt die bisherige Adresse, beim ersten Mal ist es die
   * Startseite. Ändert sich die Adresse, leitet die alte weiter, bis eine andere Website sie nimmt.
   */
  publish(id?: string, path?: string) {
    const siteId = this.siteId(id);
    const doc = siteId && this.column(siteId, "draft");
    if (!siteId || !doc) throw new Error("Kein Entwurf vorhanden");
    const previous = this.path(siteId);
    const target = path ?? previous ?? "";
    const owner = this.db.exec("SELECT id FROM sites WHERE path=? AND id<>?", [
      target,
      siteId,
    ])[0]?.values.length;
    if (owner) throw new SitePathTakenError(target);
    const version = randomUUID(),
      created = new Date().toISOString();
    this.db.run("BEGIN");
    try {
      this.db.run(
        "INSERT INTO versions(id,created,document,site_id) VALUES(?,?,?,?)",
        [version, created, String(doc), siteId],
      );
      this.db.run(
        "UPDATE sites SET published=draft,published_at=?,path=? WHERE id=?",
        [created, target, siteId],
      );
      this.db.run("DELETE FROM redirects WHERE path=?", [target]);
      if (previous !== undefined && previous !== target)
        this.db.run(
          "INSERT INTO redirects(path,site_id) VALUES(?,?) ON CONFLICT(path) DO UPDATE SET site_id=excluded.site_id",
          [previous, siteId],
        );
      this.db.run(
        "DELETE FROM versions WHERE site_id=? AND id NOT IN (SELECT id FROM versions WHERE site_id=? ORDER BY created DESC LIMIT 20)",
        [siteId, siteId],
      );
      this.db.run("COMMIT");
      this.flush();
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
    return { id: version, created, path: target };
  }
  versions(id?: string) {
    const siteId = this.siteId(id);
    const rows = this.db.exec(
      "SELECT id,created FROM versions WHERE site_id=? ORDER BY created DESC",
      [siteId ?? ""],
    );
    return (rows[0]?.values || []).map(([id, created]) => ({
      id: String(id),
      created: String(created),
    }));
  }
  /** Gespeicherter Stand – nur aus der eigenen Website, nie aus einer anderen. */
  version(versionId: string, id?: string): Site | undefined {
    const siteId = this.siteId(id);
    const row = this.db.exec(
      "SELECT document FROM versions WHERE id=? AND site_id=?",
      [versionId, siteId ?? ""],
    )[0]?.values[0];
    return row ? siteSchema.parse(JSON.parse(String(row[0]))) : undefined;
  }
  session(token: string, expires: number) {
    this.db.run("DELETE FROM sessions WHERE expires < ?", [Date.now()]);
    this.db.run("INSERT INTO sessions VALUES(?,?)", [
      createHash("sha256").update(token).digest("hex"),
      expires,
    ]);
    this.flush();
  }
  authenticated(token: string) {
    return !!this.db.exec(
      "SELECT hash FROM sessions WHERE hash=? AND expires>?",
      [createHash("sha256").update(token).digest("hex"), Date.now()],
    )[0]?.values.length;
  }
  logout(token: string) {
    this.db.run("DELETE FROM sessions WHERE hash=?", [
      createHash("sha256").update(token).digest("hex"),
    ]);
    this.flush();
  }
  close() {
    this.db.close();
  }
}
