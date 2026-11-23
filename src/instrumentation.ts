export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runMigrations } = await import("./db/migrate");
  await runMigrations();

  // Uploads the browser started but never finished. Failing here must not stop the site.
  try {
    const [{ getDb }, { getStorage }, { cleanupStalePhotos }] = await Promise.all([
      import("./db/client"),
      import("./storage/storage"),
      import("./posts/repo"),
    ]);
    const removed = await cleanupStalePhotos(getDb(), getStorage(), new Date());
    if (removed > 0) console.info("[startup] removed %d unfinished uploads", removed);
  } catch (error) {
    console.error("[startup] upload cleanup failed", error);
  }

  // Catch a wrong SMTP setting at deploy time, before a post's emails are lost. Logs `[smtp] ok` or the error.
  try {
    const [{ getEnv }, { checkSmtp, createMailer }] = await Promise.all([import("./env"), import("./notify/smtp")]);
    // Not awaited: an unreachable or slow SMTP server must not delay the site's start. checkSmtp never throws.
    void checkSmtp(createMailer(getEnv()));
  } catch (error) {
    console.error("[startup] SMTP check failed", error);
  }
}
