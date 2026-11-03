# Klarwarg

A website builder for independent professionals, with an Expo web editor, an integrated
admin area, and local SQLite storage. The editor supports German and English; this documentation is in English. Website
template content starts in German and remains editable.

## Requirements

- Node.js meeting the `engines` requirement in `package.json` (currently at least
  20.19.4), plus npm.
- A persistent directory for the SQLite database and uploaded images.
- For public hosting: a domain, HTTPS, and a reverse proxy forwarding to Klarwarg.
- Exactly one Klarwarg server process per data directory. A separate database server
  is not required: SQLite runs through `sql.js` inside the application.

Use `npm ci` to install the versions recorded in `package-lock.json`. Install development
dependencies too: the server starts through `tsx`, which is a development dependency.

## Local development

From the project directory:

```bash
npm ci
npm run dev
```

- **Editor:** http://localhost:8091/admin
- **Public website preview:** http://localhost:8091/
- **Backend health:** http://localhost:4317/api/health

If `data/klarwerk.sqlite` already contains an admin account, `/admin` opens the login
screen. Otherwise, the first visit lets you choose a username and a password of at
least 12 characters. There is no built-in default password. The server binds to
`127.0.0.1` by default. Set up the account locally before exposing the application.

When running behind a proxy, with `PUBLIC_ORIGIN`, or on a non-local interface, initial
setup also requires a **setup code** printed in the server console as
`Einrichtungscode für den Adminzugang: …`. It remains valid until the next restart.
This prevents an unrelated visitor from claiming the initial admin account.

## Create an admin account before starting the server

The admin area is integrated at `/admin`. You can provision its account directly in
SQLite before starting Klarwarg. Stop the server first: its SQLite state is held in
memory while it runs.

In Bash:

```bash
read -r -s -p 'Initial password: ' klarwarg_admin_password
printf '\n'
printf '%s' "$klarwarg_admin_password" | npm run admin:create -- admin
unset klarwarg_admin_password
```

The command stores a salted scrypt password hash in `data/klarwerk.sqlite`, or the
directory selected by `DATA_DIR`. It refuses to overwrite an existing admin and keeps
existing drafts and published content. It can also read the password from the
`KLARWERK_ADMIN_PASSWORD` environment variable. Keep passwords out of source files.

A provisioned account can use a shorter initial password. Its first sign-in requires a
new personal password before any admin functions become available. The requirement
is stored in SQLite and enforced by the API as well as the login screen. Existing
accounts without a rotation flag also complete this change once. To change it again, open
**Einstellungen → Passwort ändern** (Settings → Change password). Newly chosen passwords
must have at least 12 characters. When migrating an existing database, use its existing
account rather than running account provisioning again.

## Run on a server (recommended)

One script installs and operates Klarwarg on any Linux server with Docker or Podman. It
builds a single small container (editor and bundled server), keeps the data in `data/`, and,
if wanted, adds Caddy for automatic HTTPS. The step-by-step guide for beginners, in German, is
[INSTALLATION.md](INSTALLATION.md).

```bash
git clone https://github.com/impiperl/klarwerk.git /srv/klarwarg
cd /srv/klarwarg
sudo ./klarwarg.sh install    # asks: own domain with automatic HTTPS / behind an existing proxy / LAN test
sudo ./klarwarg.sh update     # pull, rebuild, back up data/, restart
sudo ./klarwarg.sh backup     # backups/klarwarg-<timestamp>.tar.gz
sudo ./klarwarg.sh status     # address, and the setup code while no admin exists
```

The installer does not create the admin account in the terminal; it prints the setup code,
and the first visit to `/admin` creates the account. Settings live in the `.env` written by the
installer (`KLARWARG_MODE`, `DOMAIN`, `PUBLIC_ORIGIN`, …); apply changes with
`./klarwarg.sh restart`. Restoring a site: unpack a backup into `data/` before `install`.
Only Docker or Podman is required; Compose is not.

`npm run build:server` bundles the server into `server-build/` (esbuild; only `sql.js` stays
external), which the container runs with plain `node`.

## Manual installation without containers

### First installation

1. Copy the project source to the server, for example to `/srv/klarwarg`. Include
   `package.json`, `package-lock.json`, the Expo configuration and entry files, `src/`,
   `server/`, and `public/`. Do not copy `node_modules/`, `.expo/`, or test results.
   Include `tests/` if you want to run the verification commands there.
2. Give a dedicated service user access to the project and a persistent data directory,
   for example `/var/lib/klarwarg`. Run the application under that user.
3. Install dependencies and build the web editor:

   ```bash
   cd /srv/klarwarg
   npm ci
   npm run typecheck
   npm test
   npm run build
   ```

