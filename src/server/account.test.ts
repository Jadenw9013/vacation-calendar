import { beforeEach, describe, expect, it, vi } from "vitest";

const { jar, oauth } = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  oauth: { getToken: vi.fn(), verifyIdToken: vi.fn() },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string) => void jar.set(name, value),
}) }));
vi.mock("google-auth-library", () => ({
  CodeChallengeMethod: { S256: "S256" },
  OAuth2Client: class {
    getToken = oauth.getToken;
    verifyIdToken = oauth.verifyIdToken;
    async generateCodeVerifierAsync() { return { codeVerifier: "verifier", codeChallenge: "challenge" }; }
    generateAuthUrl(options: Record<string, string>) { return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ ...options, scope: String(options.scope) })}`; }
  },
}));

import { ACCOUNT_COOKIE, cookieName, decodeSession, encodeSession, joinedTrips, readAccount, readSession, refreshAccountSession, seal, unseal, writeAccount, writeSession } from "./auth";
import { GOOGLE_HANDSHAKE_COOKIE, safeReturnTo } from "./google";
import { setStoreForTests, getStore } from "./db";
import { MemoryBackend, TripStore } from "./store";
import { GET as start } from "@/app/api/auth/google/route";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { POST as logout } from "@/app/api/account/logout/route";

const accountA = { id: "a".repeat(64), name: "Ana", email: "ana@example.com" };
const accountB = { id: "b".repeat(64), name: "Ana", email: "other@example.com" };
const request = (params = "state=state&code=code") => new Request(`http://localhost:3000/api/auth/google/callback?${params}`);

beforeEach(() => {
  jar.clear();
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET", "test-only-fixed-session-secret");
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/auth/google/callback");
  setStoreForTests(new TripStore(new MemoryBackend()));
  jar.set(GOOGLE_HANDSHAKE_COOKIE, seal("google-handshake", { state: "state", nonce: "nonce", verifier: "verifier", returnTo: "/?all=1" }, 600));
  oauth.getToken.mockResolvedValue({ tokens: { id_token: "verified-by-google-library" } });
  oauth.verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: "google-person-1", email: "ana@example.com", email_verified: true, nonce: "nonce", given_name: "Ana" }) });
});

