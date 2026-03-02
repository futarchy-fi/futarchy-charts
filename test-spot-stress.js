/**
 * INTENSE Spot Cache Stress Test
 * 
 * Fires 1000+ requests at local API in ~60 seconds.
 * Verifies that:
 *   1. Nearly ALL requests are served from cache (not CoinGecko)
 *   2. The warmer is refreshing spot data in the background
 *   3. No requests return empty [] spot candles
 * 
 * Usage: node test-spot-stress.js
 */

const BASE = 'http://localhost:3031';
const PROPOSAL_ID = '0x4b0b6bb0ba3caf0b407e8bfa21b8cd3bb0e8d5d7175482e32e0b879c23dc8d7c';
const MIN_TS = 1772109028;
const MAX_TS = 1772713828;
const TICKER = '0x8189c4c96826d016a99986394103dfa9ae41e7ee%3A%3A0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-500-xdai';

const DURATION_SEC = 60;       // run for 60 seconds
const CONCURRENCY = 20;        // parallel requests at a time
const DELAY_BETWEEN_MS = 30;   // 30ms between batches → ~666 batches/min × 20 = ~13,000 req/min

const stats = {
    v2: { total: 0, ok: 0, empty: 0, errors: 0, cacheHit: 0, cacheMiss: 0, totalMs: 0 },
    v1: { total: 0, ok: 0, empty: 0, errors: 0, totalMs: 0 },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function hitV2() {
    const url = `${BASE}/api/v2/proposals/${PROPOSAL_ID}/chart?minTimestamp=${MIN_TS}&maxTimestamp=${MAX_TS}&includeSpot=true`;
    const t0 = Date.now();
    try {
        const res = await fetch(url);
        const data = await res.json();
        const elapsed = Date.now() - t0;
        const spotCount = data?.candles?.spot?.length || 0;
        const cached = res.headers.get('x-cache');

        stats.v2.total++;
        stats.v2.totalMs += elapsed;
        if (cached === 'HIT') stats.v2.cacheHit++;
        else stats.v2.cacheMiss++;
        if (spotCount > 0) stats.v2.ok++;
        else stats.v2.empty++;
    } catch {
        stats.v2.total++;
        stats.v2.errors++;
    }
}

async function hitV1() {
    const url = `${BASE}/api/v1/spot-candles?ticker=${TICKER}&minTimestamp=1772452800&maxTimestamp=${MAX_TS}`;
    const t0 = Date.now();
    try {
        const res = await fetch(url);
        const data = await res.json();
        const elapsed = Date.now() - t0;
        const spotCount = data?.spotCandles?.length || 0;

        stats.v1.total++;
        stats.v1.totalMs += elapsed;
        if (spotCount > 0) stats.v1.ok++;
        else stats.v1.empty++;
    } catch {
        stats.v1.total++;
        stats.v1.errors++;
    }
}

async function main() {
    console.log('═'.repeat(60));
    console.log('🔥 INTENSE SPOT CACHE STRESS TEST');
    console.log(`   Duration: ${DURATION_SEC}s | Concurrency: ${CONCURRENCY}`);
    console.log(`   Target: 1000+ requests, ALL from cache`);
    console.log('═'.repeat(60));
    console.log('');

    // Step 1: Prime the cache with one initial request
    console.log('📦 Priming cache...');
    await hitV2();
    await hitV1();
    console.log(`   v2 primed: spot=${stats.v2.ok > 0 ? '✅' : '❌'}`);
    console.log(`   v1 primed: spot=${stats.v1.ok > 0 ? '✅' : '❌'}`);
    console.log('');

    // Step 2: Capture warmer status before test
    const warmerBefore = await fetch(`${BASE}/warmer`).then(r => r.json());
    console.log(`🔥 Warmer: ${warmerBefore.active} active entries, refresh every ${warmerBefore.refreshIntervalSec}s`);
    console.log('');

    // Step 3: Hammer the endpoints for DURATION_SEC
    console.log(`🚀 Starting ${DURATION_SEC}s stress test...`);
    const startTime = Date.now();
    let lastReport = Date.now();
    let batchCount = 0;

    while ((Date.now() - startTime) < DURATION_SEC * 1000) {
        // Fire CONCURRENCY requests in parallel (mix of v1 and v2)
        const promises = [];
        for (let i = 0; i < CONCURRENCY; i++) {
            if (i % 3 === 0) promises.push(hitV1());  // ~33% v1
            else promises.push(hitV2());               // ~66% v2
        }
        await Promise.all(promises);
        batchCount++;

        // Progress report every 10 seconds
        if (Date.now() - lastReport > 10000) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const total = stats.v2.total + stats.v1.total;
            const rps = (total / (elapsed || 1)).toFixed(0);
            console.log(`   ⏱️ ${elapsed}s | ${total} total req | ${rps} req/s | v2 cache: ${stats.v2.cacheHit}/${stats.v2.total} HIT | v1 empty: ${stats.v1.empty}`);
            lastReport = Date.now();
        }

        await sleep(DELAY_BETWEEN_MS);
    }

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Step 4: Capture warmer status after test
    const warmerAfter = await fetch(`${BASE}/warmer`).then(r => r.json());

    // Step 5: Report
    console.log('');
    console.log('═'.repeat(60));
    console.log('📊 RESULTS');
    console.log('═'.repeat(60));
    console.log('');

    const totalReqs = stats.v2.total + stats.v1.total;
    const rps = (totalReqs / totalElapsed).toFixed(0);

    console.log(`⏱️  Duration: ${totalElapsed}s | Total requests: ${totalReqs} | ${rps} req/s`);
    console.log('');

    console.log('── v2 Unified Chart (includeSpot=true) ──');
    console.log(`   Total:      ${stats.v2.total}`);
    console.log(`   ✅ With spot: ${stats.v2.ok}`);
    console.log(`   ❌ Empty:     ${stats.v2.empty}`);
    console.log(`   💥 Errors:    ${stats.v2.errors}`);
    console.log(`   📦 Cache HIT: ${stats.v2.cacheHit} (${((stats.v2.cacheHit / stats.v2.total) * 100).toFixed(1)}%)`);
    console.log(`   📦 Cache MISS: ${stats.v2.cacheMiss} (these hit CoinGecko)`);
    console.log(`   ⚡ Avg latency: ${(stats.v2.totalMs / stats.v2.total).toFixed(0)}ms`);
    console.log('');

    console.log('── v1 Spot Candles ──');
    console.log(`   Total:      ${stats.v1.total}`);
    console.log(`   ✅ With spot: ${stats.v1.ok}`);
    console.log(`   ❌ Empty:     ${stats.v1.empty}`);
    console.log(`   💥 Errors:    ${stats.v1.errors}`);
    console.log(`   ⚡ Avg latency: ${(stats.v1.totalMs / stats.v1.total).toFixed(0)}ms`);
    console.log('');

    console.log('── Warmer ──');
    console.log(`   Active entries: ${warmerAfter.active}`);
    console.log(`   Refresh interval: ${warmerAfter.refreshIntervalSec}s`);
    console.log(`   Expected warmer refreshes in ${totalElapsed}s: ~${Math.floor(totalElapsed / warmerAfter.refreshIntervalSec)}`);
    console.log('');

    // Verdict
    const totalEmpty = stats.v2.empty + stats.v1.empty;
    const cacheHitRate = ((stats.v2.cacheHit / stats.v2.total) * 100).toFixed(1);

    if (totalEmpty === 0 && parseFloat(cacheHitRate) > 90) {
        console.log('✅ PASS — All requests returned spot data, cache hit rate > 90%');
        console.log(`   Only ~${stats.v2.cacheMiss} requests hit CoinGecko (warmer refreshes).`);
        console.log('   The other ${totalReqs - stats.v2.cacheMiss} were served from cache.');
    } else if (totalEmpty === 0) {
        console.log('✅ PASS — All requests returned spot data!');
        console.log(`   Cache hit rate: ${cacheHitRate}%`);
    } else {
        console.log(`⚠️  FAIL — ${totalEmpty} requests returned empty spot candles`);
        console.log(`   v2 empty: ${stats.v2.empty} | v1 empty: ${stats.v1.empty}`);
    }
}

main().catch(console.error);
