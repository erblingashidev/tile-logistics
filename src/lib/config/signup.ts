/** When false (default), /signup is hidden and signup API returns 403. Platform admin creates companies via approval flow only. */
export function isPublicCompanySignupEnabled(): boolean {
  return process.env.ALLOW_PUBLIC_COMPANY_SIGNUP === "true";
}
