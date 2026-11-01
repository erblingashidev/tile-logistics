import { redirect } from "next/navigation";
import { isPublicCompanySignupEnabled } from "@/lib/config/signup";

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isPublicCompanySignupEnabled()) {
    redirect("/login");
  }
  return children;
}
