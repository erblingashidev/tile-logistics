import type { ClientFinanceProfile } from "@/components/administration/AdministrationClientFinance";

export type DebtInvoiceLine = {
  clientKey: string;
  displayName: string;
  invoiceNumber: string;
  balanceDueCents: number;
  invoicedCents: number;
  orderDate: string;
  daysOutstanding: number;
  salesEmployeeId: number | null;
  salesAgentName: string;
  orderStatus: string | null;
  location: string | null;
  settlementStatus: string | null;
  paymentMethodRaw: string | null;
  paymentMethod: string | null;
  settlementPaidAmountCents: number | null;
  prodataTransactionDate: string | null;
};

export type AgentDebtGroup = {
  salesEmployeeId: number | null;
  salesAgentName: string;
  totalDueCents: number;
  overdueDueCents: number;
  clientCount: number;
  items: DebtInvoiceLine[];
};

export type ReceivablesSummary = {
  totalDebtCents: number;
  openInvoiceCount: number;
  clientsWithDebt: number;
  totalInvoicedCents: number;
  totalPaidOnInvoicesCents: number;
  overdue14Count: number;
  overdue14Cents: number;
};

export type FinanceDebtsPayload = {
  summary: ReceivablesSummary;
  debts: ClientFinanceProfile[];
  callList: ClientFinanceProfile[];
  openDebtInvoices: DebtInvoiceLine[];
  debtsByAgent: AgentDebtGroup[];
  overdueDebts: DebtInvoiceLine[];
  overdueByAgent: AgentDebtGroup[];
};
