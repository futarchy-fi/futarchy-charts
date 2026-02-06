/**
 * Example: Futarchy Charts Offline Module
 * 
 * This file demonstrates ALL available imports from the offline module.
 * No Express server needed - just run: node example-test-offline.js
 * 
 * Requirements: Node 22+ (for native fetch)
 */

import {
    // ============================================
    // MAIN API FUNCTIONS
    // ============================================
    getMarketData,          // Complete market data (prices, volume, timeline)
    getCandles,             // Candlestick data for charting
    resolveProposalId,      // Resolve Snapshot ID → Trading contract

    // ============================================
    // RATE PROVIDER (Chain-Aware)
    // ============================================
    getRate,                // Fetch rate from any ERC-4626 provider
    getRateCached,          // Cached version (5 min TTL)

    // ============================================
    // SPOT PRICE (GeckoTerminal)
    // ============================================
    getSpotPrice,           // Get current spot price
    fetchSpotCandles,       // Get spot price candles

    // ============================================
    // ALGEBRA SUBGRAPH
    // ============================================
    fetchPoolsForProposal,  // Get all pools for a proposal
    getLatestPrice,         // Get latest price from candles

    // ============================================
    // LEGACY (for backwards compatibility only)
    // ============================================
    // getSdaiRate,         // Deprecated: use getRate()
    // getSdaiRateCached    // Deprecated: use getRateCached()
} from './lib/index.js';

// ============================================
// TEST CONFIGURATION
// ============================================

const TEST_SNAPSHOT_ID = '0x09cb43353c0ece5544919bf70a9810908098c728f27f9ca3e211871f7ad6bf1c';
const TEST_TRADING_CONTRACT = '0x45e1064348fd8a407d6d1f59fc64b05f633b28fc';
const GNOSIS_RATE_PROVIDER = '0x89c80a4540a00b5270347e02e2e144c71da2eced';

// ============================================
// TEST FUNCTIONS
// ============================================

async function testResolveProposalId() {
    console.log('\n📍 TEST: resolveProposalId()');
    console.log('─'.repeat(50));

    const resolved = await resolveProposalId(TEST_SNAPSHOT_ID);

    console.log('Input:', TEST_SNAPSHOT_ID.slice(0, 30) + '...');
    console.log('Output:', {
        proposalAddress: resolved.proposalAddress?.slice(0, 20) + '...',
        organizationName: resolved.organizationName || 'N/A',
        chain: resolved.chain,
        ticker: resolved.coingeckoTicker ? 'configured' : 'none',
        closeTimestamp: resolved.closeTimestamp
            ? new Date(resolved.closeTimestamp * 1000).toISOString().split('T')[0]
            : 'N/A'
    });

    return resolved;
}

async function testGetMarketData() {
    console.log('\n📊 TEST: getMarketData()');
    console.log('─'.repeat(50));

    const data = await getMarketData(TEST_SNAPSHOT_ID);

    console.log('Prices:', {
        YES: '$' + data.conditional_yes.price?.toFixed(2),
        NO: '$' + data.conditional_no.price?.toFixed(2),
        SPOT: data.spot.price ? '$' + data.spot.price.toFixed(2) : 'N/A'
    });
    console.log('Meta:', {
        chain: data._meta.chainId,
        currencyRate: data._meta.currencyRate?.toFixed(4),
        poolCount: data._meta.poolCount
    });

    return data;
}

async function testGetRate() {
    console.log('\n💰 TEST: getRate() / getRateCached()');
    console.log('─'.repeat(50));

    // Test chain-aware rate fetching
    const gnosisRate = await getRate(GNOSIS_RATE_PROVIDER, 100);
    console.log('Gnosis (chain 100):', gnosisRate.toFixed(6));

    // Test cached version
    const cachedRate = await getRateCached(GNOSIS_RATE_PROVIDER, 100);
    console.log('Cached (same call):', cachedRate.toFixed(6));

    // Test default (no provider specified)
    const defaultRate = await getRateCached(null, 100);
    console.log('Default Gnosis rate:', defaultRate.toFixed(6));

    return gnosisRate;
}

