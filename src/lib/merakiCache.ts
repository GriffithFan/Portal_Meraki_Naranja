/* Cache en memoria con TTL para datos Meraki */

interface CacheEntry<T> {
  data: T;
  exp: number;
}

const caches = {
  organizations: new Map<string, CacheEntry<unknown>>(),
  networkById: new Map<string, CacheEntry<unknown>>(),
  networksByOrg: new Map<string, CacheEntry<unknown>>(),
  switchPorts: new Map<string, CacheEntry<unknown>>(),
  applianceStatus: new Map<string, CacheEntry<unknown>>(),
  lldpByNetwork: new Map<string, CacheEntry<unknown>>(),
  section: new Map<string, CacheEntry<unknown>>(),
};

export type CacheBucket = keyof typeof caches;

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutos

/* ── In-flight request deduplication ── */
const inflight = new Map<string, Promise<unknown>>();

function inflightKey(bucket: CacheBucket, key: string) {
  return `${bucket}::${key}`;
}

/**
 * Get-or-fetch with in-flight deduplication.
 * If the same bucket+key is already being fetched by another concurrent request,
 * this returns the same Promise instead of firing a duplicate API call.
 */
export async function getOrFetch<T>(
  bucket: CacheBucket,
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_TTL,
): Promise<T> {
  // 1. Return cached if still valid
  const cached = getFromCache<T>(bucket, key);
  if (cached !== null) return cached;

  // 2. Return in-flight promise if one exists
  const ik = inflightKey(bucket, key);
  const pending = inflight.get(ik);
  if (pending) return pending as Promise<T>;

  // 3. Start new fetch, share promise
  const promise = fetcher()
    .then((data) => {
      setInCache(bucket, key, data, ttlMs);
      return data;
    })
    .finally(() => {
      inflight.delete(ik);
    });

  inflight.set(ik, promise);
  return promise;
}

export function getFromCache<T>(bucket: CacheBucket, key: string): T | null {
  const entry = caches[bucket].get(key);
  if (!entry) return null;
  if (Date.now() > entry.exp) {
    caches[bucket].delete(key);
    return null;
  }
  return entry.data as T;
}

export function setInCache<T>(bucket: CacheBucket, key: string, data: T, ttlMs = DEFAULT_TTL): void {
  caches[bucket].set(key, { data, exp: Date.now() + ttlMs });
}

export function invalidateCache(bucket: CacheBucket, key?: string): void {
  if (key) {
    caches[bucket].delete(key);
  } else {
    caches[bucket].clear();
  }
}
