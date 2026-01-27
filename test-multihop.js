/**
 * Test GeckoTerminal Multi-Hop with Per-Hop Invert
 * 
 * Using ! to invert the sDAI/WETH hop since GeckoTerminal shows sDAI/WETH
 * but we need WETH/sDAI for the composite price.
 * 
 * PNK/WETH + !sDAI/WETH = PNK/sDAI
 *   - PNK/WETH gives: PNK per WETH
 *   - !sDAI/WETH inverts to: WETH per sDAI
 *   - Result: (PNK/WETH) × (WETH/sDAI) = PNK per sDAI
 */

import { fetchSpotCandles } from './src/services/spot-price.js';

async function test() {
    console.log('=== Testing Multi-Hop with Per-Hop Invert ===\n');

    // Test with inverted second hop
    const config = 'PNK/WETH+!sDAI/WETH-hour-50-xdai';
    console.log('Config:', config);
    console.log('  - PNK/WETH: normal');
    console.log('  - !sDAI/WETH: inverted (becomes WETH/sDAI)\n');

    const result = await fetchSpotCandles(config);

    console.log('\n=== RESULT ===');
    console.log('Candles:', result.candles.length);
    console.log('Latest PNK/sDAI Price:', result.price?.toFixed(6));
    console.log('Pool Path:', result.pool);
    console.log('Error:', result.error);

    if (result.candles.length > 0) {
        console.log('\nLast 5 candles (PNK price in sDAI):');
        result.candles.slice(-5).forEach(c => {
            const date = new Date(c.time * 1000).toISOString();
            console.log(`  ${date} - ${c.value.toFixed(6)} PNK/sDAI`);
        });
    }
}

test().catch(console.error);
