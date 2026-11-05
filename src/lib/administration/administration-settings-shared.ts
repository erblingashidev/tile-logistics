/** Client-safe types/defaults for administration settings (no DB imports). */
export type AdministrationSettings = {
  cashRegisterEnabled: boolean;
  registerStrictTraceability: boolean;
};

export const DEFAULT_ADMINISTRATION_SETTINGS: AdministrationSettings = {
  cashRegisterEnabled: false,
  registerStrictTraceability: false,
};
