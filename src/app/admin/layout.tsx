/** The site is in Swedish for readers; the admin pages stay in English. */
export default function AdminLanguageLayout({ children }: LayoutProps<"/admin">) {
  return <div lang="en">{children}</div>;
}
