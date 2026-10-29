"use server";

import { redirect } from "next/navigation";
import { assertAdmin } from "@/auth/viewer";
import { getDb } from "@/db/client";
import { getStorage } from "@/storage/storage";
import * as repo from "./repo";
import type { PostFieldsInput } from "./types";

export async function createDraftAction(): Promise<never> {
  await assertAdmin();
  const id = await repo.createDraft(getDb());
  redirect(`/admin/posts/${id}`);
}

export async function savePostAction(id: string, input: PostFieldsInput): Promise<void> {
  await assertAdmin();
  await repo.savePostFields(getDb(), id, input);
}

export async function publishAction(id: string) {
  await assertAdmin();
  return repo.setPublished(getDb(), id, true, new Date());
}

export async function unpublishAction(id: string) {
  await assertAdmin();
  return repo.setPublished(getDb(), id, false, new Date());
}

export async function deletePostAction(id: string): Promise<never> {
  await assertAdmin();
  await repo.deletePost(getDb(), getStorage(), id);
  redirect("/admin");
}

export async function removePhotoAction(photoId: string): Promise<void> {
  await assertAdmin();
  await repo.removePhoto(getDb(), getStorage(), photoId);
}
