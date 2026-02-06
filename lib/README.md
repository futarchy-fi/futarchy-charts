# Futarchy Charts Library

> Standalone JavaScript library for fetching Futarchy market data — prices, candles, volumes, and spot prices.

**No Express server needed.** Just import and use.

## Requirements

- **Node.js 22+** (for native `fetch` support)

## Quick Start

```javascript
import { getMarketData } from './lib/index.js';

// Get all market data for a proposal
const data = await getMarketData('0x09cb43353c0ece5544919bf...');

console.log('YES:', data.conditional_yes.price);  // → 107.14
console.log('NO:', data.conditional_no.price);    // → 104.29
console.log('SPOT:', data.spot.price);            // → 88.24
console.log('Chain:', data._meta.chainId);            // → 100
```

---

## Installation

```bash
cd futarchy-charts
npm install
```

---

## API Reference

### Main Functions

| Function | Description |
|----------|-------------|
| `getMarketData(proposalId)` | Complete market data (prices, volume, timeline) |
| `getCandles(options)` | Candlestick data for charting |
| `resolveProposalId(id)` | Resolve Snapshot ID → Trading contract |

### Rate Provider (Chain-Aware)

| Function | Description |
|----------|-------------|
| `getRate(providerAddress, chainId)` | Fetch rate from ERC-4626 contract |
| `getRateCached(providerAddress, chainId)` | Cached version (5 min TTL) |

### Spot Price (GeckoTerminal)

| Function | Description |
|----------|-------------|
| `getSpotPrice(ticker)` | Get current spot price |
| `fetchSpotCandles(ticker, limit)` | Get historical spot candles |

### Algebra Subgraph

| Function | Description |
|----------|-------------|
| `fetchPoolsForProposal(id)` | Get all pools for a proposal |
| `getLatestPrice(poolId)` | Get latest price from candles |

---

## Usage Examples

### 1. Get Market Prices

```javascript
import { getMarketData } from './lib/index.js';

const data = await getMarketData('0x09cb43353c0ece5544919bf...');

// Response structure:
{
  event_id: "0xa78a2d5844c653dac60da8a3f9ec958d09a4ee6a",
  conditional_yes: {
    price: 107.14,        // YES outcome price in USD
    pool_id: "0xf8346e622..." // Algebra pool address
  },
  conditional_no: {
    price: 104.29,        // NO outcome price in USD
    pool_id: "0x76f78ec45..." // Algebra pool address
  },
  spot: {
    price: 88.24,         // Spot price from GeckoTerminal
    pool_ticker: "0x8189c4c..." // Ticker config
  },
  company_tokens: {
    base: { tokenSymbol: "GNO" },
    currency: { tokenSymbol: "sDAI", stableSymbol: "xDAI" }
  },
  timeline: {
    start: 1769990400,
    end: 1772236800,
    close_timestamp: 1772236800,
    price_precision: 2,
    currency_rate: 1.224691    // Rate from provider
  },
  _meta: {
    chainId: 100,              // Chain from metadata
    currencyRate: 1.224691,    // Rate applied
    poolCount: 6
  }
}
```

### 2. Resolve Proposal ID

```javascript
import { resolveProposalId } from './lib/index.js';

const resolved = await resolveProposalId('0x09cb43353c0ece5544919bf...');

// Response:
{
  proposalId: "0xa78a2d5844c653dac60da8a...",     // Metadata contract
  proposalAddress: "0x45e1064348fd8a407d...",     // Trading contract
  organizationName: "Gnosis DAO",
  chain: 100,                                      // Chain ID
  coingeckoTicker: "0x8189c4c96826d01...",        // Spot ticker
  closeTimestamp: 1772236800,
  currencyStableRate: "0x89c80a4540a00b5...",     // Rate provider
  currencyStableSymbol: "xDAI"
}
```

### 3. Get Currency Rate (Chain-Aware)

The rate provider uses the chain from proposal metadata to select the correct RPC:

```javascript
import { getRate, getRateCached } from './lib/index.js';

// Gnosis Chain (100)
const gnosisRate = await getRate('0x89c80a4540a00b5270347e02e2e144c71da2eced', 100);
// → 1.224691

// Ethereum Mainnet (1)
const ethRate = await getRate('0xABC123...', 1);

// Cached version (5 min TTL)
const cached = await getRateCached('0x89c80a4540a00b...', 100);
```

**Supported Chains:**

| Chain ID | Name | RPC |
|----------|------|-----|
| 1 | Ethereum | eth.llamarpc.com |
| 100 | Gnosis | rpc.gnosis.gateway.fm |

### 4. Get Spot Price

