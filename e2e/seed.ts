import { readFileSync } from "node:fs";
import { SEED_FILE } from "./env";

export type SeedIds = {
  stockholm: string;
  landed: string;
  museum: string;
  auckland: string;
  draft: string;
  draftPhoto: string;
};

/** Ids written by seed.setup.ts. */
export function seedIds(): SeedIds {
  return JSON.parse(readFileSync(SEED_FILE, "utf8")) as SeedIds;
}
