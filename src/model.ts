import { z } from "zod";

export const fonts = [
  {
    id: "modern",
    name: "Modern",
    detail: "Klar & vertraut",
    value: "Arial, Helvetica, sans-serif",
  },
  {
    id: "editorial",
    name: "Editorial",
    detail: "Ruhig & persönlich",
    value: 'Georgia, "Times New Roman", serif',
  },
  {
    id: "humanist",
    name: "Humanistisch",
    detail: "Offen & freundlich",
    value: '"Trebuchet MS", Arial, sans-serif',
  },
  {
    id: "classic",
    name: "Klassisch",
    detail: "Zeitlos & seriös",
    value: '"Palatino Linotype", Palatino, Georgia, serif',
  },
  {
    id: "system",
    name: "System",
    detail: "Passt zu deinem Gerät",
    value: "system-ui, sans-serif",
  },
  {
    id: "mono",
    name: "Code",
    detail: "Technisch & direkt",
    value: '"Courier New", monospace',
  },
] as const;
export const colorNames = [
  "Hauptfarbe",
  "Akzent",
  "Hintergrund",
  "Flächen",
  "Text",
  "Dezenter Text",
];
export function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) =>
        v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
      );
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const palettes = [
  {
    name: "Salbei",
    colors: ["#315648", "#B9CFB4", "#F8F9F5", "#EDF1E9", "#223C32", "#5B6B60"],
  },
  {
    name: "Ozean",
    colors: ["#244B6A", "#BCD7E8", "#FAFCFD", "#EAF1F6", "#203345", "#526777"],
  },
  {
    name: "Terrakotta",
    colors: ["#8C4536", "#EAC1A5", "#FDF9F4", "#F4E9DF", "#422D29", "#75605B"],
  },
  {
    name: "Tinte",
    colors: ["#303641", "#C9C6EE", "#FAFAFC", "#EDEEF3", "#252932", "#626674"],
  },
];
const safeLink = z
  .string()
  .max(2000)
  .refine(
    (v) =>
      !v ||
      /^https:\/\//i.test(v) ||
      /^mailto:[^\s]+$/.test(v) ||
      /^tel:[+\d ()-]+$/.test(v) ||
      /^#[\w-]+$/.test(v),
    "Bitte HTTPS-Link, E-Mail, Telefonnummer oder Abschnitt wählen.",
  );
const imageSrc = z
  .string()
  .max(2000)
  .refine(
    (v) =>
      !v ||
      /^\/uploads\/[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(v) ||
      /^\/images\/[\w.-]+\.svg$/.test(v) ||
      /^https:\/\//i.test(v),
    "Ungültige Bildadresse",
  );
export const imageShapes = [
  { id: "rectangle", label: "Rechteck" },
  { id: "rounded", label: "Abgerundet" },
  { id: "arch", label: "Bogen" },
  { id: "oval", label: "Oval" },
  { id: "circle", label: "Kreis" },
] as const;
export const blockSchema = z.object({
  id: z.string().max(80),
  kind: z.enum(["eyebrow", "heading", "text", "image", "button"]),
  text: z.string().max(8000),
  src: imageSrc.default(""),
  alt: z.string().max(500).default(""),
  imageShape: z
    .enum(["rectangle", "rounded", "arch", "oval", "circle"])
    .default("arch"),
  href: safeLink.default(""),
  x: z.number().min(0).max(1200),
  y: z.number().min(0).max(3000),
  w: z.number().min(60).max(1200),
  h: z.number().min(30).max(1500),
  fontSize: z.number().min(12).max(96).default(18),
});
export const serviceSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(1500),
});
/** Wie die Website spricht: Besucher siezen oder duzen, als eine Person oder als Team. */
export const voiceSchema = z.object({ formal: z.boolean(), team: z.boolean() });
export type Voice = z.infer<typeof voiceSchema>;
export const domainSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value.includes("://") ? value : "https://" + value);
      return (
        url.protocol === "https:" &&
        url.hostname.includes(".") &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        !url.port
      );
    } catch {
      return false;
    }
  })
  .transform((value) =>
    value
      ? new URL(value.includes("://") ? value : "https://" + value).origin
      : "",
  )
  .default("");
