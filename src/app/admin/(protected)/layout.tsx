import { requireAdminPage } from "@/auth/viewer";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdminPage();
  return children;
}
