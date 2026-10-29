/** The single admin: a verified Google email matching ADMIN_EMAIL. */
export function isAdminUser(user: { email: string; emailVerified: boolean } | null, adminEmail: string): boolean {
  if (!user || !user.emailVerified) return false;
  return user.email.trim().toLowerCase() === adminEmail.trim().toLowerCase();
}