4. Export the runtime configuration in the shell or set it in your service manager:

   ```bash
   export DATA_DIR=/var/lib/klarwarg
   export HOST=127.0.0.1
   export PORT=4317
   export PUBLIC_ORIGIN=https://your-domain.example
   export COOKIE_SECURE=true
   ```

5. For a new website, provision an admin using the command above while these variables
   are set. For an existing website, restore its complete data directory instead, as
   described below.
6. Start Klarwarg:

   ```bash
   npm start
   ```

7. Configure the HTTPS reverse proxy to forward requests to `http://127.0.0.1:4317`.
   Preserve the public `Host` header and set `X-Forwarded-For` and `X-Forwarded-Proto`.
   Set your domain's DNS records to the server. The public website and `/admin` then
   share the same domain.
8. Configure a service manager, such as systemd, to run `npm start` in `/srv/klarwarg`
   with the same environment and service user, restart it on failure, and start it at
   boot. Stop the manually started instance before starting the managed service.

The server serves the built editor and the API from the same origin. An Expo development
server is not needed in production. Keep `data/` on persistent storage, including when
using a container, and back it up regularly.

`TRUST_PROXY` defaults to `loopback`, meaning a proxy on the same machine. If the proxy
runs elsewhere, configure its trusted address explicitly. Otherwise request IPs and
protocol detection may be incorrect. Set `HOST=0.0.0.0` only when a container or network
layout requires access beyond loopback. Register provider callbacks for the new domain.

### Move an existing website and admin account

1. Stop Klarwarg on the old server. Its in-memory SQLite copy must not keep writing
   while you take the backup.
2. Copy the **entire data directory** to the new server: `klarwerk.sqlite` **and**
   `uploads/`. A JSON export alone does not include the admin account, uploaded files,
   or version history.
3. Point `DATA_DIR` to that restored directory. Make it readable and writable by the
   service user; the database should have permissions `0600` and the data directory
   `0700`.
4. Complete the dependency installation, build, domain, and HTTPS configuration above.
   Update `PUBLIC_ORIGIN` and any provider callback URLs for the new domain.
5. Start one Klarwarg process on the new server and log in at `/admin` with the existing
   account. Check the editor, public pages, and images before completing the move.

The database carries the admin password hash, drafts, published website, and version
history. Do not run `admin:create` again or replace it with an empty database.

### Updates

Stop the service and back up the full data directory. Update the project files, run
`npm ci`, the checks, and `npm run build`, then restart the service. Preserve the data
directory and runtime configuration. Never run two server processes against the same
SQLite file.

### Environment files

See `.env.example` for available settings. The server reads a `.env` file from its working
directory at startup, if there is one. Variables already set in the environment (shell,
container, service manager) take precedence over the file.
`EXPO_PUBLIC_API_URL` is needed only if the frontend and API intentionally use different
origins; Expo embeds this value into the frontend at build time. The default is to host
everything on the same origin.

## Branding

The supplied `public/images/klarwarg.png` is used on admin and login screens. Generated
websites show a small Klarwarg mark in the lower-left corner, including on legal pages.
The website's own name, contact details, and visual identity remain editable.

## Interface languages

Use the **Sprache / Language** selector on the login screen or in the editor header to
switch between **Deutsch** and **English**. The selection is remembered in this browser;
changing it keeps the current editor state and never rewrites website content.

Every interface message has German and English values in the SQLite `translations`
table (`key`, `de`, `en`). Initial values come from `src/messages.json`; startup adds
missing messages without overwriting existing database values. The public read-only
API `/api/translations/de` or `/api/translations/en` supplies the active texts, including
before login. Bundled seed values provide a fallback if the API is unavailable.

**Einstellungen → Sprache der Website / Settings → Website language** separately selects
the language of built-in public-site labels and the HTML language metadata. Publish the
draft to apply this setting to visitors. Your headings, legal texts, contact details,
service descriptions, and other editable content retain their wording; enter English
content yourself when preparing an English website. This setting does not create two
independent translated versions of your website.

## Edit the website

The labels below use the German interface; switch to English using the language selector.

1. Choose a profession under **Inhalte → Vorlage wechseln** (Content → Change template).
   The selected card is marked immediately. Confirm with **Entwurf ersetzen** (Replace draft)
   to replace and save the entire draft. Cancel keeps your current draft; the published
   website stays unchanged until you publish again.
   Templates cover psychiatry, medical practices, law firms, software development,
   psychotherapy, physiotherapy, tax consulting, architecture, coaching, and trades.
   Under **Inhalte → Anrede**, choose formal or informal German and singular or team
   wording. Healthcare, legal, tax, and architecture templates default to formal German;
   software, coaching, and trades use informal German. Switching updates untouched
   template text, keeps custom wording, and points out wording using the other form.
   Built-in service, project, and contact headings always follow the setting.
