/**
 * Simple In-Memory TTL Cache
 * 
 * All TTLs are configured in config/cache-config.js
 */

import {
    RESPONSE_TTL_SEC,
    REGISTRY_TTL_SEC,
    CANDLES_TTL_SEC,
    SPOT_TTL_SEC,
} from '../config/cache-config.js';

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
        return `${this.name}: ${this.store.size} entries, ${rate}% hit (${this.hits}/${total})`;
    }

    clear() {
        this.store.clear();
        this.hits = 0;
        this.misses = 0;
    }
}

// ── Instances (TTLs from central config) ──

export const registryCache = new Cache('registry', REGISTRY_TTL_SEC * 1000);
export const candlesCache = new Cache('candles', CANDLES_TTL_SEC * 1000);
export const spotCache = new Cache('spot', SPOT_TTL_SEC * 1000);
export const responseCache = new Cache('response', RESPONSE_TTL_SEC * 1000);

export function logCacheStats() {
    console.log(`   📦 Cache: ${registryCache.stats()} | ${candlesCache.stats()} | ${spotCache.stats()} | ${responseCache.stats()}`);
}
