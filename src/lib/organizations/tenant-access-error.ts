export class TenantAccessError extends Error {
  constructor(
    message = "You do not have access to this company's data."
  ) {
    super(message);
    this.name = "TenantAccessError";
  }
}
