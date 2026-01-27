
const LOCAL_API = 'http://localhost:3030';
const REMOTE_API = 'https://rwh1qtmir9.execute-api.eu-north-1.amazonaws.com';
const PROPOSAL_ID = process.argv[2] || '0x006f4ae69973023cc3ca516065ca7410a2db5c915688a64f368020b87db7e149';

async function fetchDetails(baseUrl, label) {
    console.log(`\n📡 Fetching from ${label}: ${baseUrl}...`);
    const start = Date.now();
    try {
        const res = await fetch(`${baseUrl}/api/v1/market-events/proposals/${PROPOSAL_ID}/prices`);
        const duration = Date.now() - start;

        if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        console.log(`   ✅ Success (${duration}ms)`);
        return { data, error: null };
    } catch (err) {
        console.log(`   ❌ Failed: ${err.message}`);
        return { data: null, error: err.message };
    }
}

function compare(local, remote) {
    console.log(`\n⚖️  COMPARING RESULTS...`);

    if (local.error || remote.error) {
        if (local.error) console.error(`   ❌ Local failed: ${local.error}`);
        if (remote.error) console.error(`   ❌ Remote failed: ${remote.error}`);
        return false;
    }

    const l = local.data;
    const r = remote.data;
    let passed = true;

    // 1. Event ID
    if (l.event_id === r.event_id) {
        console.log(`   ✅ Event ID matches: ${l.event_id}`);
    } else {
        console.error(`   ❌ Event ID mismatch: ${l.event_id} vs ${r.event_id}`);
        passed = false;
    }

    // 2. Spot Price (price_usd)
    const lSpot = parseFloat(l.spot.price_usd);
    const rSpot = parseFloat(r.spot.price_usd);
    const diff = Math.abs(lSpot - rSpot);

    // Tolerance slightly looser for spot price variances across different request times
    if (diff < 0.01) {
        console.log(`   ✅ Spot Price matches: ${lSpot.toFixed(4)}`);
    } else {
        console.error(`   ❌ Spot Price mismatch: ${lSpot} vs ${rSpot} (Diff: ${diff})`);
        passed = false;
    }

    // 3. Conditional Markets
    // Candles are NOT in this response (they are fetched separately via GraphQL).
    // Instead we compare pool IDs and current price if available.
    if (l.conditional_yes.pool_id === r.conditional_yes.pool_id) {
        console.log(`   ✅ YES Pool ID matches: ${l.conditional_yes.pool_id}`);
    } else {
        console.error(`   ❌ YES Pool mismatch`);
        passed = false;
    }

    return passed;
}

async function main() {
    console.log(`🧪 Parity Test: Local vs Remote`);
    console.log(`   Proposal: ${PROPOSAL_ID}`);

    const [local, remote] = await Promise.all([
        fetchDetails(LOCAL_API, 'LOCAL'),
        fetchDetails(REMOTE_API, 'REMOTE')
    ]);

    const result = compare(local, remote);

    console.log(`\n----------------------------------------`);
    if (result) {
        console.log(`🎉 TEST PASSED: Environments are consistent.`);
        process.exit(0);
    } else {
        console.log(`💥 TEST FAILED: Discrepancies found.`);
        process.exit(1);
    }
}

main();