export const siteSchema = z.object({
  domain: domainSchema,
  hiddenSections: z
    .array(z.enum(["services", "projects", "contact"]))
    .max(3)
    .default([]),
  language: z.enum(["de", "en"]).default("de"),
  name: z.string().min(1).max(120),
  profession: z.string().max(60),
  tagline: z.string().max(250),
  // Ältere Entwürfe kennen das Feld nicht; ihre Texte duzen und sprechen als eine Person.
  voice: voiceSchema.default({ formal: false, team: false }),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).length(6),
  font: z.enum([
    "modern",
    "editorial",
    "humanist",
    "classic",
    "system",
    "mono",
  ]),
  grid: z.object({
    columns: z.number().int().min(1).max(24),
    gap: z.number().min(0).max(80),
    row: z.number().min(4).max(100),
    snap: z.boolean(),
    show: z.boolean(),
  }),
  sections: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .max(80),
        label: z.string().min(1).max(80),
        height: z.number().min(160).max(3500),
        blocks: z.array(blockSchema).max(80),
      }),
    )
    .max(20),
  services: z.array(serviceSchema).max(100),
  contact: z.object({
    email: z
      .string()
      .max(200)
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)),
    phone: z.string().max(80),
    address: z.string().max(500),
  }),
  legal: z.object({
    imprint: z.string().max(15000),
    privacy: z.string().max(15000),
  }),
  integrations: z.object({
    provider: z.enum([
      "none",
      "doctena",
      "doctolib",
      "calendly",
      "ra-micro",
      "advoware",
      "jameda",
      "custom",
    ]),
    bookingUrl: safeLink,
    linkedinUrl: safeLink,
    appStoreUrl: z
      .string()
      .max(2000)
      .refine((value) => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            url.hostname === "apps.apple.com" &&
            !url.username &&
            !url.password
          );
        } catch {
          return false;
        }
      })
      .default(""),
    googlePlayUrl: z
      .string()
      .max(2000)
      .refine((value) => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            url.hostname === "play.google.com" &&
            !url.port &&
            !url.username &&
            !url.password
          );
        } catch {
          return false;
        }
      })
      .default(""),
    githubUser: z.string().max(39),
    showRepos: z.boolean(),
  }),
  repos: z
    .array(
      z.object({
        id: z.number(),
        name: z.string().max(200),
        description: z.string().max(1500),
        url: z.string().url().startsWith("https://github.com/"),
        language: z.string().max(100),
        stars: z.number(),
        fork: z.boolean(),
      }),
    )
    .max(10000),
});
export type Site = z.infer<typeof siteSchema>;
export type Block = z.infer<typeof blockSchema>;
/** Die Wörter, die sich mit Anrede und Sprecher ändern; großgeschrieben für Satzanfänge. */
export function words({ formal, team }: Voice) {
  return {
    du: formal ? "Sie" : "du",
    dich: formal ? "Sie" : "dich",
    dir: formal ? "Ihnen" : "dir",
    dein: formal ? "Ihr" : "dein",
    deine: formal ? "Ihre" : "deine",
    deinen: formal ? "Ihren" : "deinen",
    deinem: formal ? "Ihrem" : "deinem",
    deiner: formal ? "Ihrer" : "deiner",
    Dein: formal ? "Ihr" : "Dein",
    Deine: formal ? "Ihre" : "Deine",
    Mein: team ? "Unser" : "Mein",
    meine: team ? "unsere" : "meine",
  };
}
type Words = ReturnType<typeof words>;
type Copy = {
  tagline: string;
  eyebrow: string;
  headline: string;
  intro: string;
};
/** Platzhalter in Texten für den Namen aus „Header & Kontaktdaten“. */
export const namePlaceholder = "{name}";
export const fillName = (text: string, name: string) =>
  text.split(namePlaceholder).join(name);
/**
 * Berufsvorlagen. Die Texte entstehen erst mit der Anrede (`voice` ist die Vorbelegung), damit
 * ein Umschalten die noch unveränderten Vorlagentexte mitnehmen kann (siehe `changeVoice`).
 * Leistungen sind ohne Anrede formuliert und gelten für beide.
 */
