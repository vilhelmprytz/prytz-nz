import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer } from "@/auth/viewer";
import styles from "../admin.module.css";
import { LoginPanel } from "./LoginPanel";

export default async function AdminLoginPage() {
  const viewer = await getViewer(await headers());
  if (viewer.isAdmin) redirect("/admin");
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Posting</h1>
      <LoginPanel signedInEmail={viewer.user?.email ?? null} />
    </main>
  );
}