2. Enter names and contact details under **Inhalte → Header & Kontaktdaten**. The
   `{name}` placeholder resolves to the configured site name. Select text or images
   on the canvas to edit them in the inspector. Upload PNG, JPEG, WebP, or GIF images.
   Photos up to 30 MB are resized in the browser to a maximum edge of 2400 px and
   converted to WebP, removing camera metadata, including GPS. GIFs up to 8 MB retain
   their animation. The bundled room illustration is a local SVG.
3. Under **Design**, set six independent colors or choose a coordinated palette. Six
   font styles use local system fonts and fallbacks, without third-party font downloads.
4. Drag elements with a mouse or touch, or enter X/Y coordinates, width, and height.
   The desktop canvas is 1200 px wide. **Raster** (Grid) supports 1–24 columns, custom
   gutters, and a row grid. Toggle snapping and grid visibility independently; align
   individual elements or an entire section.
5. Add, rename, and reorder sections or elements. Header navigation follows the sections
   automatically. Services and contact are additional built-in areas. The builder
   produces a single-page site, with dedicated legal pages.
6. Check the mobile preview. Narrow screens stack freely placed elements in their
   original order for readability; desktop coordinates stay intact. Overflowing text
   gets a dashed border and an inspector warning. **Kasten anpassen** (Fit box) adjusts
   its height and grows the section when needed.
7. Add provider links and both legal texts under **Einstellungen → Impressum & Datenschutz**.
   Publishing is blocked until both fields are filled. They appear at `/impressum` and
   `/datenschutz`. **Veröffentlichen** (Publish) copies the draft to the public website;
   editing the draft alone does not change what visitors see.

Changes autosave after one second. `Ctrl/Cmd+S` saves immediately, `Ctrl/Cmd+Z` undoes a
change, and arrow keys move selected elements. Disable **Einrasten** (Snap) or enter
coordinates for precise placement. Revision checks prevent another editor window from
overwriting concurrent changes. If a conflict occurs, export your draft as JSON before
reloading the current server version.

## Storage and backups

- `data/klarwerk.sqlite` contains the admin password hash, sessions, draft, published
  document, and the latest 20 published versions.
- `data/uploads/` contains uploaded images, accessible through their random URLs.
  Upload only images intended for the website.
- The server holds SQLite in memory through `sql.js` and atomically writes it to disk
  after mutations. Use **one process and one data directory**, without clustering or
  shared network filesystems. This architecture is intended for small websites.
- For a complete backup, stop the server and copy the whole data directory. JSON export
  under **Einstellungen** contains content and image references, but not image files,
  credentials, or version history.
- Restore a published version as a new draft under **Einstellungen**. Publish again to
  make the restored content public.
- Changing the password invalidates previous sessions. Session cookies are HttpOnly,
  SameSite=Lax, and expire after 12 hours. Mutations from untrusted origins are rejected, and
  login attempts are rate limited.

Select an image in the editor and choose **Bildform** (Image shape): rectangle, rounded,
arch, oval, or circle. Each image keeps its own shape in the saved draft and published
website, including the mobile view. A circle uses a centered circular crop; an oval
follows the image box dimensions. Existing images keep the original arch shape.

## Integrations

The integration panel follows the selected profession: healthcare booking providers for
healthcare templates, client portals for law firms, and GitHub projects for software
development. LinkedIn and general booking links remain available across professions.
Replacing a template clears configured links and imported repositories. Explicitly
configured integrations in existing/custom drafts remain editable.

### GitHub: public repository import

Enter a username under **Anbindungen → GitHub** and import. The server calls
`GET /users/{username}/repos`, following pagination in batches of 100. It imports public,
non-disabled repositories, including forks and archived repositories, with descriptions,
languages, stars, and GitHub links. No GitHub token is needed. More than 10,000 entries
produces an explicit error. Rate-limit and username errors are shown without replacing
existing projects.

The import is saved and published with the website, rather than requested on every
visitor page load. Import and publish again to refresh it. Repository metadata is
imported; third-party source code is neither downloaded nor executed.

[GitHub API documentation](https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user)

### Doctena, Doctolib, jameda, Calendly, RA-MICRO, and advoware

You can configure a public booking or client-portal link immediately. The homepage CTA
and the contact area's appointment button lead to that provider. This is a **link
integration**, not direct synchronization with practice or law-firm software. Booking
availability is not simulated; patient and client records are not stored. Booking and
portal access remain with the provider.