export const careers = [
  {
    id: "psychiatry",
    name: "Psychiatrie",
    category: "Gesundheit",
    symbol: "✳",
    person: "Dr. Anna Berger",
    voice: { formal: true, team: false },
    copy: (w: Words, { team }: Voice): Copy => ({
      tagline: "Fachärztin für Psychiatrie & Psychotherapie",
      eyebrow: `Raum für ${w.dich}. Zeit für Veränderung.`,
      headline: `Ein guter Anfang.\nFür ${w.dein} Wohlbefinden.`,
      intro: `Manchmal braucht es einen neuen Blick. ${team ? "Wir begleiten" : "Ich begleite"} ${w.dich} mit Zeit, Verständnis und einem offenen Ohr – auf ${w.deinem} ganz persönlichen Weg.`,
    }),
    cta: "Erstgespräch vereinbaren",
    services: [
      {
        title: "Psychiatrische Begleitung",
        description:
          "Diagnostik, Behandlung und Begleitung bei psychischen Belastungen und Erkrankungen, wenn nötig auch mit Medikamenten.",
      },
      {
        title: "Psychotherapie",
        description:
          "Gespräche, die entlasten und neue Wege eröffnen. In einem verlässlichen, geschützten Rahmen.",
      },
      {
        title: "Beratung & Prävention",
        description:
          "Frühzeitig hinschauen, bevor die Belastung zu groß wird. Auch für Angehörige.",
      },
    ],
    provider: "doctena",
  },
  {
    id: "medicine",
    name: "Arztpraxis",
    category: "Gesundheit",
    symbol: "＋",
    person: "Praxis Dr. Berger",
    voice: { formal: true, team: true },
    copy: (w: Words, { team }: Voice): Copy => ({
      tagline: `Allgemeinmedizin · Persönlich für ${w.dich} da`,
      eyebrow: `${w.Deine} Gesundheit in guten Händen.`,
      headline: "Medizin mit Zeit.\nUnd einem offenen Ohr.",
      intro: `${team ? "Wir begleiten" : "Ich begleite"} ${w.dich} persönlich und auf Augenhöhe. Von der Vorsorge bis zur Behandlung ${team ? "nehmen wir uns" : "nehme ich mir"} Zeit für das, was ${w.dir} wichtig ist.`,
    }),
    cta: "Termin vereinbaren",
    services: [
      {
        title: "Allgemeinmedizin",
        description:
          "Die erste Anlaufstelle bei Beschwerden, Infekten und chronischen Erkrankungen.",
      },
      {
        title: "Vorsorge & Check-up",
        description:
          "Gesundheits-Check, Impfungen und Früherkennung, damit nichts übersehen wird.",
      },
      {
        title: "Persönliche Beratung",
        description:
          "Zeit für Fragen zu Befunden, Behandlung und den nächsten Schritten.",
      },
    ],
    provider: "doctena",
  },
  {
    id: "law",
    name: "Rechtsanwaltskanzlei",
    category: "Recht & Finanzen",
    symbol: "§",
    person: "Kanzlei Berger",
    voice: { formal: true, team: true },
    copy: (w: Words, { team }: Voice): Copy => ({
      tagline: "Rechtsberatung mit Klarheit und Weitblick",
      eyebrow: `${w.Dein} Anliegen. ${w.Mein} Einsatz.`,
      headline: `Klarheit schaffen.\n${w.Dein} Recht vertreten.`,
      intro: `${team ? "Wir machen" : "Ich mache"} komplexe Fragen verständlich und ${team ? "setzen uns" : "setze mich"} für eine passende Lösung ein. Persönlich, vorausschauend und an ${w.deiner} Seite.`,
    }),
    cta: "Erstberatung anfragen",
    services: [
      {
        title: "Vertragsrecht",
        description:
          "Verträge prüfen, verhandeln und gestalten, bevor aus Unklarheit ein Streit wird.",
      },
      {
        title: "Arbeitsrecht",
        description:
          "Beratung und Vertretung bei Kündigung, Abmahnung, Aufhebungsvertrag und Zeugnis.",
      },
      {
        title: "Rechtliche Beratung",
        description:
          "Eine klare Einschätzung der Lage und der Möglichkeiten, verständlich erklärt.",
      },
    ],
    provider: "ra-micro",
  },
  {
    id: "developer",
    name: "Softwareentwicklung",
    category: "Digital & Kreativ",
    symbol: "⌘",
    person: "Alex Berger",
    voice: { formal: false, team: false },
    copy: (_w: Words, { team }: Voice): Copy => ({
      tagline: "Softwareentwickler · Ideen werden Wirklichkeit",
      eyebrow: "Von der Idee zum Produkt.",
      headline: "Gute Ideen.\nSauber entwickelt.",
      intro: `${team ? "Wir entwickeln" : "Ich entwickle"} digitale Produkte, die Menschen gerne benutzen. Von der ersten Skizze bis zur zuverlässigen Anwendung.`,
    }),
    cta: "Projekt besprechen",
    services: [
      {
        title: "Webentwicklung",
        description:
          "Schnelle, barrierearme Websites und Webanwendungen, die mit dem Bedarf wachsen.",
      },
      {
        title: "Apps & Schnittstellen",
        description:
          "Mobile Apps und saubere Schnittstellen, die bestehende Systeme verbinden.",
      },
      {
        title: "Technische Beratung",
        description:
          "Architektur, Code-Review und eine ehrliche Einschätzung, was sich lohnt.",
      },
    ],
    provider: "calendly",
  },
  {
    id: "therapy",
    name: "Psychotherapie",
    category: "Gesundheit",
    symbol: "♡",
    person: "Praxis Berger",
    voice: { formal: true, team: false },
    copy: (w: Words, { formal }: Voice): Copy => ({
      tagline: "Psychotherapie & persönliche Entwicklung",
      eyebrow: formal
        ? "Sie müssen nicht alles alleine schaffen."
        : "Du musst nicht alles alleine schaffen.",
      headline: "In Ruhe ankommen.\nNeue Wege entdecken.",
      intro: `Ein geschützter Raum für ${w.deine} Gedanken, Gefühle und Fragen. Gemeinsam entdecken wir, was ${w.dich} stärkt und weiterbringt.`,
    }),
    cta: "Kennenlernen vereinbaren",
    services: [
      {
        title: "Einzeltherapie",
        description:
          "Regelmäßige Gespräche in einem geschützten Rahmen, im eigenen Tempo.",
      },
      {
        title: "Begleitung in Krisen",
        description:
          "Halt und Orientierung, wenn das Leben plötzlich aus dem Gleichgewicht gerät.",
      },
      {
        title: "Selbstfürsorge",
        description:
          "Wege finden, gut mit Stress und Erschöpfung umzugehen und wieder Kraft zu schöpfen.",
      },
    ],
    provider: "doctena",
  },
  {
    id: "physio",
    name: "Physiotherapie",
    category: "Gesundheit",
    symbol: "↗",
    person: "Bewegungsraum Berger",
    voice: { formal: true, team: true },
    copy: (w: Words, { team }: Voice): Copy => ({
      tagline: "Physiotherapie · Wieder in Bewegung",
      eyebrow: "Mehr Bewegung. Mehr Leben.",
      headline: `Schritt für Schritt.\nZurück zu ${w.dir}.`,
      intro: `Mit einem individuellen Blick auf ${w.deinen} Körper ${team ? "begleiten wir" : "begleite ich"} ${w.dich} zu mehr Beweglichkeit und Wohlbefinden.`,
    }),
    cta: "Termin vereinbaren",
    services: [
      {
        title: "Physiotherapie",
        description:
          "Behandlung nach Verletzungen und Operationen und bei Schmerzen im Alltag.",
      },
      {
        title: "Bewegung & Training",
        description:
          "Gezielte Übungen für Kraft, Beweglichkeit und Ausdauer, auch für zu Hause.",
      },
      {
        title: "Prävention",
        description:
          "Rückenschule und Haltungstraining, damit Beschwerden gar nicht erst entstehen.",
      },
    ],
    provider: "doctolib",
  },
  {
    id: "tax",
    name: "Steuerberatung",
    category: "Recht & Finanzen",
    symbol: "%",
    person: "Steuerberatung Berger",
    voice: { formal: true, team: false },
    copy: (w: Words, { team }: Voice): Copy => ({
      tagline: `${w.Deine} Zahlen. Ein klarer Überblick.`,
      eyebrow: `Mehr Zeit für ${w.dein} Unternehmen.`,
      headline: "Zahlen verstehen.\nZukunft gestalten.",
      intro: `${team ? "Wir bringen" : "Ich bringe"} Ordnung in ${w.deine} Finanzen und ${team ? "unterstützen" : "unterstütze"} ${w.dich} bei steuerlichen Fragen. Verständlich, strukturiert und persönlich.`,
    }),
    cta: "Beratung anfragen",
    services: [
      {
        title: "Steuerberatung",
        description:
          "Steuererklärungen, steuerliche Gestaltung und Begleitung bei Fragen des Finanzamts.",
      },
      {
        title: "Buchhaltung",
        description:
          "Laufende Buchführung, Lohnabrechnung und Abschlüsse, pünktlich und nachvollziehbar.",
      },
      {
        title: "Gründungsberatung",
        description:
          "Rechtsform, Businessplan und steuerlicher Start, gut vorbereitet von Anfang an.",
      },
    ],
    provider: "calendly",
  },
  {
    id: "architecture",
    name: "Architektur",
    category: "Digital & Kreativ",
    symbol: "⌂",
    person: "Studio Berger",
    voice: { formal: true, team: true },
    copy: (w: Words, { team }: Voice): Copy => ({
      tagline: "Architektur & Räume mit Persönlichkeit",
      eyebrow: `Räume, die zu ${w.dir} passen.`,
      headline: "Raum für Ideen.\nOrte zum Bleiben.",
      intro: `${team ? "Wir gestalten" : "Ich gestalte"} durchdachte Räume für Menschen. Mit Gespür für Material, Licht und die Besonderheiten eines Ortes.`,
    }),
    cta: "Vorhaben besprechen",
    services: [
      {
        title: "Entwurf & Planung",
        description:
          "Vom ersten Entwurf bis zur Genehmigungsplanung, mit Blick auf Ort und Budget.",
      },
      {
        title: "Umbau & Sanierung",
        description:
          "Bestand erhalten, Räume neu denken und energetisch auf den heutigen Stand bringen.",
      },
      {
        title: "Innenarchitektur",
        description:
          "Licht, Material und Möbel, die zusammenpassen und lange Freude machen.",
      },
    ],
    provider: "calendly",
  },
  {
    id: "coaching",
    name: "Coaching & Beratung",
    category: "Beratung",
    symbol: "☀",
    person: "Anna Berger",
    voice: { formal: false, team: false },
    copy: (w: Words, { formal, team }: Voice): Copy => ({
      tagline: `Coaching für ${w.deinen} nächsten Schritt`,
      eyebrow: `Neue Perspektiven beginnen bei ${w.dir}.`,
      headline: `${w.Dein} nächster Schritt.\nMit einem klaren Blick.`,
      intro: `${team ? "Wir begleiten" : "Ich begleite"} ${w.dich} bei Veränderungen und Entscheidungen. Gemeinsam finden wir heraus, was ${w.dir} wichtig ist und wie ${formal ? "Sie dorthin kommen" : "du dorthin kommst"}.`,
    }),
    cta: "Kennenlernen buchen",
    services: [
      {
        title: "Persönliches Coaching",
        description:
          "Einzelgespräche für mehr Klarheit bei Entscheidungen und Veränderungen.",
      },
      {
        title: "Berufliche Orientierung",
        description:
          "Stärken erkennen, Möglichkeiten sortieren und den nächsten Schritt planen.",
      },
      {
        title: "Workshops",
        description:
          "Formate für Teams, die gemeinsam an Zusammenarbeit und Zielen arbeiten.",
      },
    ],
    provider: "calendly",
  },
  {
    id: "craft",
    name: "Handwerk & Service",
    category: "Handwerk",
    symbol: "⚒",
    person: "Berger Handwerk",
    voice: { formal: false, team: true },
    copy: (w: Words, { team }: Voice): Copy => ({
      tagline: "Gute Arbeit. Persönlich und zuverlässig.",
      eyebrow: `${w.Deine} Ideen. ${w.Mein} Handwerk.`,
      headline: "Mit Herz geplant.\nMit Sorgfalt gemacht.",
      intro: `Von der ersten Idee bis zum letzten Handgriff: ${team ? "Wir kümmern uns" : "Ich kümmere mich"} um ${w.dein} Projekt. Verlässlich, transparent und mit Liebe zum Detail.`,
    }),
    cta: "Angebot anfragen",
    services: [
      {
        title: "Planung & Beratung",
        description:
          "Vor Ort anschauen, ehrlich beraten und ein klares Angebot machen.",
      },
      {
        title: "Umsetzung",
        description:
          "Saubere Ausführung mit festen Ansprechpartnern und verlässlichen Terminen.",
      },
      {
        title: "Wartung & Service",
        description:
          "Regelmäßige Pflege und schnelle Hilfe, wenn doch einmal etwas klemmt.",
      },
    ],
    provider: "custom",
  },
] as const;
export function uid() {
  if (typeof globalThis.crypto.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  // HTTP LAN origins lack randomUUID, but still provide secure random bytes.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function createBlock(
  kind: Block["kind"],
  overrides: Partial<Block> = {},
): Block {
  return {
    id: uid(),
    kind,
    text:
      kind === "heading"
        ? "Deine Überschrift"
        : kind === "button"
          ? "Mehr erfahren"
          : "Hier ist Platz für deinen Text.",
    x: 64,
    y: 64,
    w: 440,
    h: kind === "image" ? 320 : kind === "heading" ? 140 : 100,
    src: kind === "image" ? "/images/studio.svg" : "",
    alt: kind === "image" ? "Heller Raum mit Pflanzen" : "",
    imageShape: "arch",
    href: kind === "button" ? "#kontakt" : "",
    fontSize: kind === "heading" ? 48 : 18,
    ...overrides,
  };
}
export function createSite(profession = "psychiatry", voice?: Voice): Site {
  const c = careers.find((c) => c.id === profession) || careers[0];
  const v = voice || c.voice,
    copy = c.copy(words(v), v);
  return siteSchema.parse({
    name: c.person,
    profession: c.id,
    tagline: copy.tagline,
    voice: v,
    colors: [...palettes[0].colors],
    font: "editorial",
    grid: { columns: 12, gap: 16, row: 16, snap: true, show: false },
    sections: [
      {
        id: "start",
        label: "Start",
        height: 650,
        blocks: [
          createBlock("eyebrow", {
            text: copy.eyebrow.toUpperCase(),
            x: 64,
            y: 68,
            w: 510,
            h: 44,
            fontSize: 12,
          }),
          createBlock("heading", {
            text: copy.headline,
            x: 64,
            y: 140,
            w: 540,
            h: 180,
            fontSize: 56,
          }),
          createBlock("text", {
            text: copy.intro,
            x: 64,
            y: 336,
            w: 470,
            h: 110,
            fontSize: 18,
          }),
          createBlock("button", { text: c.cta, x: 64, y: 470, w: 300, h: 56 }),
          createBlock("image", {
            text: "",
            src: "/images/studio.svg",
            alt: "Ein heller, ruhiger Raum mit Pflanzen und einem Sessel",
            x: 664,
            y: 40,
            w: 472,
            h: 540,
          }),
        ],
      },
      {
        id: "ueber-mich",
        label: v.team ? "Über uns" : "Über mich",
        height: 350,
        blocks: [
          createBlock("eyebrow", {
            text: "PERSÖNLICH. AUF AUGENHÖHE.",
            x: 64,
            y: 48,
            w: 500,
            h: 40,
            fontSize: 12,
          }),
          createBlock("heading", {
            text: v.formal
              ? "Schön, dass Sie da sind."
              : "Gut, dass du da bist.",
            x: 64,
            y: 110,
            w: 500,
            h: 100,
            fontSize: 40,
          }),
          createBlock("text", {
            text: aboutText(v),
            x: 640,
            y: 88,
            w: 496,
            h: 240,
          }),
        ],
      },
    ],
    services: c.services.map((s) => ({ ...s })),
    contact: { email: "", phone: "", address: "" },
    legal: { imprint: "", privacy: "" },
    integrations: {
      provider: c.provider,
      bookingUrl: "",
      linkedinUrl: "",
      appStoreUrl: "",
      googlePlayUrl: "",
      githubUser: "",
      showRepos: true,
    },
    repos: [],
  });
}
/** Vorstellung im Abschnitt „Über mich“. Der zweite Absatz richtet sich an die Betreiber und duzt immer. */
function aboutText({ formal, team }: Voice) {
  const w = words({ formal, team });
  const welcome = `Willkommen bei ${namePlaceholder}. ${team ? "Uns" : "Mir"} ist wichtig, dass ${formal ? "Sie sich gut aufgehoben fühlen" : "du dich gut aufgehoben fühlst"}. ${team ? "Wir nehmen uns" : "Ich nehme mir"} Zeit für ${w.deine} Fragen und ${team ? "finden" : "finde"} gemeinsam mit ${formal ? "Ihnen" : "dir"} einen Weg, der zu ${w.dir} passt.`;
  return (
    welcome +
    (team
      ? "\n\nErzähle hier mehr über euer Team, eure Erfahrung und was eure Arbeit besonders macht."
      : "\n\nErzähle hier mehr über dich, deine Erfahrung und was deine Arbeit besonders macht.")
  );
}
/**
 * Anrede wechseln. Texte, die noch genau so in der Vorlage stehen, gehen mit; selbst geschriebene
 * bleiben, wie sie sind (`otherAddress` findet sie).
 */
export function changeVoice(site: Site, voice: Voice): Site {
  const before = createSite(site.profession, site.voice),
    after = createSite(site.profession, voice);
  const swap = new Map([[before.tagline, after.tagline]]);
  before.sections.forEach((s, i) => {
    swap.set(s.label, after.sections[i].label);
    s.blocks.forEach((b, j) =>
      swap.set(b.text, after.sections[i].blocks[j].text),
    );
  });
  const pick = (text: string) => swap.get(text) ?? text;
  return {
    ...site,
    voice,
    tagline: pick(site.tagline),
    sections: site.sections.map((s) => ({
      ...s,
      label: pick(s.label),
      blocks: s.blocks.map((b) => ({ ...b, text: pick(b.text) })),
    })),
  };
}
const informal = /\b(du|dich|dir|dein(e[mnrs]?)?|euch|euer|eure[mnrs]?)\b/i,
  formal = /\b(Ihnen|Ihr(e[mnrs]?)?)\b/;
/** Texte, in denen noch die jeweils andere Anrede steht. Grob, aber dafür gedacht, nachzusehen. */
export function otherAddress(site: Site) {
  const pattern = site.voice.formal ? informal : formal;
  return {
    blocks: site.sections.flatMap((s) =>
      s.blocks
        .filter((b) => b.kind !== "image" && pattern.test(b.text))
        .map((b) => ({ section: s.id, block: b.id })),
    ),
    tagline: pattern.test(site.tagline),
    services: site.services.filter((s) =>
      pattern.test(s.title + " " + s.description),
    ).length,
  };
}
export function snapBlock(block: Block, site: Site): Block {
  const width = 1200,
    { columns, gap, row, snap } = site.grid;
  const step = (width + gap) / columns;
  const x = Math.min(
    width - block.w,
    Math.max(0, snap ? Math.round(block.x / step) * step : block.x),
  );
  return {
    ...block,
    x: Math.round(x),
    y: Math.round(
      Math.max(0, snap ? Math.round(block.y / row) * row : block.y),
    ),
  };
}

/** Keep generated links usable when a destination area has been removed. */
function availableAnchor(href: string, site: Site): boolean {
  if (href === "#site-content") return true;
  if (href === "#kontakt") return !site.hiddenSections.includes("contact");
  if (href === "#leistungen") return !site.hiddenSections.includes("services");
  if (href === "#projekte")
    return (
      !site.hiddenSections.includes("projects") &&
      site.integrations.showRepos &&
      site.repos.length > 0
    );
  return site.sections.some((section) => "#" + section.id === href);
}
export function contactLink(site: Site): string {
  if (!site.hiddenSections.includes("contact")) return "#kontakt";
  const booking = site.integrations.bookingUrl;
  if (booking && (!booking.startsWith("#") || availableAnchor(booking, site)))
    return booking;
  return site.contact.email
    ? "mailto:" + site.contact.email
    : site.contact.phone
      ? "tel:" + site.contact.phone.replace(/[^+\d]/g, "")
      : "";
}
export function resolveSiteLink(href: string, site: Site): string {
  if (href === "#kontakt") return contactLink(site);
  if (href === "#leistungen")
    return site.hiddenSections.includes("services") ? "" : href;
  if (href === "#projekte")
    return site.hiddenSections.includes("projects") ||
      !site.integrations.showRepos ||
      !site.repos.length
      ? ""
      : href;
  if (
    href.startsWith("#") &&
    href !== "#site-content" &&
    !site.sections.some((section) => "#" + section.id === href)
  )
    return "";
  return href;
}
