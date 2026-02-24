/**
 * 02-compare-pools.js
 * ────────────────────
 * Fetches CONDITIONAL pools for the same proposal from both backends
 * and compares pool names, prices, and outcomeSides.
 */

const GRAPH_CANDLES = 'https://d3ugkaojqkfud0.cloudfront.net/subgraphs/name/algebra-proposal-candles-v1';
const CHECKPOINT_CANDLES = 'https://api.futarchy.fi/candles/graphql';

const TEST_PROPOSAL_ADDRESS = '0x45e1064348fd8a407d6d1f59fc64b05f633b28fc';
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
    console.log('  02 — Compare Pools: Graph Node vs Checkpoint');
    console.log('═'.repeat(60));

    // ── Graph Node ──────────────────────────────────────────────
    info('Fetching pools from Graph Node...');
    const graphData = await gql(GRAPH_CANDLES, `{
        pools(where: { proposal: "${TEST_PROPOSAL_ADDRESS}", type: "CONDITIONAL" }) {
            id
            name
            outcomeSide
            price
        }
    }`);
    const graphPools = graphData?.pools || [];
    info(`Graph Node: ${graphPools.length} CONDITIONAL pools`);

    // ── Checkpoint ──────────────────────────────────────────────
    info('Fetching pools from Checkpoint...');
    const prefixed = `${CHAIN_ID}-${TEST_PROPOSAL_ADDRESS}`;
    const checkData = await gql(CHECKPOINT_CANDLES, `{
        pools(where: { proposal: "${prefixed}", type: "CONDITIONAL" }) {
            id
            name
            outcomeSide
            price
        }
    }`);
    const checkPools = checkData?.pools || [];
    info(`Checkpoint: ${checkPools.length} CONDITIONAL pools`);

    // ── Compare ─────────────────────────────────────────────────
    console.log('\n  --- Comparison ---');

    if (graphPools.length !== checkPools.length) {
        fail(`Pool count mismatch: Graph=${graphPools.length} vs Checkpoint=${checkPools.length}`);
    } else {
        pass(`Pool count matches: ${graphPools.length}`);
    }

    for (const side of ['YES', 'NO']) {
        const gPool = graphPools.find(p => p.outcomeSide === side);
        const cPool = checkPools.find(p => p.outcomeSide === side);

        if (!gPool || !cPool) {
            fail(`Missing ${side} pool in one backend`);
            continue;
        }

        info(`\n  ${side} Pool:`);

        // Name match
        const nameMatch = gPool.name === cPool.name;
        if (nameMatch) pass(`  Name: ${gPool.name}`);
        else fail(`  Name: Graph="${gPool.name}" vs Checkpoint="${cPool.name}"`);

        // ID format difference (expected)
        const strippedCheckId = cPool.id.replace(`${CHAIN_ID}-`, '');
        const idMatch = gPool.id.toLowerCase() === strippedCheckId.toLowerCase();
        if (idMatch) pass(`  ID: ${gPool.id} ≡ ${cPool.id} (after strip)`);
        else fail(`  ID: Graph="${gPool.id}" vs Checkpoint="${cPool.id}"`);

        // Price comparison (may differ slightly due to timing)
        const gPrice = parseFloat(gPool.price);
        const cPrice = parseFloat(cPool.price);
        const priceDiff = Math.abs(gPrice - cPrice);
        const priceDiffPct = (priceDiff / Math.max(gPrice, cPrice)) * 100;
        if (priceDiffPct < 1) pass(`  Price: ${gPrice.toFixed(4)} ≈ ${cPrice.toFixed(4)} (${priceDiffPct.toFixed(3)}% diff)`);
        else fail(`  Price: ${gPrice.toFixed(4)} vs ${cPrice.toFixed(4)} (${priceDiffPct.toFixed(3)}% diff)`);
    }

    console.log('\n  Done.\n');
}

main().catch(err => { console.error('❌ FATAL:', err.message); process.exit(1); });
