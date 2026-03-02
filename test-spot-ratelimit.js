/**
 * Test spot candle consistency via local charts API
 * 
 * Hammers the local endpoint repeatedly to see if GeckoTerminal
 * rate limiting causes empty [] spot responses.
 * 
 * Usage: node test-spot-ratelimit.js
 */

const BASE = 'http://localhost:3031';
const PROPOSAL_ID = '0x4b0b6bb0ba3caf0b407e8bfa21b8cd3bb0e8d5d7175482e32e0b879c23dc8d7c';
const MIN_TS = 1772109028;
const MAX_TS = 1772713828;

// Also test the v1 spot-candles endpoint directly
const TICKER = '0x8189c4c96826d016a99986394103dfa9ae41e7ee%3A%3A0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-500-xdai';

const TOTAL_REQUESTS = 10;
const DELAY_MS = 500; // delay between requests (500ms stress test)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function testV2(i) {
    const url = `${BASE}/api/v2/proposals/${PROPOSAL_ID}/chart?minTimestamp=${MIN_TS}&maxTimestamp=${MAX_TS}&includeSpot=true`;
    const t0 = Date.now();
    try {
        const res = await fetch(url);
        const data = await res.json();
        const elapsed = Date.now() - t0;
        const spotCount = data?.candles?.spot?.length || 0;
        const yesCount = data?.candles?.yes?.length || 0;
        const spotPrice = data?.market?.spot?.price_usd;
        const cached = res.headers.get('x-cache');

        const status = spotCount === 0 ? '❌ EMPTY' : '✅ OK';
        console.log(`[v2 #${i + 1}] ${status}  spot=${spotCount} yes=${yesCount} price=${spotPrice?.toFixed(2) || 'null'}  ${elapsed}ms  cache=${cached}`);

        return { endpoint: 'v2', i, spotCount, yesCount, spotPrice, elapsed, cached, error: null };
    } catch (e) {
        console.log(`[v2 #${i + 1}] 💥 ERROR: ${e.message}`);
        return { endpoint: 'v2', i, spotCount: 0, error: e.message };
    }
}

async function testV1(i) {
    const url = `${BASE}/api/v1/spot-candles?ticker=${TICKER}&minTimestamp=${MIN_TS}&maxTimestamp=${MAX_TS}`;
    const t0 = Date.now();
    try {
        const res = await fetch(url);
        const data = await res.json();
        const elapsed = Date.now() - t0;
        const spotCount = data?.spotCandles?.length || 0;

        const status = spotCount === 0 ? '❌ EMPTY' : '✅ OK';
        console.log(`[v1 #${i + 1}] ${status}  spot=${spotCount}  ${elapsed}ms`);

        return { endpoint: 'v1', i, spotCount, elapsed, error: null };
    } catch (e) {
        console.log(`[v1 #${i + 1}] 💥 ERROR: ${e.message}`);
        return { endpoint: 'v1', i, spotCount: 0, error: e.message };
    }
}

async function main() {
    console.log('═'.repeat(60));
    console.log('🧪 Spot Candle Consistency Test');
    console.log(`   Requests: ${TOTAL_REQUESTS} per endpoint`);
    console.log(`   Delay: ${DELAY_MS}ms between each`);
    console.log('═'.repeat(60));
    console.log('');

    const results = [];

    // --- Test v2 unified endpoint ---
    console.log('── v2 Unified Chart (includeSpot=true) ──');
    for (let i = 0; i < TOTAL_REQUESTS; i++) {
        results.push(await testV2(i));
        if (i < TOTAL_REQUESTS - 1) await sleep(DELAY_MS);
    }

    console.log('');

    // --- Test v1 spot-candles endpoint ---
    console.log('── v1 Spot Candles (direct) ──');
    for (let i = 0; i < TOTAL_REQUESTS; i++) {
        results.push(await testV1(i));
        if (i < TOTAL_REQUESTS - 1) await sleep(DELAY_MS);
    }

    // --- Summary ---
    console.log('');
    console.log('═'.repeat(60));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(60));

    const v2Results = results.filter(r => r.endpoint === 'v2');
    const v1Results = results.filter(r => r.endpoint === 'v1');

    const v2Empty = v2Results.filter(r => r.spotCount === 0).length;
    const v1Empty = v1Results.filter(r => r.spotCount === 0).length;
    const v2Errors = v2Results.filter(r => r.error).length;
    const v1Errors = v1Results.filter(r => r.error).length;

    console.log(`   v2: ${v2Results.length - v2Empty}/${v2Results.length} returned spot data (${v2Empty} empty, ${v2Errors} errors)`);
    console.log(`   v1: ${v1Results.length - v1Empty}/${v1Results.length} returned spot data (${v1Empty} empty, ${v1Errors} errors)`);

    if (v2Empty > 0 || v1Empty > 0) {
        console.log('');
        console.log('⚠️  INCONSISTENCY DETECTED — some requests returned empty spot candles!');
        console.log('   This is likely due to GeckoTerminal rate limiting (429).');
    } else {
        console.log('');
        console.log('✅ All requests returned spot candles consistently.');
    }

    // Check cache behavior
    const v2Cached = v2Results.filter(r => r.cached === 'HIT').length;
    console.log(`   v2 cache hits: ${v2Cached}/${v2Results.length}`);
}

main().catch(console.error);
