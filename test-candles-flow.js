
/**
 * Test full flow:
 * 1. Get proposal details (pools, ticker) from API
 * 2. Query candles endpoint using those details for Jan 25-30 range
 */

// const LOCAL_API = 'http://localhost:3030';
const LOCAL_API = 'https://rwh1qtmir9.execute-api.eu-north-1.amazonaws.com';
const PROPOSAL_ID = '0x006f4ae69973023cc3ca516065ca7410a2db5c915688a64f368020b87db7e149';

// Jan 25-30, 2026 timestamps
const JAN_25 = Math.floor(new Date('2026-01-25T00:00:00Z').getTime() / 1000);
const JAN_30 = Math.floor(new Date('2026-01-30T00:00:00Z').getTime() / 1000);

async function main() {
    console.log(`\n🧪 Testing Candle Flow for Proposal: ${PROPOSAL_ID.slice(0, 10)}...`);
    console.log(`📅 Date Range: Jan 25 - Jan 30`);
    console.log(`----------------------------------------`);

    // 1. Fetch Proposal Details
    console.log(`\n1️⃣  Fetching Proposal Details...`);
    const detailsUrl = `${LOCAL_API}/api/v1/market-events/proposals/${PROPOSAL_ID}/prices`;
    const detailsRes = await fetch(detailsUrl);

    if (!detailsRes.ok) {
        throw new Error(`Failed to fetch details: ${detailsRes.status} ${detailsRes.statusText}`);
    }

    const details = await detailsRes.json();
    console.log(`   ✅ Got details for event: ${details.event_id}`);

    // Extract info
    const yesPoolId = details.conditional_yes.pool_id;
    const noPoolId = details.conditional_no.pool_id;
    const poolTicker = details.spot.pool_ticker;

    console.log(`   YES Pool: ${yesPoolId}`);
    console.log(`   NO Pool:  ${noPoolId}`);
    console.log(`   Ticker:   ${poolTicker}`);

    // 2. Query Candles
    console.log(`\n2️⃣  Querying Candles Proxy...`);

    const query = `
        query GetCandles($yesPoolId: String!, $noPoolId: String!, $minTimestamp: Int!, $maxTimestamp: Int!) {
            yesCandles: candles(
                where: { pool: $yesPoolId, periodStartUnix_gte: $minTimestamp, periodStartUnix_lte: $maxTimestamp, period: "3600" }
                orderBy: periodStartUnix
                orderDirection: asc
            ) {
                periodStartUnix
                close
            }
            noCandles: candles(
                where: { pool: $noPoolId, periodStartUnix_gte: $minTimestamp, periodStartUnix_lte: $maxTimestamp, period: "3600" }
                orderBy: periodStartUnix
                orderDirection: asc
            ) {
                periodStartUnix
                close
            }
        }
    `;

    const variables = {
        yesPoolId,
        noPoolId,
        minTimestamp: JAN_25,
        maxTimestamp: JAN_30,
        poolTicker // Passed for spot price injection if needed by server (though query doesn't ask for spot here)
    };

    // If we want spot candles, we need to ask for them in the query too, or the proxy might return them if the query logic allows.
    // The previous context showed the proxy handles spot requests effectively if provided poolTicker.
    // Let's stick to YES/NO first as requested "get details pool stikce" (sticker? ticker?) and "build up a request".

    const candleEndpoint = `${LOCAL_API}/subgraphs/name/algebra-proposal-candles-v1`;
    const candlesRes = await fetch(candleEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
    });

    if (!candlesRes.ok) {
        throw new Error(`Failed to fetch candles: ${candlesRes.status} ${candlesRes.statusText}`);
    }

    const candlesData = await candlesRes.json();

    if (candlesData.errors) {
        console.error('❌ GraphQL Errors:', candlesData.errors);
        return;
    }

    const yesCandles = candlesData.data?.yesCandles || [];
    const noCandles = candlesData.data?.noCandles || [];

    console.log(`   ✅ Received Candles:`);
    console.log(`      YES: ${yesCandles.length} candles`);
    console.log(`      NO:  ${noCandles.length} candles`);

    if (yesCandles.length > 0) {
        console.log(`\n   Example YES Candle:`);
        const c = yesCandles[0];
        console.log(`      Time: ${new Date(c.periodStartUnix * 1000).toISOString()}`);
        console.log(`      Price: ${c.close}`);
    }
}

main().catch(console.error);
