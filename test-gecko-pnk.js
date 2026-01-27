// Test GeckoTerminal API for PNK/sDAI on xdai

const GECKO_API = 'https://api.geckoterminal.com/api/v2';

async function testPnkSdai() {
    console.log('=== Testing GeckoTerminal for PNK/sDAI on xdai ===\n');

    // Step 1: Search for the pool
    const query = 'PNK sDAI';
    const searchUrl = `${GECKO_API}/search/pools?query=${encodeURIComponent(query)}&network=xdai`;

    console.log('1️⃣ Searching for pool:', searchUrl);

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    console.log('\nSearch results:', searchData.data?.length || 0, 'pools found\n');

    if (searchData.data?.length > 0) {
        console.log('Found pools:');
        searchData.data.forEach((pool, i) => {
            console.log(`  ${i + 1}. ${pool.attributes?.name} (${pool.attributes?.address})`);
        });

        // Use first match
        const pool = searchData.data[0];
        const poolAddress = pool.attributes?.address;
        const poolName = pool.attributes?.name;
        const poolNetwork = pool.relationships?.network?.data?.id || 'xdai';

        console.log('\n✅ Using pool:', poolName, poolAddress);

        // Step 2: Fetch OHLCV candles
        const ohlcvUrl = `${GECKO_API}/networks/${poolNetwork}/pools/${poolAddress}/ohlcv/hour?aggregate=1&limit=10&currency=token`;

        console.log('\n2️⃣ Fetching hourly candles:', ohlcvUrl);

        const ohlcvRes = await fetch(ohlcvUrl);
        const ohlcvData = await ohlcvRes.json();

        const candles = ohlcvData.data?.attributes?.ohlcv_list || [];
        console.log('\nCandles received:', candles.length);

        if (candles.length > 0) {
            console.log('\nLast 5 candles (newest first):');
            candles.slice(0, 5).forEach(c => {
                const date = new Date(c[0] * 1000).toISOString();
                console.log(`  ${date} - Close: ${c[4].toFixed(6)}`);
            });

            const latestPrice = candles[0][4];
            console.log('\n✅ Latest PNK/sDAI price:', latestPrice.toFixed(6));
        } else {
            console.log('\n⚠️ No candles returned');
        }

    } else {
        console.log('❌ No pools found for PNK/sDAI on xdai');

        // Try alternative search
        console.log('\n🔍 Trying alternative search for just "PNK"...');
        const altUrl = `${GECKO_API}/search/pools?query=PNK&network=xdai`;
        const altRes = await fetch(altUrl);
        const altData = await altRes.json();

        console.log('Alternative results:', altData.data?.length || 0, 'pools');
        altData.data?.slice(0, 5).forEach(p => {
            console.log(`  - ${p.attributes?.name} (${p.attributes?.address})`);
        });
    }
}

testPnkSdai().catch(console.error);
