# Futarchy Charts — Dual-Mode Support

## Overview

This server supports two backends controlled by the `FUTARCHY_MODE` env var:

| Mode | Backend | Registry | Candles |
|------|---------|----------|---------|
| `graph_node` (default) | CloudFront Graph Node | `futarchy-complete-new-v3` | `algebra-proposal-candles-v1` |
| `checkpoint` | `api.futarchy.fi` | `/registry/graphql` | `/candles/graphql` |

## Quick Start

```bash
# Graph Node mode (default)
FUTARCHY_MODE=graph_node npm start

# Checkpoint mode
FUTARCHY_MODE=checkpoint npm start
```

Server runs on port `3030` (binds to `0.0.0.0` for WSL compatibility).

## Using with the UI (sx-monorepo)

```bash
# Terminal 1: Start the API server
cd futarchy-charts
FUTARCHY_MODE=graph_node npm start  # or checkpoint

# Terminal 2: Start the UI pointing to local server
cd apps/ui
VITE_FUTARCHY_API_URL=http://localhost:3031 yarn dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/market-events/proposals/:id/prices` | Market data (prices, volume, timeline) |
| `POST` | `/subgraphs/name/algebra-proposal-candles-v1` | GraphQL proxy for candle data |

## Schema Differences (Graph Node vs Checkpoint)

### Registry (Proposals)

| Feature | Graph Node | Checkpoint |
|---------|-----------|------------|
| Entity name | `proposalEntities` | `proposalentities` |
| FK fields | plain strings (`organization: "0x..."`) | relations requiring subfields (`organization { id }`) |
| Metadata filter | `value: "exact"` | `value_contains_nocase` + client-side exact match |
| Affected FKs | — | `proposal`, `organization`, `aggregator` |

### Candles (Pools)

| Feature | Graph Node | Checkpoint |
|---------|-----------|------------|
| Pool ID format | `0xf834...` | `100-0xf834...` (chain-prefixed) |
| Proposal filter | `proposal: "0x45e1..."` | `proposal: "100-0x45e1..."` |
| Time field | `periodStartUnix` | `time` (also has `periodStartUnix`) |
| Period filter | `period: "3600"` (string) | `period: 3600` (integer) |
| Volume values | Human-readable (`"550.34"`) | Raw wei (`"550340000000000000000"`) — normalized by adapter |
| Token fields | Nested objects (`token0 { id, symbol }`) | Flat addresses (`token0: "0x..."`) |
| Token symbols | From `proposal.companyToken.symbol` | Parsed from pool name (`"YES_GNO / YES_sDAI"`) |

## Architecture

```
UI (sx-monorepo)
  ├── GET /prices ──→ market-events.js
  │                    ├── registry-adapter.js (proposal lookup)
  │                    ├── candles-adapter.js (pool/price data)
  │                    ├── spot-price.js (GeckoTerminal)
  │                    └── rate-provider.js (ERC-4626 rate)
  │
  └── POST /graphql ──→ graphql-proxy.js
                         ├── candles-adapter.js (proxyCandlesQuery)
                         └── spot-price.js (spot candles + rate division)
```

## Key Adapters

### `src/adapters/registry-adapter.js`
- `resolveProposalId(snapshotId)` → Finds proposal by Snapshot ID
- Handles: entity name casing, FK relation subfields, metadata filtering

### `src/adapters/candles-adapter.js`
- `fetchPoolsForProposal(address)` → Returns pools with normalized IDs and volumes
- `fetchCandles(poolId, min, max)` → Returns `{ periodStartUnix, close }` candles
- `proxyCandlesQuery(query, vars)` → Translates GraphQL queries for Checkpoint

### `src/config/endpoints.js`
- Reads `FUTARCHY_MODE` and exports `ENDPOINTS`, `IS_CHECKPOINT`

## Spot Price Rate Handling

When a ticker has `::` (rate provider), GeckoTerminal returns prices in xDAI terms (~118).
The server divides by `currencyRate` (~1.22) to normalize back to sDAI terms (~96).

This applies to both:
- `/prices` endpoint → `spotPrice = rawSpotPrice / currencyRate`
- `/graphql` candles → `convertSpotCandles()` with `rateDivisor`
