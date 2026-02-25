/**
 * Cache & Warmer Configuration
 * 
 * Single source of truth — change values here and both
 * the cache TTLs and warmer intervals auto-adjust.
 * 
 * Override via environment variables:
 *   CACHE_RESPONSE_TTL=30    (seconds)
 *   CACHE_REGISTRY_TTL=300   (seconds)
 *   CACHE_CANDLES_TTL=30     (seconds)
 *   CACHE_SPOT_TTL=30        (seconds)
 *   WARMER_RETENTION_DAYS=7
 *   WARMER_MAX_ENTRIES=50
 *   ENABLE_WARMER=true
 */

// ── Response cache (full endpoint response) ──
export const RESPONSE_TTL_SEC = parseInt(process.env.CACHE_RESPONSE_TTL || '30');

// ── Data-layer caches ──
export const REGISTRY_TTL_SEC = parseInt(process.env.CACHE_REGISTRY_TTL || '300'); // 5 min
export const CANDLES_TTL_SEC = parseInt(process.env.CACHE_CANDLES_TTL || '30');
export const SPOT_TTL_SEC = parseInt(process.env.CACHE_SPOT_TTL || '30');

// ── Warmer ──
export const ENABLE_WARMER = (process.env.ENABLE_WARMER || 'true').toLowerCase() !== 'false';
export const WARMER_RETENTION_DAYS = parseInt(process.env.WARMER_RETENTION_DAYS || '7');
export const WARMER_MAX_ENTRIES = parseInt(process.env.WARMER_MAX_ENTRIES || '50');

// Warmer refreshes 3s before cache expires (so cache is always warm)
export const WARMER_INTERVAL_SEC = Math.max(RESPONSE_TTL_SEC - 3, 5);