describe("Google accounts and trip access", () => {
  it("renews an active account after a day and keeps its joined trips available", async () => {
    const clock = vi.spyOn(Date, "now");
    const now = Date.now();
    try {
      clock.mockReturnValue(now);
      await writeAccount(accountA);
      await writeSession({ tripId: "remembered-trip", name: "Ana" });
      const initial = jar.get(ACCOUNT_COOKIE);
      await refreshAccountSession();
      expect(jar.get(ACCOUNT_COOKIE)).toBe(initial);
      clock.mockReturnValue(now + 2 * 86_400_000);
      await refreshAccountSession();
      expect(jar.get(ACCOUNT_COOKIE)).not.toBe(initial);
      jar.delete(cookieName("remembered-trip"));
      clock.mockReturnValue(now + 181 * 86_400_000);
      expect(await readSession("remembered-trip")).toMatchObject({ name: "Ana", accountId: accountA.id });
    } finally { clock.mockRestore(); }
  });

  it("does not silently renew expired or forged accounts", async () => {
    jar.set(ACCOUNT_COOKIE, seal("account", accountA, -1));
    expect(await refreshAccountSession()).toBeNull();
    expect(await readAccount()).toBeNull();
    jar.set(ACCOUNT_COOKIE, "forged.cookie");
    expect(await refreshAccountSession()).toBeNull();
  });
  it("expires guest sessions server-side and rejects appended data", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const cookie = encodeSession({ tripId: "guatemala", name: "Ana" });
    expect(decodeSession(cookie, "guatemala")).not.toBeNull();
    expect(decodeSession(`${cookie}.extra`, "guatemala")).toBeNull();
    vi.mocked(Date.now).mockReturnValue(now + 181 * 24 * 60 * 60 * 1000);
    expect(decodeSession(cookie, "guatemala")).toBeNull();
    vi.mocked(Date.now).mockRestore();
  });
  it("uses PKCE, random state, a nonce and a local return path", async () => {
    const response = await start(new Request("http://localhost:3000/api/auth/google?returnTo=https://evil.example"));
    const redirect = new URL(response.headers.get("location")!);
    expect(redirect.searchParams.get("code_challenge_method")).toBe("S256");
    const handshake = unseal<{ state: string; nonce: string; returnTo: string }>("google-handshake", jar.get(GOOGLE_HANDSHAKE_COOKIE))!;
    expect(handshake.state.length).toBeGreaterThan(30);
    expect(redirect.searchParams.get("state")).toBe(handshake.state);
    expect(redirect.searchParams.get("nonce")).toBe(handshake.nonce);
    expect(handshake.returnTo).toBe("/?all=1");
    for (const value of ["//evil.example", "/\\evil.example", "https://evil.example", "/\n/evil.example", "/\t/evil.example"]) expect(safeReturnTo(value)).toBe("/?all=1");
  });

  it("rejects an expired or mismatched handshake before exchanging a code", async () => {
    expect((await callback(request("state=wrong&code=code"))).headers.get("location")).toContain("auth=failed");
    expect(oauth.getToken).not.toHaveBeenCalled();
    jar.set(GOOGLE_HANDSHAKE_COOKIE, seal("google-handshake", { state: "state" }, -1));
    await callback(request());
    expect(oauth.getToken).not.toHaveBeenCalled();
  });

  it("refuses a mismatched token nonce", async () => {
    oauth.verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: "1", email: "a@example.com", email_verified: true, nonce: "wrong" }) });
    expect((await callback(request())).headers.get("location")).toContain("auth=failed");
    expect(jar.has(ACCOUNT_COOKIE)).toBe(false);
  });

  it("links guest trips once, and restores them with only the account cookie", async () => {
    await writeSession({ tripId: "guatemala", name: "Ana" });
    await callback(request());
    expect(oauth.verifyIdToken).toHaveBeenCalledWith({ idToken: "verified-by-google-library", audience: "client-id" });
    const accountCookie = jar.get(ACCOUNT_COOKIE)!;
    jar.clear();
    jar.set(ACCOUNT_COOKIE, accountCookie);
    expect(await joinedTrips()).toEqual(["guatemala"]);
    expect(await readSession("guatemala")).toMatchObject({ name: "Ana", tripId: "guatemala" });
    await writeSession({ tripId: "new-trip", name: "Ana" });
    jar.delete(cookieName("new-trip"));
    expect(await readSession("new-trip")).toMatchObject({ name: "Ana" });
    expect(await readSession("private-trip")).toBeNull();
  });

  it("separates people with the same name and does not reuse another account's trip cookies", async () => {
    await writeAccount(accountA);
    await writeSession({ tripId: "private-trip", name: "Ana" });
    expect(await getStore().accountTrips(accountA.id)).toEqual({ "private-trip": "Ana" });
    await writeAccount(accountB);
    expect(await readSession("private-trip")).toBeNull();
    expect(await joinedTrips()).toEqual([]);
    jar.delete(ACCOUNT_COOKIE);
    expect(await readSession("private-trip")).toBeNull();
  });

  it("does not import a previous account's cookies during a Google callback", async () => {
    jar.set(cookieName("private-trip"), encodeSession({ tripId: "private-trip", name: "Ana", accountId: accountA.id }));
    await callback(request());
    expect(await joinedTrips()).toEqual([]);
  });

  it("signs out and rejects cross-site logout", async () => {
    await writeAccount(accountA);
    await writeSession({ tripId: "private-trip", name: "Ana" });
    expect((await logout(new Request("http://localhost/api/account/logout", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect(await readSession("private-trip")).not.toBeNull();
    await logout(new Request("http://localhost/api/account/logout", { method: "POST" }));
    expect(await readSession("private-trip")).toBeNull();
    expect(await joinedTrips()).toEqual([]);
  });
});
