import { BRAND } from "@/lib/brand";

/** English UI strings (admin, cashier, login, settings). */
export const en = {
  lang: {
    label: "Language",
    en: "English",
    sq: "Albanian",
    saved: "Language updated",
  },
  common: {
    appTagline: BRAND.tagline,
    logout: "Log out",
    loading: "Loading…",
    save: "Save",
    cancel: "Cancel",
    clear: "Clear",
    apply: "Apply",
    search: "Search",
    back: "Back",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    switchCompany: "Switch company",
    operatorMode: "Operator mode",
  },
  login: {
    title: "Sign in",
    subtitle: "Existing accounts — warehouse, drivers, admin",
    existingAccount: "Enter your username and password.",
    usernameHint: "Usernames are not case-sensitive.",
    username: "Username",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    failed: "Sign-in failed",
    required: "Enter username and password",
    invalid: "Invalid username or password",
    connect: "Could not connect. Try again.",
  },
  nav: {
    groups: {
      operations: "Operations",
      fleet: "Fleet",
      people: "People",
      warehouse: "Warehouse",
      administration: "Administration",
      system: "System",
      invoicingOffice: "Invoicing office",
    },
    items: {
      dashboard: "Dashboard",
      orders: "Orders",
      ordersInvoices: "Orders & invoices",
      returns: "Returns",
      dispatch: "Dispatch",
      map: "Map",
      vehicles: "Vehicles",
      maintenance: "Maintenance",
      employees: "Employees",
      admins: "Admins",
      cashRegister: "Cash register",
      financeReports: "Finance reports",
      openDebts: "Open debts",
      debtsByAgent: "Debts by agent",
      debtsByClient: "Debts by client",
      registerLedger: "Register & ledger",
      financeImport: "Finance import",
      paymentStatus: "MENYRA E PAGESES",
      assignmentQueue: "To assign",
      reports: "Reports",
      logs: "Logs",
      settings: "Settings",
      companies: "Companies",
      signupQueue: "Signup queue",
    },
    warehouse: {
      "/warehouse": "Overview",
      "/warehouse/unload": "Unloading",
      "/warehouse/mapping": "Mapping",
      "/warehouse/stock": "Stock levels",
      "/warehouse/products": "Product lots",
      "/warehouse/locations": "Rows & sectors",
      "/warehouse/inventory": "Annual inventory",
      "/warehouse/reports": "Reports",
    },
  },
  settings: {
    title: "Settings",
    loading: "Loading settings…",
    languageSection: "Language",
    languageHint: "Applies to admin, cashier, login, and warehouse portal.",
    administration: {
      section: "Administration",
      cashRegisterRules: "Cash register rules",
      strictTraceability: "Strict traceability on cash register",
      strictDesc:
        "Require invoice/receipt on every line; customer + sales agent on payments and refunds.",
      strictOn: "Strict",
      relaxed: "Relaxed",
      strictHelp:
        "Finance debts and call lists always require invoice numbers and sales agents. This switch only controls the cash register page.",
      loadFailed: "Could not load administration settings.",
      saveFailed: "Could not save.",
      strictEnabled: "Strict register rules enabled on the cash register page.",
      relaxedEnabled: "Cash register uses relaxed entry rules.",
    },
  },
  finance: {
    nav: {
      reports: "Overall reports",
      openDebts: "Open debts",
      byAgent: "Debts by agent",
      byClient: "Debts by client",
      registerLedger: "Register & ledger",
      excelImport: "Excel import",
      paymentStatus: "MENYRA E PAGESES",
      assignmentQueue: "To assign",
    },
    search: {
      label: "Search finance",
      placeholder:
        "Client name, invoice # (e.g. 26-SHV01), sales agent, location…",
      hint: "Press Enter to search. Matches client, invoice number, agent, order location, and register notes. Filter applies on this page and stays in the URL when you switch finance tabs.",
    },
    common: {
      from: "From",
      to: "To",
      applyPeriod: "Apply period",
      exportCsv: "Export CSV",
      loadFailed: "Load failed",
    },
    pages: {
      openDebts: {
        title: "Open debts",
        description:
          "Every invoice with a remaining balance (matched to orders and register payments). Use filters or open Debts by agent / by client for grouped views.",
        loading: "Loading open debts…",
        allOpenDebt: "All open debt",
        openInvoices: "Open invoices",
        filteredTotalDue: "Filtered total due",
      },
      byAgent: {
        title: "Debts by sales agent",
        description:
          "Totals per agent for follow-up and commission-style review. Matches how Finance Core groups overdue by referent.",
        loading: "Loading agent balances…",
        noAgents: "No open debts with assigned agents.",
        noSearchMatch: "No agents or invoices match your search.",
        salesAgent: "Sales agent",
        viewInvoices: "View invoices",
        focusAgent: "Focus agent",
        selectAgent: "Select an agent…",
        invoicesFor: "Invoices —",
        clear: "Clear",
      },
      byClient: {
        title: "Debts by client",
        description:
          "One row per client with total balance due, plus a call list for follow-up. Invoice-level detail is on Open debts.",
        loading: "Loading clients…",
        clientsSection: "Clients with open balance",
        callListSection: "To call list",
        callListHint:
          "Clients flagged for follow-up (unpaid balance, on-account lines with invoice, delivered-but-unpaid, or 14+ days overdue).",
        noClients: "No clients match these filters.",
        noCallList: "Nobody on the call list for these filters.",
        client: "Client",
        balanceDue: "Balance due",
        invoices: "Invoices",
        notes: "Notes",
        report: "Report",
        whyCall: "Why call",
        clientCard: "Client card",
      },
      register: {
        title: "Register & ledger",
        description:
          "Period KPIs from the cash register, shift reconciliation, ledger search, and CSV export.",
        overviewTitle: "Finance overview",
        shiftCloseTitle: "Shift close results",
        shiftCloseHint:
          "Compare counted cash to expected (opening float + cash in − cash out) for each closed shift in the period above.",
      },
      reports: {
        title: "Finance reports",
        description:
          "Totals for register activity and open receivables. Future Excel imports from your finance app will feed the same views.",
        loading: "Loading reports…",
        registerFrom: "Register activity from",
        receivablesSection: "Receivables (orders + register)",
        registerSection: "Cash register",
        totalOpenDebt: "Total open debt",
        invoicesWithBalance: "Invoices with balance open",
        clientsWithDebt: "Clients with debt",
        overdue14: "Overdue 14+ days",
        totalInvoiced: "Total invoiced (orders)",
        paidOnInvoices: "Paid on invoices (register)",
        paymentsIncome: "Payments (income)",
        paymentLines: "Payment lines",
        expenses: "Expenses",
        netRegister: "Net (income − expenses − refunds)",
      },
      import: {
        title: "Finance import",
        description:
          "Import Pro-Data Libri i transaksioneve — sales, credit notes, agents, and debts stay aligned with your finance system.",
        backToReports: "← Overall reports",
      },
      assignmentQueue: {
        title: "Assign payment method & status",
        description:
          "Work through imported invoices that still need a settlement status and register payment method. Each row disappears after you save both.",
        loading: "Loading assignment queue…",
        allDone: "All caught up — nothing left to assign.",
        allDoneHint:
          "New rows appear when you import Pro-Data Excel with empty MENYRA E PAGESES or unset status/method.",
        banner:
          "{count} invoice(s) need payment status and register method before they leave this list.",
        action: "Save",
        needPaymentMethod: "Choose a register payment method (Cash, Card, etc.).",
      },
      settlements: {
        title: "MENYRA E PAGESES — payment status",
        description:
          "Set paid entirely, paid partially (with € amount), prepaid, unpaid, or on terms for every imported Pro-Data invoice. This drives open debts vs fully paid.",
        alsoHint:
          "You can also set these values when importing Excel (after Preview), or on Open debts for invoices that still have a balance.",
      },
    },
    filters: {
      salesAgent: "Sales agent",
      allAgents: "All agents",
      minDays: "Minimum days outstanding",
      anyAge: "Any age",
      days7: "7+ days",
      days14: "14+ days",
      days30: "30+ days",
      clearFilters: "Clear filters",
    },
    table: {
      agent: "Agent",
      client: "Client",
      invoice: "Invoice",
      orderDate: "Order date",
      days: "Days",
      invoiced: "Invoiced",
      due: "Due",
      paymentStatus: "MENYRA E PAGESES",
      clientCard: "Client card",
      open: "Open",
      noOpenDebts: "No open debts match these filters.",
      excelMenyra: "Excel Menyra:",
    },
    settlement: {
      editorTitle: "MENYRA E PAGESES → payment status in our system",
      editorHint:
        "Set how each invoice is settled (full debt, paid entirely, partial, prepaid, etc.). Partial and prepaid partial need an amount in €.",
      show: "Show",
      showNeeds: "Needs assignment first",
      showAll: "All invoices",
      bulkApply: "Apply to empty / not set",
      applyBulk: "Apply bulk",
      invoice: "Invoice",
      total: "Total",
      prodataMenyra: "Pro-Data (Menyra)",
      ourStatus: "Our status",
      paidEuros: "Paid €",
      registerMethod: "Register method",
      emptyMenyra: "— empty —",
      saveStatus: "Save status",
      saveAll: "Save all changes to system",
      saving: "Saving…",
      reload: "Reload",
      loadingInvoices: "Loading imported invoices…",
      noInvoicesYet:
        "No Pro-Data invoices in the system yet. Go to Excel import, upload Libri i transaksioneve, preview, set MENYRA E PAGESES in the table, then import.",
      partialPlaceholder: "Paid € (partial)",
      registerOptional: "Register method (optional)",
      step2Import:
        "Step 2 — MENYRA E PAGESES: use the table below to choose payment status and partial amounts before you click Import.",
      savedCount: "Saved payment status for {count} invoice(s). Open debts will refresh on next load.",
      noRowsView:
        'No rows in this view — switch to "All invoices" or adjust bulk assignment.',
      statuses: {
        unknown: "Not set — choose below",
        unpaid: "Unpaid / on account (full debt)",
        on_terms: "On payment terms (due later)",
        paid_partial: "Paid partially",
        paid_full: "Paid entirely",
        prepaid_partial: "Prepaid partially (advance)",
        prepaid_full: "Prepaid entirely",
        written_off: "Written off / no collection",
      },
    },
    importProdata: {
      sectionTitle: "Pro-Data transaction book",
      intro:
        'Upload Libri i transaksioneve exports from Pro-Data Finance+ (sheet "Pro-Data Export"). Lines are grouped by invoice and merged into debts and client totals. Use the table to set paid / partial / prepaid / unpaid when MENYRA E PAGESES is empty in Excel.',
      chooseFile: "Choose a Pro-Data Excel export first.",
      preview: "Preview & classify",
      reading: "Reading…",
      importIntoFinance: "Import into finance",
      importing: "Importing…",
      syncRegister: "Create register payments when payment method is present",
      previewFirst: "Preview a Pro-Data transaction book before importing.",
      byDocumentType: "By document type",
      byPaymentStatus: "By payment status",
      needsSettlement:
        "invoice(s) need payment status assigned before import (or use bulk apply).",
      topAgents: "Top sales agents",
    },
  },
};

type WidenStrings<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => WidenStrings<R>
    : T extends object
      ? { [K in keyof T]: WidenStrings<T[K]> }
      : T;

export type AppMessages = WidenStrings<typeof en>;
