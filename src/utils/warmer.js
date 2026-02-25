/**
 * Cache Warmer — Demand-Driven Background Refresh
 * 
 * How it works:
 *   1. When a valid request succeeds, register it in the "warm list"
 *   2. A background loop auto-refreshes registered entries before cache expires
 *   3. Entries stay in the warm list for RETENTION_DAYS (configurable)
 *   4. Users always get instant cached responses — zero cold starts
 * 
 * All config comes from config/cache-config.js — change once, auto-adjusts.
 */

import { responseCache } from './cache.js';
import {
    WARMER_INTERVAL_SEC,
    WARMER_RETENTION_DAYS,
    WARMER_MAX_ENTRIES,
} from '../config/cache-config.js';

const REFRESH_INTERVAL_MS = WARMER_INTERVAL_SEC * 1000;
const RETENTION_MS = WARMER_RETENTION_DAYS * 24 * 3600 * 1000;

// ============================================================================
// WARM LIST
// ============================================================================

const warmList = new Map();

/**
 * Register a successful request for background warming.
 */
export function registerForWarming(cacheKey, params) {
    const now = Date.now();

    if (warmList.has(cacheKey)) {
        warmList.get(cacheKey).lastSeen = now;
        return;
    }

    // Enforce max entries (evict oldest by lastSeen)
    if (warmList.size >= WARMER_MAX_ENTRIES) {
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [key, entry] of warmList) {
            if (entry.lastSeen < oldestTime) {
                oldestTime = entry.lastSeen;
                oldestKey = key;
            }
        }
        if (oldestKey) warmList.delete(oldestKey);
    }

    warmList.set(cacheKey, {
        params,
        lastSeen: now,
        registeredAt: now,
    });

    console.log(`🔥 [Warmer] Registered: ${params.proposalId.slice(0, 10)}... (${warmList.size} active entries)`);
}

// ============================================================================
// BACKGROUND REFRESH LOOP
// ============================================================================

let refreshFn = null;
let intervalId = null;

/**
 * Start the background warmer.
 * @param {function} fn - Async function(params) that fetches and caches the data.
 */
export function startWarmer(fn) {
    refreshFn = fn;

    intervalId = setInterval(async () => {
        const now = Date.now();

        // Cleanup expired entries
        for (const [key, entry] of warmList) {
            if (now - entry.registeredAt > RETENTION_MS) {
                warmList.delete(key);
                console.log(`🔥 [Warmer] Expired: ${entry.params.proposalId.slice(0, 10)}... (${warmList.size} remaining)`);
            }
        }

        if (warmList.size === 0) return;

        // Refresh entries whose cache has expired
        let refreshed = 0;
        for (const [cacheKey, entry] of warmList) {
            const cached = responseCache.get(cacheKey);
            if (cached !== undefined) continue; // Still cached, skip

            try {
                await refreshFn(entry.params);
                refreshed++;
            } catch (err) {
                console.error(`🔥 [Warmer] Error refreshing ${entry.params.proposalId.slice(0, 10)}...: ${err.message}`);
            }
        }

        if (refreshed > 0) {
            console.log(`🔥 [Warmer] Refreshed ${refreshed}/${warmList.size} entries`);
        }
    }, REFRESH_INTERVAL_MS);

    console.log(`🔥 [Warmer] Started — refresh every ${WARMER_INTERVAL_SEC}s, retention ${WARMER_RETENTION_DAYS} days, max ${WARMER_MAX_ENTRIES} entries`);
}

export function stopWarmer() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('🔥 [Warmer] Stopped');
    }
}

export function getWarmerStatus() {
    const entries = [];
    for (const [key, entry] of warmList) {
        entries.push({
            proposalId: entry.params.proposalId.slice(0, 16) + '...',
            lastSeen: new Date(entry.lastSeen).toISOString(),
            age: Math.round((Date.now() - entry.registeredAt) / 3600000) + 'h',
        });
    }
    return {
        active: warmList.size,
        maxEntries: WARMER_MAX_ENTRIES,
        refreshIntervalSec: WARMER_INTERVAL_SEC,
        retentionDays: WARMER_RETENTION_DAYS,
        entries,
    };
}
