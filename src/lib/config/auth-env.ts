export function getAuthSecret(): string {
  return process.env.AUTH_SECRET?.trim() || "agimi-dev-secret-change-in-production";
}

export function getAdminCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME?.trim() || "admin",
    password: process.env.ADMIN_PASSWORD?.trim() || "admin",
  };
}
