/** Albanian UI — warehouse staff portal only (/portal, /portal/wms) */

export const sq = {
  appName: "AGIMI Logjistikë",
  refresh: "Rifresko",
  logout: "Dil",
  depotLink: "Depo",
  myStatus: "Statusi im",
  statusUpdated: "Statusi u përditësua",
  allDeliveredReturn:
    "Të gjitha porositë u dorëzuan — kthehu në depo. Kur arrin, konfirmo më poshtë.",
  truckArrivedButton: "Kamioni mbërriti në depo",
  truckArrivedSuccess: "Arritja u regjistrua — ngarkuesit u njoftuan.",
  notificationDismiss: "E kuptova",

  status: {
    available: "I lirë",
    busy: "I zënë",
    returning: "Kthim në depo",
    on_break: "Në pushim",
    off_duty: "Jashtë turnit",
  } as Record<string, string>,

  myOrders: "Porositë e mia",
  nothingToDo: "Asgjë për të bërë tani.",
  truck: "Kamioni",
  round: "Raundi",
  roundLabel: (n: number) => `Raundi ${n}`,

  loadingLine: (ready: number, total: number, pending: number) =>
    `Ngarkimi: ${ready}/${total} gati${
      pending > 0 ? ` · ${pending} pret ngarkuesin` : ""
    }`,
  waitingLoader: "pret ngarkuesin",
  readyToLeave: "gati për nisje",
  allLeft: "✓ Të gjitha porositë e ngarkuara kanë dalë nga depo",
  leaveWarehouse: (n: number) =>
    `Dil nga depo — ${n} porosi gati`,
  cannotDepartEmpty: "Asgjë nuk është ngarkuar — nuk mund të niset",
  waitingAllLoaders: "Pritet ngarkuesi për të gjitha porositë…",

  loadedOnTruckDriver: "✓ Ngarkuar — përdor “Dil nga depo” te kamioni",
  loadedOnTruckPicker: "✓ Ngarkuar në kamion — prit shoferin",
  waitingLoaderConfirm: "○ Pritet konfirmimi i ngarkuesit",
  notLoaded: "Nuk u ngarkua",
  notOnTruck: "Nuk është në kamion — nuk ka hapa dorëzimi.",

  loaderConfirm: "Ngarkuesi — konfirmo porosinë",
  markLoaded: "✓ Ngarkuar në kamion",
  markPrepared: "✓ E përgatitura",
  /** One primary floor action — prepare + load in a single tap. */
  readyOnTruck: "✓ Gati në kamion",
  waitingTruckReturn: "Kamioni nuk është kthyer ende — prit derisa shoferi të konfirmojë arritjen në depo.",
  driverWaitingLoad: "Pritet ngarkimi nga depo — pa veprime derisa ngarkuesi ta ngarkojë.",
  driverInfoOnly: "Informacion — raund tjetër",
  loaderStepPrepare: "Hapi 1 — e përgatitura",
  loaderStepLoad: "Hapi 2 — ngarko në kamion",
  cannotLoadTitle: "Nuk mund të ngarkohet?",
  cannotLoadProblem: "Problem?",
  cannotLoadPlaceholder: "Shkruaj arsyen (e detyrueshme)…",
  confirmCannotLoad: "Konfirmo — nuk ngarkohet",
  confirmCannotLoadAsk: "Je i sigurt? Porosia nuk do të ngarkohet në kamion.",
  showDetails: "Detaje",
  hideDetails: "Fshih",
  showStatus: "Statusi im",
  palletsShort: (n: number) => `${n} paleta`,
  truckRound: (name: string, round: number) => `${name} · Raundi ${round}`,

  driverArrived: "Mbërrita te klienti",
  driverDeliveredPhoto: "Dorëzuar — bëj foto",
  driverMarkDone: "Shëno si kryer",
  confirmWithPhoto: "Konfirmo me foto",

  notLoadedPrefix: "Nuk u ngarkua:",

  proof: {
    prepared: "E përgatitura",
    loaded: "Ngarkuar në kamion",
    load_skipped: "Nuk u ngarkua",
    departed: "Doli nga depo",
    arrived: "Mbërriti te klienti",
    partial_delivery: "Dorëzim i pjesshëm",
    delivered: "Dorëzuar te klienti",
  } as Record<string, string>,

  deliveryFull: "Dorëzuar të gjithë (mbetja)",
  deliveryPartial: "Dorëzim i pjesshëm",
  deliveryPartialHint: "Sa pallet po lëshon tani?",
  deliveryPartialPallets: "Paletat e dërguara tani",
  deliveryPartialConfirm: "Konfirmo dorëzimin e pjesshëm",
  deliveryRemaining: (sent: number, left: number) =>
    `Dërguar ${sent} plt · mbeten ${left} plt`,
  deliveryOrdered: (n: number) => `Porosia: ${n} plt`,
  successPartialDelivery: "Dorëzim i pjesshëm u ruajt — mbetja pret kamion tjetër",

  orderStatus: {
    pending: "Në pritje",
    assigned: "Caktuar",
    in_transit: "Në transit",
    partially_delivered: "Pjesërisht dorëzuar",
    delivered: "Dorëzuar",
    cancelled: "Anuluar",
  } as Record<string, string>,

  successDeparted: "Kamioni doli — porositë janë në rrugë",
  successSaved: "U ruaj",
  successReadyOnTruck: "U shënua gati në kamion — prit shoferin",

  login: {
    title: "Hyr në sistem",
    subtitle: "Depo · shofer · admin",
    username: "Emri i përdoruesit",
    password: "Fjalëkalimi",
    submit: "Hyr",
    submitting: "Duke u futur…",
    failed: "Hyrja dështoi",
    required: "Shkruaj emrin dhe fjalëkalimin",
    invalid: "Emri ose fjalëkalimi janë gabim",
    connect: "Nuk u lidh. Provo përsëri.",
  },

  wmsTitle: "Depo — regjistrim",
  wmsReceive: "Shkarkim nga kamioni",
  wmsInventory: "Inventari vjetor",
  ordersLink: "Porositë",
  ean: "Kodi EAN / barkod",
  quantityM2: "Sasia (m²)",
  location: "Vendndodhja në depo",
  save: "Ruaj",
  scanHint: "EAN ose shkruaj manualisht",
  receiveSuccess: "Stoku u regjistrua",
  inventoryLineSaved: "Rreshti i inventarit u ruaj",
  inventoryPickZone: "Ku po numëron?",
  inventoryPickZoneHint:
    "Zgjidh zonën e depo (p.sh. Depo 1). Numëro të gjitha vendndodhjet në atë sektor, pastaj mbylle.",
  inventoryActiveZone: "Sektori aktiv",
  inventoryCloseSector: "Mbyll sektorin",
  inventoryCloseSectorHint:
    "Kur të mbarosh numërimin në këtë zonë, mbylle para se të kalosh te tjetra.",
  inventoryZonePending: "Pa filluar",
  inventoryZoneCounting: "Duke numëruar",
  inventoryZoneClosed: "Mbyllur",
  inventorySectorClosed: "Sektori u mbyll — zgjidh zonën tjetër ose përfundo inventarin.",
  selectLocation: "Zgjidh vendndodhjen",
  sessionOpen: "Inventari është hapur",
  noOpenSession: "Nuk ka inventar të hapur — kërko nga admin.",
  noWmsAccess: "Nuk keni qasje në depo.",
  noPortalAccessTitle: "Nuk keni detyra mobile",
  noPortalAccessBody:
    "Llogaria juaj nuk është për depo ose shitje mobile. Kontaktoni adminin.",

  errors: {
    generic: "Nuk u ruajt. Provo përsëri.",
    refresh: "Nuk u rifreskua faqja. Rifresko ose dil dhe hy përsëri.",
    status: "Statusi nuk u përditësua.",
    photoRequired: "Duhet foto për dorëzimin.",
    notesRequired: "Shkruaj arsyen pse nuk ngarkohet.",
    proofFailed: "Nuk u ruaj prova.",
    unauthorized: "Sesioni skadoi — dil dhe hy përsëri.",
    forbidden: "Nuk keni leje për këtë veprim.",
    notAssigned: "Nuk jeni caktuar për këtë porosi.",
    eanRequired: "Shkruaj kodin EAN.",
    m2Required: "Shkruaj sasinë në m².",
    locationRequired: "Zgjidh vendndodhjen.",
    notOnTruck: "Porosia nuk është caktuar në kamion.",
    truckStillOut:
      "Kamioni është ende jashtë — prit derisa shoferi të konfirmojë arritjen në depo.",
    alreadyPrepared: "Porosia është shënuar tashmë si e përgatitur.",
    alreadyLoaded: "Porosia është tashmë në kamion.",
    alreadySkipped: "Porosia është shënuar si “nuk ngarkohet”.",
    prepareFirst: "Shëno fillimisht si e përgatitur.",
    partialPallets: "Shkruaj sa pallet po dorëzon tani.",
  },

  reportsLink: "Raportet e depo",
  reportsTitle: "Raportet e depo",
  reportsIncident: "Problem / dëmtim",
  reportsWeekly: "Raporti javor",
  reportsCategory: "Lloji",
  reportsZone: "Zona",
  reportsBody: "Përshkrimi",
  reportsPhotos: "Foto (opsionale)",
  reportsSubmit: "Dërgo raportin",
  reportsTagLeaders: "Etiketo udhëheqësit e grupeve",
  reportsWholeWarehouse: "Për të gjithë depo",
  reportsWeeklyDue: "Raporti javor për",
  reportsNotWednesday:
    "Raporti zyrtar javor bëhet të mërkurën, por mund ta dërgosh edhe tani.",
  reportsSuccess: "Raporti u ruaj",
  reportsPhotoWarning:
    "Disa foto nuk u ruajtën — raporti u dërgua pa to.",
  reportsNoAccess: "Nuk keni qasje për raporte depo.",
  reportsSelectZone: "Zgjidh zonën",
  reportsRecent: "Raportet e fundit",
  incidentCategories: {
    damage: "Dëmtim",
    stock_disorder: "Çrregullim stoku",
    maintenance: "Mirëmbajtje / pajisje",
    safety: "Siguri",
    other: "Tjetër",
  } as Record<string, string>,
  reportsTakePhoto: "Bëj foto",
  reportsFromGallery: "Nga galeria",
  reportsRequestEdit: "Kërko ndryshim",
  reportsEditReason: "Arsyeja (opsionale)",
  reportsProposedText: "Teksti i korrigjuar",
  reportsEditPending: "Ndryshimi pret miratimin e adminit",
  reportsEditApproved: "Ndryshimi u miratua",
  reportsEditRejected: "Ndryshimi u refuzua",
  reportsEditSubmit: "Dërgo kërkesën",
  reportsEditSuccess: "Kërkesa për ndryshim u dërgua",
  reportsRemovePhoto: "Hiq",
  reportsCancel: "Anulo",

  changePasswordTitle: "Ndrysho fjalëkalimin",
  currentPassword: "Fjalëkalimi aktual",
  newPassword: "Fjalëkalimi i ri",
  confirmPassword: "Përsërit fjalëkalimin",
  updatePassword: "Përditëso fjalëkalimin",
  passwordUpdated: "Fjalëkalimi u përditësua",
  showPassword: "Shfaq",
  hidePassword: "Fshih",
} as const;

