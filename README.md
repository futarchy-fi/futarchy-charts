# Futarchy Charts

> Market data library and API server for Futarchy prediction markets.

## Two Ways to Use

| Mode | Use Case | How |
|------|----------|-----|
| **Offline Library** | Import directly in Node.js | `import { getMarketData } from './lib'` |
| **Express Server** | HTTP API for frontend | `npm start` → `localhost:3030` |

Both use the **same underlying services** — fix once, works everywhere.

---

## Quick Start: Offline Library

**Requirements:** Node.js 22+

```javascript
import { getMarketData, getRate, getSpotPrice } from './lib/index.js';

// Get all market data for a proposal
const data = await getMarketData('0x09cb43353c0ece5544919bf...');

console.log('YES:', data.conditional_yes.price);  // → 107.14
console.log('NO:', data.conditional_no.price);    // → 104.29
console.log('Chain:', data._meta.chainId);            // → 100
```

### Available Imports

```javascript
import {
    // Main API
    getMarketData,          // Complete market data (prices, volume, timeline)
    getCandles,             // Candlestick data for charting
    resolveProposalId,      // Resolve Snapshot ID → Trading contract
    
    // Rate Provider (chain-aware)
    getRate,                // Fetch rate from ERC-4626 contract
    getRateCached,          // Cached version (5 min TTL)
    
    // Spot Price (GeckoTerminal)
    getSpotPrice,           // Get current spot price
    fetchSpotCandles,       // Get historical spot candles
    
    // Algebra Subgraph
    fetchPoolsForProposal,  // Get all pools for a proposal
    getLatestPrice          // Get latest price from candles
} from './lib/index.js';
```

See [`lib/README.md`](lib/README.md) for full API documentation.

---

## Quick Start: Express Server

```bash
npm install
npm start
```

Server runs on `http://localhost:3031`

### Frontend Config

Set in your frontend `.env`:
```env
VITE_FUTARCHY_API_URL=http://localhost:3031
```

---

## ⚡ Local Checkpoint Mode (Recommended)

By default, `futarchy-charts` connects to **local Checkpoint indexers** for maximum speed. If you're running the Checkpoint indexers from [`futarchy-fi/futarchy-subgraphs`](https://github.com/futarchy-fi/futarchy-subgraphs) on the same machine, queries go directly to `localhost` — no DNS, no TLS, no API Gateway overhead.

### Performance Comparison

| Setup | Response Time |
|-------|--------------|
| Remote (`api.futarchy.fi`) | ~3500ms |
| **Local (`localhost`)** | **~800ms** ⚡ |

### Local Setup

