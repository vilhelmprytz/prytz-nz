"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/auth/auth-client";
import { REACTIONS } from "@/reactions/emoji";
import { toggleReactionAction } from "@/reactions/actions";
import { formatReactors, type ReactionSummary } from "@/reactions/summary";
import styles from "./feed.module.css";

function toggledLocally(list: ReactionSummary[], index: number): ReactionSummary[] {
  const emoji = REACTIONS[index];
  const current = list.find((r) => r.emoji === emoji);
  const next = current
    ? current.mine
      ? { ...current, count: current.count - 1, names: current.names.filter((n) => n !== "You"), mine: false }
      : { ...current, count: current.count + 1, names: ["You", ...current.names], mine: true }
    : { emoji, count: 1, names: ["You"], mine: true };
  const rest = list.filter((r) => r.emoji !== emoji);
  return REACTIONS.flatMap((e) => (e === emoji ? (next.count > 0 ? [next] : []) : rest.filter((r) => r.emoji === e)));
}

export function ReactionRow({
  postId,
  initial,
  signedIn,
  pendingReact,
}: {
  postId: string;
  initial: ReactionSummary[];
  signedIn: boolean;
  /** Set after the Google round trip: the reaction the reader tapped before signing in. */
  pendingReact?: number;
}) {
  const router = useRouter();
  const [summaries, setSummaries] = useState(initial);
  const busy = useRef(false);
  const pendingDone = useRef(false);

  async function react(index: number) {
    if (!signedIn) {
      await authClient.signIn.social({ provider: "google", callbackURL: `/?post=${postId}&react=${index}` });
      return;
    }
    if (busy.current) return;
    busy.current = true;
    const before = summaries;
    setSummaries(toggledLocally(before, index));
    try {
      const result = await toggleReactionAction(postId, index);
      if ("reactions" in result) setSummaries(result.reactions);
    } catch {
      setSummaries(before);
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    if (pendingReact === undefined || pendingDone.current) return;
    pendingDone.current = true;
    const alreadyMine = initial.some((r) => r.emoji === REACTIONS[pendingReact] && r.mine);
    const apply = alreadyMine
      ? Promise.resolve()
      : toggleReactionAction(postId, pendingReact).then((result) => {
          if ("reactions" in result) setSummaries(result.reactions);
        });
    void apply.catch(() => {}).finally(() => router.replace(`/?post=${postId}`, { scroll: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply the pending reaction once
  }, [pendingReact]);

  return (
    <div className={styles.reactions} data-testid="reactions">
      <div className={styles.reactionButtons}>
        {REACTIONS.map((emoji, index) => {
          const s = summaries.find((r) => r.emoji === emoji);
          return (
            <button
              key={emoji}
              type="button"
              aria-pressed={s?.mine ?? false}
              className={s?.mine ? styles.reactionMine : styles.reaction}
              onClick={() => void react(index)}
            >
              {emoji}
              {s && <span className={styles.reactionCount}>{s.count}</span>}
            </button>
          );
        })}
      </div>
      {summaries.length > 0 && (
        <ul className={styles.reactors}>
          {summaries.map((s) => (
            <li key={s.emoji}>
              <details>
                <summary>
                  {s.emoji} {formatReactors(s.names)}
                </summary>
                <p>{s.names.join(", ")}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
