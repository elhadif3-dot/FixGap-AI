export function isLocalOnly(): boolean {
  return process.env.FIXGAP_LOCAL_ONLY === "true" || process.env.NODE_ENV === "development";
}