[Doctolib website-button instructions](https://community.doctolib.de/t/aktualisieren-sie-ihren-website-button/45322)

Direct integrations require an enabled provider account and the API documentation for
that contract. Those credentials are not bundled with this project. Selecting a provider
alone does not activate a proprietary API.

### LinkedIn: profile link and optional OIDC import

A public profile link works immediately. To import the profile name, enable **Sign In
with LinkedIn using OpenID Connect** in your own LinkedIn application and configure:

```bash
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_REDIRECT_URI=http://localhost:4317/api/linkedin/callback
```

The redirect URI must exactly match the one registered with LinkedIn. Connect under
**Anbindungen**, then choose **Profilnamen übernehmen** (Use profile name). The callback
checks a single-use, expiring state tied to the admin session. Access tokens are kept
only in memory for the fetch. The name and optional image URL are cached server-side;
only the name is copied into the document, on an explicit click. OIDC does not provide
a full CV or work history. The application does not scrape profiles.

[LinkedIn OIDC documentation](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)

### General API bridge for professional software

A server-side import of public service descriptions is available for software with an
authorized API. Your own adapter must translate the provider's data into this format:

```json
{"services":[{"title":"Initial consultation","description":"Getting to know each other, 30 minutes."}]}
```

Configure the server environment:

```bash
BUSINESS_API_URL=https://your-adapter.example/public-services
BUSINESS_API_TOKEN=...
```

The server makes an HTTPS GET with an optional bearer token and a 15-second timeout,
validates the response, and provides **Leistungen importieren** (Import services) in the
admin. Importing replaces the draft's service descriptions. The URL is configured only
on the server; browsers cannot supply arbitrary endpoints or credentials. Do not send
patient files, diagnoses, legal case files, or confidential records to this adapter.
This is Klarwarg's adapter contract, not a claimed native provider API.

## Public website and search engines

The server renders the published site as **HTML without application JavaScript** through
`server/render.ts`. It uses the same `SiteSurface` component as the editor, with CSS for
canvas scaling and mobile layout. Visitors receive roughly 10 KB of HTML plus the
stylesheet instead of loading the entire editor application.

- Each page includes a title (`Name · Tagline`), description derived from the homepage's
  first body text, `lang="de"`, canonical URL, Open Graph metadata, and schema.org
  structured data for the selected profession and contact details. The first uploaded
  photo is used as the social preview image.
- `/impressum` and `/datenschutz` are dedicated legal pages with `noindex, follow`.
- `/robots.txt` and `/sitemap.xml` are generated. `/admin` and `/api/` are excluded from
  crawler access; the editor also uses `noindex`.
- Set `PUBLIC_ORIGIN` to generate correct canonical, sitemap, and preview-image URLs.

With `npm run dev`, Expo on port 8091 serves the application preview. The rendered
public HTML is served on port 4317. After `npm run build`, `npm start` also serves the
built editor at http://localhost:4317/admin.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run test:browser
```

Backend tests use temporary databases. Browser tests require an installed Chrome
(`/bin/google-chrome`, or set `CHROME_BIN`) and also use test data only. GitHub requests
are mocked in the browser test; backend tests cover pagination and errors. Screenshots
are written to `test-results/`.

Klarwarg is an **Expo web application**. Native iOS/Android editors are not implemented.
Cloud hosting, domain registration, and provider accounts are not provisioned by the
project. Publishing activates the site on the Klarwarg server you are running.

The product was renamed from Klarwerk to Klarwarg. Existing installations continue to use
`klarwerk.sqlite`, the existing session cookie and language preference, and
`KLARWERK_ADMIN_PASSWORD` for compatibility. Keep the existing data directory.

## Domain and page sections in the admin

Under **Settings → Own domain**, enter a domain such as `example.com` or
`https://example.com`. It is stored with the draft, included in JSON backups,
and becomes the canonical public origin when that draft is published. A profession/template
change retains the domain. Published
domain settings take precedence over `PUBLIC_ORIGIN` for canonical links, sitemap,
robots and preview metadata. Clearing the field restores the environment/request fallback.
This field does not configure DNS, nginx, HTTPS certificates or LinkedIn OAuth callbacks;
configure those on the hosting server as described above. In particular, keep
`PUBLIC_ORIGIN` configured for the active OAuth callback origin.

Under **Content → Page sections**, remove a canvas section or a fixed services,
projects or contact area using its remove button and confirmation dialog. All canvas
sections may be removed; adding a new element then creates a section automatically.
Changes affect the published site only after publishing and support Undo/Redo.
Fixed areas retain their data and can be reinserted from the same list. Removing a
canvas section deletes its blocks from the draft; Undo or restoring a published
version can recover it. The header and legal footer remain available.

## License

Copyright (C) 2026 Iris Perl

Klarwarg is free software: you can redistribute it and/or modify it under the terms of
the GNU Affero General Public License as published by the Free Software Foundation,
version 3 only. See [LICENSE](LICENSE).

If you run a modified version of Klarwarg as a network service, the AGPL requires you to
offer its users the corresponding source code (section 13).

Klarwarg is distributed WITHOUT ANY WARRANTY. Its templates for the legal notice
(Impressum) and privacy policy (Datenschutzerklärung) are not legal advice; check the
texts for your own situation.

The name "Klarwarg" and its logo are not covered by this license.
