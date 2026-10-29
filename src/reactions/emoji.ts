export const REACTIONS = ["❤️", "👍", "😂", "😮", "🙌"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const isReaction = (value: string): value is Reaction => (REACTIONS as readonly string[]).includes(value);
