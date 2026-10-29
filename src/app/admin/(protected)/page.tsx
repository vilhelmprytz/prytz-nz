import Link from "next/link";
import { requireAdminPage } from "@/auth/viewer";
import { getDb } from "@/db/client";
import { createDraftAction } from "@/posts/actions";
import { formatPostDate } from "@/posts/format";
import { listAdminPosts } from "@/posts/repo";
import styles from "../admin.module.css";

export default async function AdminHome() {
  await requireAdminPage();
  const rows = await listAdminPosts(getDb());
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Posts</h1>
        <Link href="/" className={styles.link}>
          View site
        </Link>
      </div>
      <form action={createDraftAction}>
        <button type="submit" className={styles.button}>
          New post
        </button>
      </form>
      {rows.length === 0 ? (
        <p className={styles.muted}>Nothing yet. Your first post starts with the button above.</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/posts/${r.id}`} className={styles.row}>
                <span className={styles.rowTitle}>{r.title || "Untitled draft"}</span>
                <span className={styles.rowMeta}>
                  {r.takenAtLocal ? formatPostDate(r.takenAtLocal) : "No date"} · {r.photoCount}{" "}
                  {r.photoCount === 1 ? "photo" : "photos"}
                </span>
                <span className={r.status === "published" ? styles.badgePublished : styles.badgeDraft}>
                  {r.status === "published" ? "Published" : "Draft"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
