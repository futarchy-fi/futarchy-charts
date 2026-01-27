/**
 * Test fetching historical spot candles for Nov 12-19, 2025 range
 */

import { fetchSpotCandles } from './src/services/spot-price.js';

async function test() {
    console.log('=== Testing Historical Date Range ===');
    console.log('Target: Nov 12, 2025 8:52 AM → Nov 19, 2025 8:52 AM\n');

    // Calculate timestamps
    const startDate = new Date('2025-11-12T08:52:00Z');
    const endDate = new Date('2025-11-19T08:52:00Z');
    const startTs = Math.floor(startDate.getTime() / 1000);
    const endTs = Math.floor(endDate.getTime() / 1000);

    console.log('Start:', startDate.toISOString(), `(${startTs})`);
    console.log('End:', endDate.toISOString(), `(${endTs})`);

    // Duration in hours
    const durationHours = Math.round((endTs - startTs) / 3600);
    console.log('Duration:', durationHours, 'hours\n');

    // Fetch with enough limit to cover the range
    // GeckoTerminal limit is 1000 candles max
    const config = `PNK/WETH+!sDAI/WETH-hour-1000-xdai`;
    console.log('Config:', config, '\n');

    const result = await fetchSpotCandles(config);

    console.log('\n=== RESULT ===');
    console.log('Total candles fetched:', result.candles.length);

    if (result.candles.length > 0) {
        const firstCandle = result.candles[0];
        const lastCandle = result.candles[result.candles.length - 1];

        console.log('Data range:');
        console.log('  First:', new Date(firstCandle.time * 1000).toISOString());
        console.log('  Last:', new Date(lastCandle.time * 1000).toISOString());

        // Filter to our target range
        const filtered = result.candles.filter(c =>
            c.time >= startTs && c.time <= endTs
        );

        console.log('\nCandles in target range (Nov 12-19):', filtered.length);

        if (filtered.length > 0) {
            console.log('\nFirst 5 candles in range:');
            filtered.slice(0, 5).forEach(c => {
                console.log(`  ${new Date(c.time * 1000).toISOString()} - ${c.value.toFixed(6)} PNK/sDAI`);
            });

            console.log('\nLast 5 candles in range:');
            filtered.slice(-5).forEach(c => {
                console.log(`  ${new Date(c.time * 1000).toISOString()} - ${c.value.toFixed(6)} PNK/sDAI`);
            });
        } else {
            console.log('\n⚠️ No candles found in target range.');
            console.log('GeckoTerminal may not have historical data going back that far.');
        }
    }

    console.log('\nError:', result.error);
}

test().catch(console.error);
