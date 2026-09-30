import "server-only";
import { Redis } from "@upstash/redis";
import { trip as seed } from "@/data/trip";
import { MemoryTripRepository } from "./memory";
import { RedisTripRepository, type RedisLike } from "./redis";
import type { ApplyResult, TripRepository } from "./types";

export type { ApplyResult, TripRepository } from "./types";

/**
 * Upstash via the Vercel Marketplace sets KV_REST_API_*; a direct Upstash
 * database uses UPSTASH_REDIS_REST_*. Either works.
 */
function redisEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

const globalForRepo = globalThis as unknown as { tripRepo?: TripRepository };

export function getRepository(): TripRepository {
  if (globalForRepo.tripRepo) return globalForRepo.tripRepo;
  const env = redisEnv();
  let repo: TripRepository;
  if (env) {
    const client = new Redis({ ...env, automaticDeserialization: false });
    repo = new RedisTripRepository(client as unknown as RedisLike, seed);
  } else if (process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_STORE !== "1") {
    throw new Error(
      "No trip store configured. Connect Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN), or set ALLOW_MEMORY_STORE=1 to run with an in-memory store that forgets edits.",
    );
  } else {
    // Kept on globalThis so dev hot reloads don't wipe edits.
    repo = new MemoryTripRepository(seed);
  }
  globalForRepo.tripRepo = repo;
  return repo;
}

export function isMemoryStore(): boolean {
  return redisEnv() === null;
}

/** Applies the inverse of the most recent change as a new change. */
export async function undoLatest(repo: TripRepository, expectedVersion: number, author: string): Promise<ApplyResult | null> {
  const [latest] = await repo.history(1);
  if (!latest) return null;
  return repo.applyOps(latest.inverse, expectedVersion, { author, undoOf: latest.id });
}
