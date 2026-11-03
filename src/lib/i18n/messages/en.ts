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
