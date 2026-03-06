# Futarchy Charts Spot Price Alignment (March 2026)

## The Context
Historically, the `unified-chart.js` (V2 endpoint) and `index.js` (V1 endpoint) in the `futarchy-charts` backend included logic to artificially divide the natively fetched spot price by the `currencyRate` (e.g. 1.229 for sDAI) if the token's ticker included the `::` operator.

## The Issue
This artificial backend scaling caused spot lines to render incorrectly when paired with frontend charting libraries. The UI component often had its own localized logic for rate evaluation or blindly multiplied `p.spot * rate`, which meant the backend's division either cancelled out or caused double-adjustments. 

## The Fix
By explicit request, all logic relating to `rateDivisor` and `rateMultiplier` has been completely stripped out of the spot processing pipelines for both V1 and V2 APIs.

1. **V1 API (`src/index.js`)**: `/api/v1/spot-candles`
   - Removed the `rateDivisor` fetch block.
   - Spot candles now emit their numeric strings exactly as fetched from GeckoTerminal or `futarchy-spot`, passing the raw unscaled USD values down to the client.

2. **V2 API (`src/routes/unified-chart.js`)**: `/api/v2/proposals/:proposalId/chart`
   - Removed the `ticker.includes('::')` conditional block that evaluated the `rateDivisor`.
   - The returned JSON object now accurately surfaces the unaltered spot candles and `spot_price_usd` directly to the `sx-monorepo` UI.

## Result
Spot prices are now delivered perfectly raw to the frontend clients. The responsibility of manipulating the spot array with any currency scaling rates now lies completely within the frontend rendering libraries that consume the unified endpoint.
