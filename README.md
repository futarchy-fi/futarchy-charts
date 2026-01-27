# Futarchy Local Express Server

Local development server for Futarchy market data. Replaces external APIs with configurable local endpoints.

## Quick Start

```bash
cd express-server
npm install
npm start
```

Server runs on `http://localhost:3030`

## Configuration

Set in frontend `.env`:
```env
VITE_FUTARCHY_API_URL=http://localhost:3030
```

---

## API Endpoints

### 1. Market Events (Prices & Volume)

```
GET /api/v1/market-events/proposals/:proposalId/prices
```

**Path Parameters:**
| Parameter | Description | Example |
|-----------|-------------|---------|
| `proposalId` | Snapshot proposal ID or Futarchy trading contract address | `0x006f4ae...` |

**Response:**
```json
{
  "event_id": "0x45e1064348fd8a407d6d1f59fc64b05f633b28fc",
  "conditional_yes": {
    "price_usd": 139.79,
    "pool_id": "0xf8346e622557763..."
  },
  "conditional_no": {
    "price_usd": 139.79,
    "pool_id": "0x76f78ec457c1b14b..."
  },
  "spot": {
    "price_usd": 140.06,
    "pool_ticker": "0x8189c4c96826d016...::0x89c80a45...-hour-500-xdai"
  },
  "company_tokens": {
    "base": { "tokenSymbol": "GNO" },
    "currency": {
      "tokenSymbol": "sDAI",
      "stableSymbol": "xDAI"
    }
  },
  "timeline": {
    "start": 1769329110,
    "end": 1769761110,
    "chart_start_range": 1769385600,
    "price_precision": 2,
    "currency_rate": 1.223
  },
  "volume": {
    "conditional_yes": {
      "status": "ok",
      "pool_id": "0xf8346e622557763...",
      "volume": "77.31",
      "volume_usd": "77.31"
    },
    "conditional_no": { ... }
  }
}
```

---

### 2. GraphQL Candles Proxy

```
POST /subgraphs/name/algebra-proposal-candles-v1
```

Proxies GraphQL queries to the Algebra candles subgraph with optional spot price injection.

**Request Body:**
```json
{
  "query": "...",
  "variables": {
    "yesPoolId": "0x...",
    "noPoolId": "0x...",
    "minTimestamp": 1769385600,
    "maxTimestamp": 1769761110,
    "poolTicker": "0x8189...::0x89c80...-hour-500-xdai"
  }
}
```

**Response:** Standard GraphQL response with candles.

---

## Metadata Configuration

Metadata is stored in the **Futarchy Registry** subgraph per organization. The server reads these keys:

| Key | Type | Description | Example |
|-----|------|-------------|---------|
| `{snapshotProposalId}` | address | Maps Snapshot ID → Trading contract | `0x45e1064348fd...` |
| `coingecko_ticker` | string | Spot price source (GeckoTerminal or multihop) | `0x8189...::0x89c80...-hour-500-xdai` |
| `chart_start_range` | unix timestamp | Override chart start date | `1769385600` |
| `price_precision` | 0-10 | Decimal places in chart legend | `2` |
| `currency_stable_rate` | address | Rate provider for USD conversion | `0x89c80a4540a00b52...` |
| `currency_stable_symbol` | string | Display symbol for stable currency | `xDAI` |

---

## Spot Price Formats

The `coingecko_ticker` field supports multiple formats:

### 1. Simple GeckoTerminal Pool
```
0x8189c4c96826d016a99986394103dfa9ae41e7ee
```
Fetches from: `api.geckoterminal.com/api/v2/networks/xdai/pools/{address}/ohlc`

### 2. Multihop Route
```
0x8189c4c96826d016a99986394103dfa9ae41e7ee::0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-500-xdai
```
Format: `{pool1}::{pool2}-{timeframe}-{limit}-{network}`

- Fetches candles from both pools
- Multiplies prices (e.g., GNO/WXDAI × WXDAI/sDAI = GNO/sDAI)

---

## Architecture

```
express-server/
├── src/
│   ├── index.js              # Express app entry point
│   ├── routes/
│   │   ├── market-events.js  # /api/v1/market-events/... handler
│   │   └── graphql-proxy.js  # GraphQL candles proxy + spot injection
│   └── services/
│       ├── algebra-client.js # Algebra pools subgraph client
│       ├── sdai-rate.js      # sDAI rate provider (on-chain RPC)
│       └── spot-price.js     # GeckoTerminal + multihop spot price
├── package.json
└── README.md
```

---

## Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend UI   │────▶│  Express Server │────▶│   Data Sources  │
│  (useFutarchy)  │     │   :3030         │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │ GET /api/v1/...       │ ┌─────────────────────┼───────────────────┐
        │                       │ │                     │                   │
        │                       ▼ ▼                     ▼                   ▼
        │               Futarchy Registry       Algebra Pools       GeckoTerminal
        │               (metadata lookup)       (YES/NO prices)     (spot candles)
        │                       │                     │                   │
        │                       │                     ▼                   │
        │                       │               sDAI Rate Provider ◀──────┘
        │                       │               (on-chain RPC)
        │                       │                     │
        │                       ▼                     ▼
        │               ┌─────────────────────────────────────────┐
        │               │            JSON Response                │
        │◀──────────────│  prices, volume, timeline, metadata     │
        │               └─────────────────────────────────────────┘
```

---

## Development

### Run with auto-reload
```bash
npm run dev
```

### Test scripts
```bash
node test-lookup.js          # Test registry lookup
node test-proposal-volume.js # Test volume calculation
node test-multihop.js        # Test multihop spot price
node test-timestamps.js      # Test timestamp handling
```

---

## Environment Variables

The server uses hardcoded endpoints (no .env required), but you can modify:

| Constant | Location | Description |
|----------|----------|-------------|
| `PORT` | index.js | Server port (default: 3030) |
| `FUTARCHY_REGISTRY_ENDPOINT` | market-events.js | Registry subgraph URL |
| `AGGREGATOR_ADDRESS` | market-events.js | Filter for organizations |
| `ALGEBRA_CANDLES_ENDPOINT` | graphql-proxy.js | Candles subgraph URL |

---

## Troubleshooting

### "No pools found"
- Verify the proposal ID exists in the Futarchy Registry
- Check that the Snapshot ID is mapped to a trading contract

### "Spot price not available"
- Ensure `coingecko_ticker` metadata is set
- Verify pool address exists on GeckoTerminal

### "Currency rate null"
- Set `currency_stable_rate` in metadata to rate provider address
- Set `currency_stable_symbol` for display name (e.g., "xDAI")

---

## License

MIT
