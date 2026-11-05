import { randomBytes, scryptSync } from "node:crypto";
import { z } from "zod";
import { createSite } from "../src/model.ts";
import type { Store } from "./store.ts";

// Login verifies an existing password; the 12-character policy applies when choosing a new one.
export const loginCredentials = z.object({
  username: z.string().min(3).max(80),
  password: z.string().min(1).max(200),
});

/** Provision once without replacing an existing admin or site. Passwords never reach disk. */
export function createAdmin(store: Store, input: unknown) {
  if (store.get("admin"))
    throw new Error(
      "Ein Adminzugang ist bereits vorhanden. Er wurde nicht verändert.",
    );
  const { username, password } = loginCredentials.parse(input);
  const salt = randomBytes(16).toString("hex");
  store.set(
    "admin",
    JSON.stringify({
      username,
      mustChangePassword: true,
      salt,
      hash: scryptSync(password, salt, 64).toString("hex"),
    }),
  );
  if (!store.siteId()) store.createSite(createSite());
  else store.flush();
  return username;
}