```javascript
import { getSpotPrice, fetchSpotCandles } from './lib/index.js';

// Simple ticker
const price = await getSpotPrice('GNO/sDAI-hour-500-xdai');
// → 88.88

// Multi-hop (GNO → WETH → sDAI)
const price2 = await getSpotPrice('GNO/WETH+!sDAI/WETH-hour-500-xdai');
// → 2010.84

// Get candles
const { candles, price, error } = await fetchSpotCandles('GNO/sDAI-hour-100-xdai', 100);
// candles: [{ time: 1769990400, value: 88.5 }, ...]
```

**Ticker Format:**

```
{base}/{quote}-{interval}-{limit}-{network}
```

| Part | Options | Example |
|------|---------|---------|
| base/quote | Token symbols or pool address | `GNO/sDAI`, `0x8189c4c...` |
| interval | `hour`, `minute`, `day` | `hour` |
| limit | Number of candles | `500` |
| network | `xdai`, `eth`, `base` | `xdai` |

**Multi-hop:** Use `+` to chain pools. Use `!` to invert a hop:
```
PNK/WETH+!sDAI/WETH  →  PNK/WETH × (1 / sDAI/WETH) = PNK/sDAI
```

### 5. Get Candlestick Data

```javascript
import { getCandles, fetchPoolsForProposal } from './lib/index.js';

// First, get pool IDs
const pools = await fetchPoolsForProposal('0x45e1064348fd8a407d...');
const yesPool = pools.find(p => p.outcomeSide === 'YES' && p.type === 'CONDITIONAL');
const noPool = pools.find(p => p.outcomeSide === 'NO' && p.type === 'CONDITIONAL');

// Then fetch candles
const now = Math.floor(Date.now() / 1000);
const oneDayAgo = now - 24 * 60 * 60;

const candles = await getCandles({
    yesPoolId: yesPool.id,
    noPoolId: noPool.id,
    minTimestamp: oneDayAgo,
    maxTimestamp: now,
    poolTicker: 'GNO/sDAI-hour-500-xdai',  // Optional spot overlay
    forwardFill: true                        // Fill gaps with last price
});

// Response:
{
  yesCandles: [
    { periodStartUnix: "1769990400", close: "87.35" },
    { periodStartUnix: "1769994000", close: "87.42" },
    ...
  ],
  noCandles: [...],
  spotCandles: [...],
  meta: {
    yesCount: 24,
    noCount: 24,
    spotCount: 24,
    range: { minTimestamp: 1769904000, maxTimestamp: 1769990400 }
  }
}
```

### 6. Get All Pools

```javascript
import { fetchPoolsForProposal } from './lib/index.js';

const pools = await fetchPoolsForProposal('0x45e1064348fd8a407d...');

// Returns 6 pools:
// - YES CONDITIONAL, YES PREDICTION, YES EXPECTED_VALUE
// - NO CONDITIONAL, NO PREDICTION, NO EXPECTED_VALUE

pools.forEach(pool => {
    console.log(`${pool.outcomeSide} ${pool.type}: $${pool.price}`);
});
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Application                          │
├─────────────────────────────────────────────────────────────┤
│  import { getMarketData, getCandles } from './lib/index.js' │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   lib/index.js                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ getMarket   │ │ getCandles  │ │ resolve     │            │
│  │ Data()      │ │ ()          │ │ ProposalId()│            │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘            │
└─────────┼───────────────┼───────────────┼───────────────────┘
          │               │               │
          ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Sources                              │
│                                                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐    │
│  │ Futarchy      │  │ Algebra       │  │ GeckoTerminal │    │
│  │ Registry      │  │ Candles       │  │ API           │    │
│  │ (GraphQL)     │  │ (GraphQL)     │  │ (REST)        │    │
│  └───────────────┘  └───────────────┘  └───────────────┘    │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Rate Provider RPC (Chain-Aware)                       │  │
│  │ • Ethereum (chain 1) → eth.llamarpc.com               │  │
│  │ • Gnosis (chain 100) → rpc.gnosis.gateway.fm          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## All Imports

```javascript
import {
    // Main API
    getMarketData,
    getCandles,
    resolveProposalId,
    
    // Rate Provider (chain-aware)
    getRate,
    getRateCached,
    
    // Spot Price
    getSpotPrice,
    fetchSpotCandles,
    
    // Algebra Subgraph
    fetchPoolsForProposal,
    getLatestPrice
} from './lib/index.js';
```

---

## Run Example

```bash
node example-test-offline.js
```

---

## Express Server (Optional)

If you prefer HTTP endpoints, the Express server is still available:

```bash
npm start   # Runs on port 3030
```

Endpoints:
- `GET /api/v1/market-events/proposals/:id/prices`
- `POST /subgraphs/name/algebra-proposal-candles-v1`
