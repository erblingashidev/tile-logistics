import { redirect } from "next/navigation";

/** Legacy route — client debts live under Finance. */
export default function AdministrationClientsRedirectPage() {
  redirect("/administration/finance/debts/by-client");
}
