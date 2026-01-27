/**
 * Quick test: Verify pool address with :: rate provider works
 * 
 * Format: 0xPOOL::0xRATE_PROVIDER-interval-limit-network
 */

import { fetchSpotCandles, getSpotPrice } from './src/services/spot-price.js';

async function test() {
    console.log('=== Testing Pool Address with Rate Provider ===\n');

    // Pool: 0x8189c4c96826d016a99986394103dfa9ae41e7ee (PNK/sDAI on Gnosis)
    // Rate: 0x89c80a4540a00b5270347e02e2e144c71da2eced (sDAI rate provider)
    const ticker = '0x8189c4c96826d016a99986394103dfa9ae41e7ee::0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-50-xdai';
    console.log('Ticker:', ticker, '\n');

    // Test getSpotPrice (latest only)
    console.log('1️⃣ Testing getSpotPrice()...');
    const price = await getSpotPrice(ticker);
    console.log('   Latest price:', price?.toFixed(6));

    // Test fetchSpotCandles (with history)
    console.log('\n2️⃣ Testing fetchSpotCandles()...');
    const result = await fetchSpotCandles(ticker);

    console.log('\n=== RESULT ===');
    console.log('Candles:', result.candles.length);
    console.log('Latest:', result.price?.toFixed(6));
    console.log('Rate applied:', result.rate);
    console.log('Pool:', result.pool);
    console.log('Error:', result.error);

    if (result.candles.length > 0) {
        console.log('\nLast 3 candles:');
        result.candles.slice(-3).forEach(c => {
            console.log(`  ${new Date(c.time * 1000).toISOString()} - ${c.value.toFixed(6)}`);
        });
    }

    console.log('\n✅ Test complete!');
}

test().catch(console.error);
