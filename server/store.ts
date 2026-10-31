import initSqlJs, { type Database } from "sql.js";
import {
  mkdirSync,
  existsSync,
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
      CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY,created TEXT NOT NULL,document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS translations (key TEXT PRIMARY KEY,de TEXT NOT NULL,en TEXT NOT NULL);`);
    const store = new Store(db, file);
    let added = 0;
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
  draft(): Site | undefined {
    return this.site("draft");
  }
  publicSite(): Site | undefined {
    return this.site("published");
  }
  /** Gespeicherte Website mit den Vorgaben für Felder, die ältere Fassungen noch nicht kannten. */
  private site(key: string): Site | undefined {
    const d = this.get(key);
    if (!d) return undefined;
    const raw = JSON.parse(d),
      parsed = siteSchema.safeParse(raw);
    return parsed.success ? parsed.data : raw;
  }
  save(site: Site, expected: number) {
    const revision = Number(this.get("revision") || 0);
    if (expected !== revision) return null;
    this.set("draft", JSON.stringify(site));
    this.set("revision", String(revision + 1));
    this.flush();
    return revision + 1;
  }
  publish() {
    const doc = this.get("draft");
    if (!doc) throw new Error("Kein Entwurf vorhanden");
    const id = randomUUID(),
      created = new Date().toISOString();
    this.db.run("BEGIN");
    try {
      this.db.run("INSERT INTO versions VALUES(?,?,?)", [id, created, doc]);
      this.set("published", doc);
      this.set("publishedAt", created);
      this.db.run(
        "DELETE FROM versions WHERE id NOT IN (SELECT id FROM versions ORDER BY created DESC LIMIT 20)",
      );
      this.db.run("COMMIT");
      this.flush();
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
    return { id, created };
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
