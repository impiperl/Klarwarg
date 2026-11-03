// Liest eine `.env` im Arbeitsverzeichnis, falls es eine gibt. Schon gesetzte Variablen
// (Shell, Container, Dienst) haben Vorrang — Node überschreibt sie nicht.
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
