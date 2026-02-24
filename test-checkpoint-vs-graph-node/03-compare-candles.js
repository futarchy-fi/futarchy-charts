/**
 * 03-compare-candles.js
 * ─────────────────────
 * Fetches candles for the YES pool from both backends
 * and compares OHLCV data to verify they match.
 *
 * Key difference:
 *   Graph Node: periodStartUnix (string), close (string)
 *   Checkpoint: time (int), close (string)
 */

const GRAPH_CANDLES = 'https://d3ugkaojqkfud0.cloudfront.net/subgraphs/name/algebra-proposal-candles-v1';
const CHECKPOINT_CANDLES = 'https://api.futarchy.fi/candles/graphql';

// YES pool address for proposal 0x45e1...
const YES_POOL_ADDRESS = '0xf8346e622557763a62cc981187d084695ee296c3';
const CHAIN_ID = 100;

async function gql(url, query) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const json = await res.json();
    if (json.errors) throw new Error(`GQL: ${json.errors[0].message}`);
    return json.data;
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }

async function main() {
    console.log('═'.repeat(60));
    console.log('  03 — Compare Candles: Graph Node vs Checkpoint');
    console.log('═'.repeat(60));

    // ── Graph Node ──────────────────────────────────────────────
    info('Fetching candles from Graph Node...');
    const graphData = await gql(GRAPH_CANDLES, `{
        candles(
            first: 10
            orderBy: periodStartUnix
            orderDirection: desc
            where: { pool: "${YES_POOL_ADDRESS}", period: "3600" }
        ) {
            periodStartUnix
            close
        }
    }`);
    const graphCandles = (graphData?.candles || []).reverse(); // oldest first
    info(`Graph Node: ${graphCandles.length} candles`);

    // ── Checkpoint ──────────────────────────────────────────────
    info('Fetching candles from Checkpoint...');
    const prefixedPool = `${CHAIN_ID}-${YES_POOL_ADDRESS}`;
    const checkData = await gql(CHECKPOINT_CANDLES, `{
        candles(
            first: 10
            orderBy: time
            orderDirection: desc
            where: { pool: "${prefixedPool}", period: 3600 }
        ) {
            periodStartUnix
            close
        }
    }`);
    const checkCandles = (checkData?.candles || []).reverse(); // oldest first
    info(`Checkpoint: ${checkCandles.length} candles`);

    // ── Compare ─────────────────────────────────────────────────
    console.log('\n  --- Comparison ---');

    if (graphCandles.length !== checkCandles.length) {
        fail(`Candle count: Graph=${graphCandles.length} vs Checkpoint=${checkCandles.length}`);
    } else {
        pass(`Candle count matches: ${graphCandles.length}`);
    }

    // Compare first few matching candles
    const minLen = Math.min(graphCandles.length, checkCandles.length, 5);
    let matches = 0;
    let mismatches = 0;

    for (let i = 0; i < minLen; i++) {
        const gCandle = graphCandles[i];
        const cCandle = checkCandles[i];

        const gTime = parseInt(gCandle.periodStartUnix);
        const cTime = parseInt(cCandle.periodStartUnix);
        const gClose = parseFloat(gCandle.close);
        const cClose = parseFloat(cCandle.close);

        const timeMatch = gTime === cTime;
        const closeDiff = Math.abs(gClose - cClose);
        const closeDiffPct = gClose > 0 ? (closeDiff / gClose) * 100 : 0;

        const date = new Date(gTime * 1000).toISOString().slice(0, 16);

        if (timeMatch && closeDiffPct < 0.01) {
            pass(`  ${date} — close: ${gClose.toFixed(6)} ≈ ${cClose.toFixed(6)}`);
            matches++;
        } else if (!timeMatch) {
            fail(`  Time mismatch: Graph=${gTime} vs Checkpoint=${cTime}`);
            mismatches++;
        } else {
            fail(`  ${date} — close: ${gClose.toFixed(6)} vs ${cClose.toFixed(6)} (${closeDiffPct.toFixed(4)}% diff)`);
            mismatches++;
        }
    }

    console.log(`\n  Matches: ${matches}, Mismatches: ${mismatches}`);
    console.log('\n  Done.\n');
}

main().catch(err => { console.error('❌ FATAL:', err.message); process.exit(1); });
