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
}