export function statusLabelSq(status: string): string {
  return sq.status[status] ?? status.replace(/_/g, " ");
}

export function orderStatusLabelSq(status: string): string {
  return sq.orderStatus[status] ?? status.replace(/_/g, " ");
}

export function proofLabelSq(phase: string): string {
  return sq.proof[phase] ?? phase;
}

/** Map known English API/server messages to Albanian for the portal. */
export function localizePortalError(message: string | null | undefined): string {
  if (!message?.trim()) return sq.errors.generic;
  const m = message.trim();
  const lower = m.toLowerCase();

  if (lower.includes("not assigned to a truck") || lower.includes("order is not assigned")) {
    return sq.errors.notOnTruck;
  }
  if (
    lower.includes("still out or returning") ||
    lower.includes("confirms arrival at the warehouse")
  ) {
    return sq.errors.truckStillOut;
  }
  if (lower.includes("mark the order as prepared")) {
    return sq.errors.prepareFirst;
  }
  if (lower.includes("already marked as prepared")) {
    return sq.errors.alreadyPrepared;
  }
  if (lower.includes("already loaded") || lower.includes("already marked as loaded")) {
    return sq.errors.alreadyLoaded;
  }
  if (lower.includes("cannot load") || lower.includes("could not be loaded")) {
    return sq.errors.alreadySkipped;
  }
  if (lower.includes("not assigned") && lower.includes("order")) {
    return sq.errors.notAssigned;
  }
  if (lower.includes("photo is required") || lower.includes("photo")) {
    if (lower.includes("required")) return sq.errors.photoRequired;
  }
  if (lower.includes("explain why")) {
    return sq.errors.notesRequired;
  }
  if (lower.includes("unauthorized") || lower.includes("session")) {
    return sq.errors.unauthorized;
  }
  if (lower.includes("forbidden") || lower.includes("permission")) {
    return sq.errors.forbidden;
  }

  // Already Albanian or unknown — show as-is
  return m;
}
