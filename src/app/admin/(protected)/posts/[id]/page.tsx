import { notFound } from "next/navigation";
import { requireAdminPage } from "@/auth/viewer";
import { PostEditor } from "@/components/admin/PostEditor";
import { getDb } from "@/db/client";
import { getPostForEdit } from "@/posts/repo";

export default async function EditPostPage({ params }: PageProps<"/admin/posts/[id]">) {
  // Pages render in parallel with the layout, so each one checks before loading data.
  await requireAdminPage();
  const { id } = await params;
  const post = /^[0-9a-f-]{36}$/i.test(id) ? await getPostForEdit(getDb(), id) : null;
  if (!post) notFound();
  return <PostEditor initial={post} />;
}
