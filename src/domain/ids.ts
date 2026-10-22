/** Short random ids, made on the device so an offline edit can refer to what it just added. */
export function newId(prefix: "i" | "l" | "c" | "t" | "e" | "k"): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => (b % 36).toString(36)).join("")}`;
}
