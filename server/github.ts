import type { Site } from "../src/model.ts";
export async function githubRepos(
  username: string,
  request: typeof fetch = fetch,
): Promise<Site["repos"]> {
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username))
    throw new Error("Bitte einen gültigen GitHub-Benutzernamen eingeben.");
  const repos: Site["repos"] = [];
  for (let page = 1; page <= 100; page++) {
    const response = await request(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=owner&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Klarwerk-Website-Builder",
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 404
          ? "GitHub-Benutzer nicht gefunden."
          : response.status === 403 || response.status === 429
            ? "GitHub-Anfragelimit erreicht. Bitte später erneut versuchen."
            : "GitHub ist gerade nicht erreichbar.",
      );
    const list = await response.json();
    if (!Array.isArray(list)) throw new Error("Unerwartete GitHub-Antwort.");
    for (const r of list) {
      if (!r.private && !r.disabled)
        repos.push({
          id: r.id,
          name: r.name,
          description: (r.description || "").slice(0, 1500),
          url: r.html_url,
          language: r.language || "",
          stars: r.stargazers_count || 0,
          fork: !!r.fork,
        });
    }
    if (list.length < 100) return repos;
  }
  throw new Error(
    "Mehr als 10.000 Repositories. Bitte ein kleineres GitHub-Profil verwenden.",
  );
}
