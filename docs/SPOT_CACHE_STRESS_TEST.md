# Spot Cache Stress Test Results

## Problem

Users reported that spot candle endpoints inconsistently returned empty `[]` responses. The root cause was **GeckoTerminal rate limiting** — the free API (`api.geckoterminal.com`) has a ~30 req/min limit, and every request to `/api/v1/spot-candles` (v1) hit GeckoTerminal directly with no caching.

### Before Fix — Rate Limit Test (`test-spot-ratelimit.js`)

| Endpoint | Success | Empty `[]` |
|---|---|---|
| v2 `/api/v2/.../chart?includeSpot=true` | 10/10 ✅ | 0 (had cache) |
| v1 `/api/v1/spot-candles` | **4/10** ❌ | **6** (testing with no cache) |

The v1 endpoint failed **60%** of requests after just 4 calls due to GeckoTerminal 429 rate limiting.

---



1. **CoinGecko Pro API Key** — Switched from free 

---

## After Fix — Stress Test (`test-spot-stress.js`)

**Test parameters:** 60 seconds, 20 concurrent requests, ~30ms between batches.

### Results

| Metric | Value |
|---|---|
| Total requests | **19,722** (329 req/s) |
| Duration | 60s |

#### v2 Unified Chart (`includeSpot=true`)

| Metric | Value |
|---|---|
| Total | 12,819 |
| ✅ With spot data | **12,819** |
| ❌ Empty `[]` | **0** |
| Errors | 0 |
| Cache HIT | 12,772 (99.6%) |
| Cache MISS (hit CoinGecko) | 47 |
| Avg latency | 15ms |

#### v1 Spot Candles (direct)

| Metric | Value |
|---|---|
| Total | 6,903 |
| ✅ With spot data | **6,903** |
| ❌ Empty `[]` | **0** |
| Errors | 0 |
| Avg latency | 16ms |

### Key Finding

> **Zero empty spot responses across both endpoints** — whether using `includeSpot=true` on the unified chart endpoint or directly calling `/api/v1/spot-candles`.

Out of 19,722 total requests, only **47 hit CoinGecko** (warmer refreshes). The remaining **19,675 were served from cache** in ~15ms average latency.

---

## How It Works

```
User Request → Cache HIT? → Return cached data (15ms)
                   ↓ MISS
              Fetch from CoinGecko Pro → Cache result → Return

Background Warmer (every 10s):
  → For each warm proposal:
    → Fetch fresh spot from CoinGecko Pro
    → Update cache
    → Users always get warm data
```

The warmer keeps the cache warm so that even the first user request after a cache expiry gets data — the warmer already refreshed it.

---

## Running the Tests

```bash
# Rate limit test (before/after comparison, 10 requests each)
node test-spot-ratelimit.js

# Intense stress test (19,000+ requests in 60s)
node test-spot-stress.js
```

## Config Reference (`src/config/cache-config.js`)

| Setting | Value | Purpose |
|---|---|---|
| `CACHE_RESPONSE_TTL` | 13s | Full response cache; warmer fires at 13-3=10s |
| `CACHE_SPOT_TTL` | 10s | Spot data cache; refreshed by warmer |
| `CACHE_CANDLES_TTL` | 30s | YES/NO candle cache |
| `CACHE_REGISTRY_TTL` | 300s | Registry metadata cache |
| `COINGECKO_API_KEY` | `CG-w7V...` | Pro API key (250 req/min) |
