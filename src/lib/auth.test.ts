import { afterEach, describe, expect, it, vi } from "vitest";
import { authMode, checkPassphrase, isValidSession, safeNext, sessionToken } from "./auth";

afterEach(() => vi.unstubAllEnvs());

describe("auth", () => {
  it("accepts only the right passphrase and a session derived from it", () => {
    vi.stubEnv("TRIP_PASSPHRASE", "volcano sunrise");
    expect(authMode()).toBe("gated");
    expect(checkPassphrase("volcano sunrise")).toBe(true);
    expect(checkPassphrase("volcano")).toBe(false);
    expect(isValidSession(sessionToken("volcano sunrise"))).toBe(true);
    expect(isValidSession(sessionToken("old passphrase"))).toBe(false);
    expect(isValidSession(undefined)).toBe(false);
  });

  it("fails closed in production without a passphrase", () => {
    vi.stubEnv("TRIP_PASSPHRASE", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(authMode()).toBe("misconfigured");
    expect(isValidSession("anything")).toBe(false);
    expect(checkPassphrase("")).toBe(false);
  });

  it("is open in local dev without a passphrase", () => {
    vi.stubEnv("TRIP_PASSPHRASE", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isValidSession(undefined)).toBe(true);
  });

  it("only redirects to same-site paths after login", () => {
    expect(safeNext("/?x=1")).toBe("/?x=1");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });
});
