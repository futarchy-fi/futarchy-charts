/**
 * Simple In-Memory TTL Cache
 * 
 * Tiered caching for different data freshness requirements:
 *   - Registry (proposals, metadata): 5 min TTL (rarely changes)
 *   - Candles (historical prices):    30s TTL (new candle every hour)
 *   - Spot (GeckoTerminal):           30s TTL (external API)
 *   - Rate (on-chain):               Already cached in rate-provider.js (5 min)
 */

export class Cache {
    constructor(name, ttlMs) {
        this.name = name;
        this.ttlMs = ttlMs;
        this.store = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            this.misses++;
            return undefined;
        }
        if (Date.now() - entry.time > this.ttlMs) {
            this.store.delete(key);
            this.misses++;
            return undefined;
        }
        this.hits++;
        return entry.value;
    }

    set(key, value) {
        this.store.set(key, { value, time: Date.now() });
    }

    stats() {
        const total = this.hits + this.misses;
        const rate = total > 0 ? ((this.hits / total) * 100).toFixed(0) : 0;
        return `${this.name}: ${this.store.size} entries, ${rate}% hit rate (${this.hits}/${total})`;
    }

    clear() {
        this.store.clear();
        this.hits = 0;
        this.misses = 0;
    }
}

// ── Pre-configured cache instances ──

/** Registry: proposals, metadata, org lookups — rarely changes */
export const registryCache = new Cache('registry', 5 * 60 * 1000);  // 5 min

/** Candles: historical price data — new candle every ~1 hour */
export const candlesCache = new Cache('candles', 30 * 1000);         // 30 sec

/** Spot: GeckoTerminal prices — external API */
export const spotCache = new Cache('spot', 30 * 1000);               // 30 sec

/** Full unified response cache — short TTL for instant repeat requests */
export const responseCache = new Cache('response', 15 * 1000);       // 15 sec

/**
 * Wrap an async function with caching.
 * 
 * Usage:
 *   const cachedFn = withCache(cache, originalFn);
 *   const result = await cachedFn('key', arg1, arg2);
 */
export function withCache(cache, fn) {
    return async function (key, ...args) {
        const cached = cache.get(key);
        if (cached !== undefined) return cached;
        const result = await fn(...args);
        cache.set(key, result);
        return result;
    };
}

/** Log all cache stats */
export function logCacheStats() {
    console.log(`   📦 Cache: ${registryCache.stats()} | ${candlesCache.stats()} | ${spotCache.stats()} | ${responseCache.stats()}`);
}
