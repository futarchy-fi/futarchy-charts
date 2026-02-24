/**
 * 04-test-adapters.js
 * ────────────────────
 * Tests the actual adapter modules in both modes to verify
 * they produce identical output shapes.
 *
 * Usage:
 *   FUTARCHY_MODE=graph_node node 04-test-adapters.js
 *   FUTARCHY_MODE=checkpoint node 04-test-adapters.js
 */

// The adapter reads FUTARCHY_MODE from env
import { resolveProposalId, lookupOrgMetadata } from '../src/adapters/registry-adapter.js';
import { fetchPoolsForProposal, fetchCandles, getLatestPrice } from '../src/adapters/candles-adapter.js';
import { MODE } from '../src/config/endpoints.js';

const TEST_SNAPSHOT_ID = '0x09cb43ea55e3cd71ea0bae3acfe625b5a0687a3ee6f5d99b1adfd91a0bea2c42';
const TEST_PROPOSAL_ADDRESS = '0x45e1064348fd8a407d6d1f59fc64b05f633b28fc';
const YES_POOL_ADDRESS = '0xf8346e622557763a62cc981187d084695ee296c3';

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }

async function main() {
    console.log('═'.repeat(60));
    console.log(`  04 — Adapter Test (Mode: ${MODE.toUpperCase()})`);
    console.log('═'.repeat(60));

    // ── Test 1: Resolve Proposal ────────────────────────────────
    info('Test 1: resolveProposalId()...');
    const resolved = await resolveProposalId(TEST_SNAPSHOT_ID);
    if (resolved?.proposalAddress) {
        pass(`Resolved: ${resolved.proposalAddress}`);
        const addrMatch = resolved.proposalAddress.toLowerCase() === TEST_PROPOSAL_ADDRESS.toLowerCase();
        if (addrMatch) pass('Address matches expected');
        else fail(`Expected ${TEST_PROPOSAL_ADDRESS}, got ${resolved.proposalAddress}`);
    } else {
        fail('resolveProposalId returned null/empty');
    }

    // Check metadata fields
    if (resolved?.coingeckoTicker) pass(`Ticker: ${resolved.coingeckoTicker.slice(0, 30)}...`);
    else info('No ticker in resolved data');

    if (resolved?.closeTimestamp) pass(`Close: ${new Date(resolved.closeTimestamp * 1000).toISOString()}`);
    else info('No closeTimestamp in resolved data');

    // ── Test 2: Fetch Pools ─────────────────────────────────────
    info('\nTest 2: fetchPoolsForProposal()...');
    const pools = await fetchPoolsForProposal(TEST_PROPOSAL_ADDRESS);
    if (pools.length > 0) {
        pass(`Found ${pools.length} pools`);

        const yesPool = pools.find(p => p.outcomeSide === 'YES' && p.type === 'CONDITIONAL');
        const noPool = pools.find(p => p.outcomeSide === 'NO' && p.type === 'CONDITIONAL');

        if (yesPool) pass(`YES pool: ${yesPool.name} — price: ${parseFloat(yesPool.price).toFixed(4)}`);
        else fail('No YES CONDITIONAL pool');

        if (noPool) pass(`NO pool: ${noPool.name} — price: ${parseFloat(noPool.price).toFixed(4)}`);
        else fail('No NO CONDITIONAL pool');

        // Verify pool IDs are plain addresses (not chain-prefixed)
        const firstId = pools[0].id;
        const isPlain = firstId.startsWith('0x') && !firstId.includes('-');
        if (isPlain) pass(`Pool IDs are plain addresses: ${firstId.slice(0, 12)}...`);
        else fail(`Pool ID appears chain-prefixed: ${firstId}`);
    } else {
        fail('No pools returned');
    }

    // ── Test 3: Fetch Candles ───────────────────────────────────
    info('\nTest 3: fetchCandles()...');
    const now = Math.floor(Date.now() / 1000);
    const weekAgo = now - 7 * 24 * 3600;
    const candles = await fetchCandles(YES_POOL_ADDRESS, weekAgo, now);
    if (candles.length > 0) {
        pass(`Found ${candles.length} candles`);

        // Verify shape: each candle should have periodStartUnix and close
        const first = candles[0];
        const hasFields = first.periodStartUnix !== undefined && first.close !== undefined;
        if (hasFields) pass(`Shape OK: { periodStartUnix: "${first.periodStartUnix}", close: "${first.close}" }`);
        else fail(`Unexpected shape: ${JSON.stringify(first)}`);
    } else {
        fail('No candles returned');
    }

    // ── Test 4: Latest Price ────────────────────────────────────
    info('\nTest 4: getLatestPrice()...');
    const price = await getLatestPrice(YES_POOL_ADDRESS);
    if (price > 0) pass(`Latest price: ${price.toFixed(6)}`);
    else fail(`No price: ${price}`);

    console.log('\n  Done.\n');
}

main().catch(err => { console.error('❌ FATAL:', err.message); process.exit(1); });
