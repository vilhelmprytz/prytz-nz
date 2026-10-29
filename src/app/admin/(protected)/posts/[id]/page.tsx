import { notFound } from "next/navigation";
import { PostEditor } from "@/components/admin/PostEditor";
import { getDb } from "@/db/client";
import { getPostForEdit } from "@/posts/repo";

export default async function EditPostPage({ params }: PageProps<"/admin/posts/[id]">) {
  const { id } = await params;
  const post = /^[0-9a-f-]{36}$/i.test(id) ? await getPostForEdit(getDb(), id) : null;
  if (!post) notFound();
  return <PostEditor initial={post} />;
}
