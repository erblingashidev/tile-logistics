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
      financeModeTitle: "Finance & cash register",
      financeModeDesc:
        "For this stage you can run finance-only: end-of-day Pro-Data Excel import, assign payment methods and status, then review debts and call lists. Enable the cash register later for shift open/close and manual ledger lines.",
      cashRegisterEnabled: "Enable cash register (shift + manual ledger)",
      cashRegisterEnabledDesc:
        "When off, payments are tracked only via Pro-Data import and To assign — no shift or manual register entries.",
      registerOn: "Register on",
      registerOff: "Finance-only (register off)",
      cashRegisterRules: "Cash register rules",
      strictTraceability: "Strict traceability on cash register",
      strictDesc:
        "Require invoice/receipt on every line; customer + sales agent on payments and refunds.",
      strictOn: "Strict",
      relaxed: "Relaxed",
      strictHelp:
        "Finance debts and call lists always require invoice numbers and sales agents. This switch only applies when the cash register is enabled.",
      loadFailed: "Could not load administration settings.",
      saveFailed: "Could not save.",
      saved: "Administration settings saved.",
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
      hint: "Press Enter to search by invoice # or client. The same ?q= filter follows you across finance tabs; click any invoice # to jump to that invoice.",
    },
    callReasons: {
      "No payment or update for 2+ days":
        "No payment or update for 2+ days",
      "Unpaid / on account recorded in register":
        "Unpaid / on account recorded in register",
      "Delivered order not fully paid": "Delivered order not fully paid",
    },
    workflow: {
      steps: [
        "Import Pro-Data Excel (transaction book)",
        "Assign payment status & register method",
        "Open debts (by invoice #, auto from import + register)",
        "Call list after 2+ days with no payment or update",
      ],
      financeOnlyMode:
        "Cash register is off — daily workflow: import Pro-Data Excel → To assign → verify open debts & call list. Register can be enabled in Settings when you need shift reconciliation.",
      invoiceKey:
        "Invoice number is the unique key across import, assignment, open debts, and (when enabled) register ledger lines.",
      activeInvoice: "Tracking invoice {invoice}:",
      jump: {
        debts: "Open debts",
        assign: "To assign",
        register: "Register & ledger",
      },
      pages: {
        import:
          "Step 1 — Load Pro-Data Excel and set MENYRA E PAGESES on new rows before commit. Anything still empty goes to To assign.",
        assignments:
          "Step 2 — Only place to set settlement status and register payment method for imported invoices (one row per invoice #).",
        openDebts:
          "Monitor balances due per invoice #. Edit payment status on To assign; register payments appear here automatically.",
        byAgent: "Same open debts grouped by sales agent for follow-up.",
        byClient: "Client totals and call list; drill into invoice # on Open debts.",
        register:
          "Cash register KPIs, shift close, and ledger lines linked by invoice #.",
        reports: "Period totals for register activity and receivables.",
      },
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
          "Read-only view of every invoice # with a remaining balance (orders + Pro-Data + register). Click an invoice # or search to track it; assign status on To assign.",
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
          "Clients to phone when debt is still open and there has been no register payment or finance update for at least 2 days.",
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
          "Single workspace for MENYRA E PAGESES: each imported invoice # needs settlement status and register method once. Rows drop off when complete.",
        loading: "Loading assignment queue…",
        allDone: "All caught up — nothing left to assign.",
        allDoneHint:
          "New rows appear when you import Pro-Data Excel with empty MENYRA E PAGESES or unset status/method.",
        noSearchMatch: "No pending invoices match this search.",
        noSearchMatchHint:
          "Try the full invoice number, or clear search to see the full queue.",
        banner:
          "{count} invoice(s) need payment status and register method before they leave this list.",
        action: "Save",
        needPaymentMethod: "Choose a register payment method (Cash, Card, etc.).",
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
      assignPaymentStatus: "Assign status & method →",
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
  sales: {
    receivables: {
      navClients: "Clients",
      title: "My clients & receivables",
      readOnly:
        "View only — check your clients, open debts, and call list match Pro-Data. Ask management to fix payment status or methods in Administration → Finance (Excel import & To assign).",
      askManagement: "Ask management to change",
      requestSent: "Request sent to the activity log for management.",
      requestFailed: "Could not send request.",
      requestPlaceholder:
        "What should management update? (invoice #, client, payment…)",
      tabs: {
        all: "My clients",
        debts: "Open debts",
        call: "Call list",
      },
      loading: "Loading receivables…",
      noClients: "No clients linked to your sales agent yet.",
      noDebts: "No open debts for your clients.",
      noCallList: "Nobody on your call list right now.",
      totalDue: "Your clients — total due",
      openInvoices: "Open invoices",
      toCall: "To call",
      invoice: "Invoice",
      client: "Client",
      due: "Due",
      whyCall: "Why call",
      lastActivity: "Last activity",
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
