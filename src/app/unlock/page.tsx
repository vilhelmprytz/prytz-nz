import { SITE_SUBTITLE, SITE_TITLE } from "@/site";
import { UnlockForm } from "./UnlockForm";
import styles from "./unlock.module.css";

export default async function UnlockPage({ searchParams }: PageProps<"/unlock">) {
  const { next } = await searchParams;
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{SITE_TITLE}</h1>
        <p className={styles.subtitle}>{SITE_SUBTITLE}</p>
        <UnlockForm next={typeof next === "string" ? next : "/"} />
      </div>
    </main>
  );
}