1. Clone and run the Checkpoint indexers from [`futarchy-fi/futarchy-subgraphs`](https://github.com/futarchy-fi/futarchy-subgraphs):

```bash
# Registry indexer (port 3003)
# Docker container: futarchy-registry-checkpoint → localhost:3003

# Candles indexer (port 3001)  
# Docker container: checkpoint-checkpoint-1 → localhost:3001
```

2. Run futarchy-charts in checkpoint mode:

```bash
FUTARCHY_MODE=checkpoint npm start
```

The server will connect to:
- **Registry:** `http://localhost:3003/graphql`
- **Candles:** `http://localhost:3001/graphql`

### Using Remote API Instead

If you don't have the indexers running locally, edit `src/config/endpoints.js` and swap the `CHECKPOINT` URLs to the remote endpoints:

```javascript
const CHECKPOINT = {
    registry: 'https://api.futarchy.fi/registry/graphql',
    candles:  'https://api.futarchy.fi/candles/graphql',
};
```

> **Note:** Remote endpoints require the `X-Futarchy-Secret` header for authenticated access.

---

## 🔥 Caching & Background Warmer

### Tiered Cache

All responses are cached in-memory with different TTLs per data type:

| Layer | Default TTL | Why |
|-------|-------------|-----|
| **Response** | 30s | Full endpoint response — identical params = instant |
| **Registry** | 5 min | Proposal metadata, org lookups — rarely changes |
| **Candles** | 30s | YES/NO price history — new candle every ~1 hour |
| **Spot** | 30s | GeckoTerminal external API |
| **Rate** | 5 min | On-chain rate provider |

### Response Headers

Every response includes cache headers so clients know what they got:

```
X-Cache: HIT           ← or MISS
X-Cache-TTL: 30        ← max age in seconds
X-Response-Time: 0ms   ← server processing time
```

### Demand-Driven Warmer

The warmer keeps caches permanently warm — **zero cold starts after the first request**.

**How it works:**
1. User hits an endpoint → succeeds → gets registered in the warm list
2. Background loop auto-refreshes the entry **before** the cache expires
3. Entry stays in the warm list for **7 days** (configurable)
4. Every subsequent user request → instant cache HIT

**Eviction policy (when max entries is reached):**
When the warm list is full (default: 50 entries), the **least recently accessed** entry gets evicted to make room for the new one. So a new proposal won't be ignored — it replaces the one nobody has looked at the longest. Active proposals always stay warm.

> **Note:** The warmer **never warms spot data**. Spot prices come from GeckoTerminal, which is an external rate-limited API (HTTP 429 on too many requests). The warmer always refreshes with `includeSpot=false`. Spot data is only fetched on real user requests and cached for 30s — empty/error responses are never cached, so the next user request retries fresh.

### Monitor: `GET /warmer`

```json
{
  "active": 3,
  "maxEntries": 50,
  "refreshIntervalSec": 27,
  "retentionDays": 7,
  "entries": [
    { "proposalId": "0x09cb4335...", "lastSeen": "2026-02-25T23:40:48Z", "age": "2h" }
  ]
}
```

### Environment Variables

All cache and warmer settings live in `src/config/cache-config.js` and are overridable via env vars:

```bash
# Cache TTLs (seconds)
CACHE_RESPONSE_TTL=30      # response cache
CACHE_REGISTRY_TTL=300     # registry (5 min)
CACHE_CANDLES_TTL=30       # YES/NO candles
CACHE_SPOT_TTL=30          # spot candles

# Warmer
ENABLE_WARMER=true         # set to "false" to disable
WARMER_RETENTION_DAYS=7    # how long entries stay warm
WARMER_MAX_ENTRIES=50      # max concurrent warm entries
```

The warmer refresh interval **auto-derives** from the response TTL: `RESPONSE_TTL - 3s`. So 30s TTL = refresh every 27s = **~2 refreshes/min/entry**.

### Disable Warmer

```bash
ENABLE_WARMER=false npm start
```

---

## API Endpoints (Express)

### 1. Market Prices

```
GET /api/v1/market-events/proposals/:proposalId/prices
```

**Example:**
```bash
curl http://localhost:3030/api/v1/market-events/proposals/0x09cb43353.../prices
```

**Response:**
```json
{
  "event_id": "0x45e1064348fd8a407d...",
  "conditional_yes": {
    "price": 107.14,
    "pool_id": "0xf8346e622..."
  },
  "conditional_no": {
    "price": 104.29,
    "pool_id": "0x76f78ec45..."
  },
  "spot": {
    "price": 88.24,
    "pool_ticker": "0x8189c4c..."
  },
  "timeline": {
    "start": 1769329110,
    "end": 1769761110,
    "currency_rate": 1.224
  },
  "_meta": {
    "chainId": 100
  }
}
```

### 2. GraphQL Candles Proxy

```
POST /subgraphs/name/algebra-proposal-candles-v1
```

Proxies GraphQL queries to the Algebra candles subgraph with spot price injection.

---

## Price Conversion

All prices are returned in the **currency token unit** (e.g., sDAI, xDAI).

| Source | Raw Unit | Conversion |
|--------|----------|------------|
| YES/NO Pools | sDAI | `price × currency_rate` |
| SPOT (GeckoTerminal) | Already converted | No conversion needed |

**Why the difference?**
- Algebra pools store prices in the raw currency token (sDAI)
- GeckoTerminal already returns prices in display units

The `currency_rate` comes from an on-chain rate provider (e.g., `0x89c80a45...` for sDAI→xDAI on Gnosis). This ensures YES, NO, and SPOT prices are all in the same unit for charting.

## Architecture

```
futarchy-charts/
├── src/
│   ├── index.js              # Express server
│   ├── routes/
│   │   ├── market-events.js  # /api/v1/market-events/...
│   │   └── graphql-proxy.js  # GraphQL candles proxy
│   └── services/             ← SHARED BY BOTH
│       ├── algebra-client.js # Pool data from subgraph
│       ├── rate-provider.js  # Chain-aware rate fetching
│       └── spot-price.js     # GeckoTerminal prices
│
├── lib/                       ← OFFLINE MODULE
│   ├── index.js              # Main exports
│   └── README.md             # Library docs
│
└── example-test-offline.js   # Test all imports
```

---

## Data Sources

| Source | Data | Used For |
|--------|------|----------|
| **Futarchy Registry** | Proposal metadata, tickers, timestamps | Config |
| **Algebra Subgraph** | YES/NO pool prices, candles | Prices |
| **GeckoTerminal** | Spot prices from AMM pools | Overlay |
| **Rate Provider RPC** | Currency → USD conversion | Rate |

### Chain Support

| Chain ID | Name | RPC |
|----------|------|-----|
| 1 | Ethereum | eth.llamarpc.com |
| 100 | Gnosis | rpc.gnosis.gateway.fm |

The chain is read from **proposal metadata** — no hardcoding needed.

---

## Metadata Configuration

Set these keys in the Futarchy Registry per proposal or organization:

| Key | Description | Example |
|-----|-------------|---------|
| `snapshot_id` | Maps Snapshot → Trading contract | `0x09cb43...` |
| `coingecko_ticker` | Spot price source | `0x8189c4c...-hour-500-xdai` |
| `chain` | Chain ID for RPC calls | `100` |
| `closeTimestamp` | Market close time | `1772236800` |
| `currency_stable_rate` | Rate provider address | `0x89c80a45...` |
| `price_precision` | Decimal places | `2` |

---

## Development

```bash
# Run Express with auto-reload
npm run dev

# Test offline module
node example-test-offline.js

# Test individual features
node test-lookup.js
node test-multihop.js
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No pools found" | Check proposal exists in Registry |
| "Spot price N/A" | Set `coingecko_ticker` in metadata |
| "Rate is 1.0" | Set `currency_stable_rate` address |
| "fetch is not defined" | Use Node.js 22+ |

---

## License

MIT
