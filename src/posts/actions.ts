"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { assertAdmin } from "@/auth/viewer";
import { getDb } from "@/db/client";
import { getEnv } from "@/env";
import { announceNewPost } from "@/notify/announce";
import { sendDepsFromEnv, sendNewPostEmails } from "@/notify/send";
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
  const admin = await assertAdmin();
  const db = getDb();
  const now = new Date();
  const result = await repo.setPublished(db, id, true, now);
  if (result.ok) {
    const post = await announceNewPost(db, { postId: id, adminUserId: admin.id, now });
    // Emails go out after the response, so publishing stays instant and can't fail because of SMTP.
    if (post) after(() => sendNewPostEmails(sendDepsFromEnv(db, getEnv()), post));
  }
  return result;
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
