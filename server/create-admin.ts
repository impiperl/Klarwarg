import "./env.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createAdmin } from "./admin.ts";
import { Store } from "./store.ts";

const dir = path.resolve(process.env.DATA_DIR || "data");
if (!process.env.KLARWERK_ADMIN_PASSWORD && process.stdin.isTTY) {
  console.error(
    "Startpasswort über stdin oder KLARWERK_ADMIN_PASSWORD übergeben.",
  );
  process.exit(1);
}
const password =
  process.env.KLARWERK_ADMIN_PASSWORD ??
  readFileSync(0, "utf8").replace(/\r?\n$/, "");
const store = await Store.open(dir);
try {
  const username = createAdmin(store, {
    username: process.argv[2] || "admin",
    password,
  });
  console.log(
    `Adminzugang „${username}“ in ${path.join(dir, "klarwerk.sqlite")} angelegt.`,
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Adminzugang konnte nicht angelegt werden.",
  );
  process.exitCode = 1;
} finally {
  store.close();
}
