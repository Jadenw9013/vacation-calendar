import "server-only";
import { Redis } from "@upstash/redis";
import { MemoryBackend, RedisBackend, TripStore, type RedisLike } from "./store";

/**
 * Upstash via the Vercel Marketplace sets KV_REST_API_*; a direct Upstash
 * database uses UPSTASH_REDIS_REST_*. Either works.
 */
export function redisEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export const isMemoryStore = () => redisEnv() === null;

const g = globalThis as unknown as { tripStore?: TripStore };

export function getStore(): TripStore {
  if (g.tripStore) return g.tripStore;
  const env = redisEnv();
  if (env) {
    g.tripStore = new TripStore(new RedisBackend(new Redis({ ...env, automaticDeserialization: false }) as unknown as RedisLike));
  } else if (process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_STORE !== "1") {
    throw new Error("No trip store configured. Connect Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN), or set ALLOW_MEMORY_STORE=1 for a throwaway deploy.");
  } else {
    // Kept on globalThis so dev hot reloads don't wipe edits.
    g.tripStore = new TripStore(new MemoryBackend());
  }
  return g.tripStore;
}

/** Tests swap in a fresh in-memory store. */
export function setStoreForTests(store: TripStore | undefined) {
  g.tripStore = store;
}