async function testGetSpotPrice() {
    console.log('\n💹 TEST: getSpotPrice()');
    console.log('─'.repeat(50));

    // Simple ticker
    console.log('Testing: GNO/sDAI-hour-10-xdai');
    const price1 = await getSpotPrice('GNO/sDAI-hour-10-xdai');
    console.log('GNO/sDAI:', price1 ? '$' + price1.toFixed(2) : 'error');

    // Multi-hop ticker
    console.log('\nTesting: GNO/WETH+!sDAI/WETH-hour-10-xdai (multi-hop)');
    const price2 = await getSpotPrice('GNO/WETH+!sDAI/WETH-hour-10-xdai');
    console.log('GNO/sDAI (via WETH):', price2 ? '$' + price2.toFixed(2) : 'error');

    return price2;
}

async function testFetchSpotCandles() {
    console.log('\n📈 TEST: fetchSpotCandles()');
    console.log('─'.repeat(50));

    const result = await fetchSpotCandles('GNO/sDAI-hour-10-xdai', 5);

    console.log('Candles:', result.candles.length);
    console.log('Latest Price:', result.price ? '$' + result.price.toFixed(2) : 'N/A');
    console.log('Error:', result.error || 'none');

    if (result.candles.length > 0) {
        const first = result.candles[0];
        const last = result.candles[result.candles.length - 1];
        console.log('Range:',
            new Date(first.time * 1000).toISOString().slice(0, 16),
            '→',
            new Date(last.time * 1000).toISOString().slice(0, 16)
        );
    }

    return result;
}

async function testFetchPoolsForProposal() {
    console.log('\n🏊 TEST: fetchPoolsForProposal()');
    console.log('─'.repeat(50));

    const pools = await fetchPoolsForProposal(TEST_TRADING_CONTRACT);

    console.log('Total Pools:', pools.length);
    pools.forEach(pool => {
        console.log(`  - ${pool.outcomeSide || 'N/A'} ${pool.type}: ${pool.id.slice(0, 20)}...`);
    });

    return pools;
}

async function testGetCandles() {
    console.log('\n📉 TEST: getCandles()');
    console.log('─'.repeat(50));

    // First get pools to get the pool IDs
    const pools = await fetchPoolsForProposal(TEST_TRADING_CONTRACT);
    const yesPool = pools.find(p => p.outcomeSide === 'YES' && p.type === 'CONDITIONAL');
    const noPool = pools.find(p => p.outcomeSide === 'NO' && p.type === 'CONDITIONAL');

    if (!yesPool || !noPool) {
        console.log('❌ Could not find YES/NO pools');
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 24 * 60 * 60;

    const candles = await getCandles({
        yesPoolId: yesPool.id,
        noPoolId: noPool.id,
        minTimestamp: oneDayAgo,
        maxTimestamp: now,
        forwardFill: true
    });

    console.log('YES Candles:', candles.yesCandles.length);
    console.log('NO Candles:', candles.noCandles.length);
    console.log('SPOT Candles:', candles.spotCandles.length);
    console.log('Range:', {
        min: new Date(candles.meta.range.minTimestamp * 1000).toISOString().slice(0, 16),
        max: new Date(candles.meta.range.maxTimestamp * 1000).toISOString().slice(0, 16)
    });

    return candles;
}

// ============================================
// RUN ALL TESTS
// ============================================

async function main() {
    console.log('═'.repeat(60));
    console.log('🧪 FUTARCHY CHARTS - OFFLINE MODULE TEST');
    console.log('═'.repeat(60));
    console.log('This test runs without Express server.');
    console.log('Requires: Node 22+ for native fetch support.');

    try {
        await testResolveProposalId();
        await testGetRate();
        await testGetMarketData();
        await testGetSpotPrice();
        await testFetchSpotCandles();
        await testFetchPoolsForProposal();
        await testGetCandles();

        console.log('\n' + '═'.repeat(60));
        console.log('✅ ALL TESTS COMPLETED');
        console.log('═'.repeat(60));
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error(error.stack);
    }
}

main();
