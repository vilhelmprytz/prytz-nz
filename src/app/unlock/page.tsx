import { UnlockForm } from "./UnlockForm";
import styles from "./unlock.module.css";

export default async function UnlockPage({ searchParams }: PageProps<"/unlock">) {
  const { next } = await searchParams;
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Vilhelm&apos;s trip</h1>
        <p className={styles.subtitle}>Around the globe · 2026</p>
        <UnlockForm next={typeof next === "string" ? next : "/"} />
      </div>
    </main>
  );
}
