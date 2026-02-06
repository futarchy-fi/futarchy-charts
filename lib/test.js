/**
 * Test script for the offline module
 * Run: npm run test:lib
 */

import {
    getMarketData,
    resolveProposalId,
    getSpotPrice,
    fetchSpotCandles
} from './index.js';

const TEST_PROPOSAL = '0x45e1064348fd8a407d6d1f59fc64b05f633b28fc';

async function runTests() {
    console.log('🧪 Testing Futarchy Charts Offline Module\n');
    console.log('═'.repeat(60));

    // Test 1: Resolve Proposal ID
    console.log('\n📍 Test 1: resolveProposalId()');
    try {
        const resolved = await resolveProposalId(TEST_PROPOSAL);
        console.log('   ✅ Resolved:', {
            proposalId: resolved.proposalId?.slice(0, 20) + '...',
            organizationName: resolved.organizationName || 'N/A',
            ticker: resolved.coingeckoTicker ? 'yes' : 'no'
        });
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }

    // Test 2: Get Market Data
    console.log('\n📊 Test 2: getMarketData()');
    try {
        const data = await getMarketData(TEST_PROPOSAL);
        console.log('   ✅ Market Data:', {
            yesPrice: data.conditional_yes.price?.toFixed(4),
            noPrice: data.conditional_no.price?.toFixed(4),
            spotPrice: data.spot.price?.toFixed(4) || 'N/A',
            poolCount: data._meta.poolCount
        });
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }

    // Test 3: Get Spot Price
    console.log('\n💹 Test 3: getSpotPrice()');
    try {
        const price = await getSpotPrice('GNO/WETH+!sDAI/WETH-hour-500-xdai');
        console.log('   ✅ Spot Price:', price?.toFixed(4));
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }

    // Test 4: Fetch Spot Candles
    console.log('\n📈 Test 4: fetchSpotCandles()');
    try {
        const data = await fetchSpotCandles('GNO/sDAI-hour-50-xdai', 10);
        console.log('   ✅ Candles:', {
            count: data.candles.length,
            latestPrice: data.price?.toFixed(4),
            error: data.error || 'none'
        });
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('✨ Tests complete!\n');
}

runTests();
