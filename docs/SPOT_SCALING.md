# Spot Price Scaling: GeckoTerminal Rate Limit

## The Problem

GeckoTerminal's free API has a **30 calls/minute** rate limit. Currently, spot price data flows through our server:

```
User → api.futarchy.fi/charts → GeckoTerminal → back to user
         (our server)             (30/min limit)
```

With many users loading charts simultaneously, all spot requests funnel through our single server — hitting GeckoTerminal's rate limit and returning **empty data (HTTP 429)**.

### Current Workarounds
- Spot data is **excluded from the warmer** (to avoid wasting calls)
- Empty/error spot responses are **never cached** (so retries get fresh data)
- Spot cache TTL is 30s (max 2 calls/min per unique ticker)

### When This Breaks
- ~15+ concurrent users viewing different proposals = 30 spot calls/min = rate limited
- More proposals = more unique tickers = more GeckoTerminal calls

## The Solution: Client-Side Spot Fetching

**Move spot fetching to the client.** The API already returns the `coingecko_ticker` in the response metadata — the client can use it to fetch spot data directly from GeckoTerminal.

```
                    ┌── api.futarchy.fi/charts ──┐
User → (1) fetch    │  Returns: YES/NO candles,   │
       chart data   │  metadata, ticker config    │
                    └─────────────────────────────┘
                    
       (2) fetch    ┌── GeckoTerminal API ────────┐
       spot data    │  Each user hits GeckoTerminal│
       directly     │  from their own IP/browser   │
                    └─────────────────────────────┘
```

### Why This Scales
- Each user's browser has its **own 30 calls/min** rate limit (per IP)
- 1000 users = 1000 × 30 = 30,000 calls/min capacity
- Our server never touches GeckoTerminal — zero rate limit risk

### Implementation: `@futarchy-fi/spot-tool`

Publish a lightweight npm package that handles spot fetching client-side:

```bash
npm install @futarchy-fi/spot-tool
```

```javascript
import { fetchSpotCandles } from '@futarchy-fi/spot-tool';

// 1. Get chart data (no spot)
const chart = await fetch('/api/v2/proposals/0x09cb.../chart');
const data = await chart.json();

// 2. Get ticker from response metadata
const ticker = data.meta.coingecko_ticker;

// 3. Fetch spot client-side using the ticker
const spot = await fetchSpotCandles(ticker);
// spot.candles = [{ time, value }, ...]
```

The package would be extracted from our existing `src/services/spot-price.js` — same logic, just running in the browser instead of on our server.

### API Change: Default `includeSpot=false`

Once clients adopt the spot tool, the API can default to `includeSpot=false`:

```
GET /api/v2/proposals/:id/chart
→ Returns: metadata (with ticker), YES/NO candles only
→ Does NOT call GeckoTerminal at all
→ Server stays fast, no external dependencies
```

The `includeSpot=true` parameter would remain available for backward compatibility or simple use cases where rate limiting isn't a concern.

### Migration Path

1. **Now:** `includeSpot=true` (default) — works for low traffic
2. **Soon:** Publish `@futarchy-fi/spot-tool` npm package
3. **Later:** Frontend uses spot-tool, API defaults to `includeSpot=false`
4. **Eventually:** Consider removing server-side spot fetching entirely

## GeckoTerminal Paid Plans

If client-side migration isn't immediate, CoinGecko paid plans increase the rate limit:

| Plan | Rate Limit | Cost |
|------|-----------|------|
| Free | 30/min | $0 |
| Analyst | 250/min | ~$50/mo |
| Pro | 500/min | Check coingecko.com |

This buys time but doesn't solve the fundamental scaling problem.
