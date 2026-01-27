/**
 * Spot Price Service (Express Server)
 * 
 * Supports flexible config string format:
 *   TOKEN::RATE/QUOTE-interval-limit-network
 *   0xPOOL-interval-limit-network
 *   TOKEN/QUOTE-interval-limit-network
 * 
 * ============================================================================
 * ⭐ MULTI-HOP SUPPORT (GeckoTerminal) ⭐
 * ============================================================================
 * 
 * Use + to chain multiple pools together for composite pricing:
 * 
 *   PNK/WETH+WETH/sDAI-hour-500-xdai
 * 
 * This will:
 *   1. Fetch PNK/WETH candles from GeckoTerminal
 *   2. Fetch WETH/sDAI candles from GeckoTerminal  
 *   3. Multiply prices at matching timestamps
 *   4. Result: PNK/sDAI composite price
 * 
 * Formula: PNK/sDAI = (PNK/WETH) × (WETH/sDAI)
 * 
 * ============================================================================
 * 
 * Other examples:
 *   PNK/sDAI-hour-500-xdai
 *   waGnoGNO::0xbbb4966335677ea24f7b86dc19a423412390e1fb/sDAI-hour-500-xdai
 *   0x8189c4c96826d016a99986394103dfa9ae41e7ee-hour-500-xdai
 */

// ==============================================================
// CONFIG - Easy to modify
// ==============================================================

const GECKO_API = 'https://api.geckoterminal.com/api/v2';

// ⭐ DEFAULT SPOT CONFIG - Change this to set the default token pair
// Using multi-hop: PNK → WETH → sDAI (with inverted sDAI/WETH hop)
const DEFAULT_CONFIG = 'PNK/WETH+!sDAI/WETH-hour-500-xdai';

const NETWORK_MAP = {
    xdai: { gecko: 'xdai', chainId: 100, rpc: 'https://rpc.gnosischain.com' },
    gnosis: { gecko: 'xdai', chainId: 100, rpc: 'https://rpc.gnosischain.com' },
    eth: { gecko: 'eth', chainId: 1, rpc: 'https://eth.llamarpc.com' },
    base: { gecko: 'base', chainId: 8453, rpc: 'https://mainnet.base.org' },
};

// ==============================================================
// HELPERS
// ==============================================================

/**
 * Parse config string:
 *   TOKEN::RATE/QUOTE-interval-limit-network[-invert]
 *   0xPOOL-interval-limit-network[-invert]
 *   TOKEN/QUOTE+TOKEN/QUOTE-interval-limit-network (MULTI-HOP)
 */
function parseConfig(input) {
    if (!input) return null;

    // URL decode if needed
    const decoded = input.includes('%') ? decodeURIComponent(input) : input;

    const parts = decoded.split('-');
    const tokenPart = parts[0];

    // Check for invert flag at the end
    const invert = parts[parts.length - 1]?.toLowerCase() === 'invert';
    const partsWithoutInvert = invert ? parts.slice(0, -1) : parts;

    // ⭐ MULTI-HOP: Check if tokenPart contains + (hop separator)
    // ⭐ PER-HOP INVERT: Use ! prefix to invert a hop (e.g., !sDAI/WETH → WETH/sDAI)
    // Example: PNK/WETH+!sDAI/WETH-hour-500-xdai
    //   - PNK/WETH: normal (PNK per WETH)
    //   - !sDAI/WETH: inverted → becomes WETH per sDAI
    if (tokenPart.includes('+')) {
        const hops = tokenPart.split('+').map(hop => {
            // Check for ! invert prefix
            const invertHop = hop.startsWith('!');
            const cleanHop = invertHop ? hop.slice(1) : hop;
            const [base, quote] = cleanHop.split('/');
            return { base, quote, invert: invertHop };
        });

        return {
            isMultiHop: true,
            hops,
            poolAddress: null,
            base: null,
            quote: null,
            rateProvider: null,
            interval: partsWithoutInvert[1] || 'hour',
            limit: parseInt(partsWithoutInvert[2] || '500'),
            network: partsWithoutInvert[3] || 'xdai',
            invert,
        };
    }

    // Check if it's a pool address (starts with 0x and doesn't contain /)
    if (tokenPart.toLowerCase().startsWith('0x') && !tokenPart.includes('/')) {
        let poolAddress = tokenPart;
        let rateProvider = null;

        if (tokenPart.includes('::')) {
            [poolAddress, rateProvider] = tokenPart.split('::');
        }

        return {
            isMultiHop: false,
            hops: null,
            poolAddress,
            base: null,
            quote: null,
            rateProvider,
            interval: partsWithoutInvert[1] || 'hour',
            limit: parseInt(partsWithoutInvert[2] || '500'),
            network: partsWithoutInvert[3] || 'xdai',
            invert,
        };
    }

    // Parse base::rate/quote
    const [baseWithRate, quote] = tokenPart.split('/');
    let base = baseWithRate;
    let rateProvider = null;

    if (baseWithRate.includes('::')) {
        [base, rateProvider] = baseWithRate.split('::');
    }

    return {
        isMultiHop: false,
        hops: null,
        poolAddress: null,
        base,
        quote,
        rateProvider,
        interval: partsWithoutInvert[1] || 'hour',
        limit: parseInt(partsWithoutInvert[2] || '500'),
        network: partsWithoutInvert[3] || 'xdai',
        invert,
    };
}

/**
 * Search for pool on GeckoTerminal
 */
async function searchPool(network, base, quote) {
    const geckoNetwork = NETWORK_MAP[network]?.gecko || network;
    const query = `${base} ${quote}`;
    const url = `${GECKO_API}/search/pools?query=${encodeURIComponent(query)}&network=${geckoNetwork}`;

    console.log('[spotPrice] Searching:', url);

    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);

    const data = await res.json();
    const pools = data.data || [];

    // Find matching pool
    const match = pools.find(p => {
        const name = p.attributes?.name?.toLowerCase() || '';
        return name.includes(base.toLowerCase()) && name.includes(quote.toLowerCase());
    });

    if (!match) throw new Error(`Pool not found: ${base}/${quote}`);

    return {
        address: match.attributes?.address,
        name: match.attributes?.name,
        network: match.relationships?.network?.data?.id || geckoNetwork,
    };
}

/**
 * Fetch OHLCV candles from GeckoTerminal
 */
async function fetchCandlesFromGecko(poolAddress, network, interval, limit) {
    const geckoNetwork = NETWORK_MAP[network]?.gecko || network;
    const timeframe = interval.includes('hour') ? 'hour' : interval.includes('min') ? 'minute' : 'day';
    // currency=token gives price in quote token, not USD
    const url = `${GECKO_API}/networks/${geckoNetwork}/pools/${poolAddress}/ohlcv/${timeframe}?aggregate=1&limit=${limit}&currency=token`;

    console.log('[spotPrice] Fetching candles:', url);

    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Candles failed: ${res.status}`);

    const data = await res.json();
    const ohlcv = data.data?.attributes?.ohlcv_list || [];

    // Transform to { time, value } format
    const raw = ohlcv.map(c => ({
        time: c[0],
        value: parseFloat(c[4]),
    })).reverse();

    // Filter duplicates
    const seen = new Set();
    return raw.filter(c => {
        if (seen.has(c.time)) return false;
        seen.add(c.time);
        return true;
    }).sort((a, b) => a.time - b.time);
}

/**
 * Get rate from ERC-4626 rate provider via RPC
 */
async function getRate(rateProvider, network) {
    const networkInfo = NETWORK_MAP[network];
    if (!networkInfo) return 1;

    try {
        const GET_RATE_SELECTOR = '0x679aefce';

        const response = await fetch(networkInfo.rpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [{ to: rateProvider, data: GET_RATE_SELECTOR }, 'latest']
            })
        });

        const { result } = await response.json();
        const rate = Number(BigInt(result)) / 1e18;
        console.log(`[spotPrice] Rate from ${rateProvider.slice(0, 10)}...: ${rate.toFixed(6)}`);
        return rate;
    } catch (e) {
        console.error('[spotPrice] Rate fetch failed:', e.message);
        return 1;
    }
}

// ==============================================================
// ⭐ MULTI-HOP LOGIC ⭐
// ==============================================================

/**
 * Fetch candles for a single hop (base/quote pair)
 * ⭐ Supports per-hop invert: if hop.invert is true, applies 1/price
 */
async function fetchHopCandles(hop, network, interval, limit) {
    const pool = await searchPool(network, hop.base, hop.quote);
    console.log(`[spotPrice] Hop ${hop.invert ? '!' : ''}${hop.base}/${hop.quote}: Found pool ${pool.name}`);

    let candles = await fetchCandlesFromGecko(pool.address, network, interval, limit);

    // ⭐ Apply per-hop invert if specified
    if (hop.invert) {
        candles = candles.map(c => ({ ...c, value: 1 / c.value }));
        console.log(`[spotPrice] Hop ${hop.base}/${hop.quote}: Inverted (1/price)`);
    }

    console.log(`[spotPrice] Hop ${hop.base}/${hop.quote}: ${candles.length} candles`);
    return candles;
}

/**
 * ⭐ MULTI-HOP: Combine candles from multiple hops by multiplying prices
 * 
 * Example: PNK/WETH + WETH/sDAI = PNK/sDAI
 * 
 * Uses FORWARD-FILL: If a hop doesn't have a candle at a timestamp,
 * use the most recent known price. This handles pools with different
 * activity levels.
 * 
 * Formula: composite_price = hop1_price × hop2_price × ... × hopN_price
 */
function combineHopCandles(hopCandlesArray) {
    if (hopCandlesArray.length === 0) return [];
    if (hopCandlesArray.length === 1) return hopCandlesArray[0];

    // Collect ALL unique timestamps from ALL hops
    const allTimestamps = new Set();
    hopCandlesArray.forEach(candles => {
        candles.forEach(c => allTimestamps.add(c.time));
    });
    const sortedTimes = [...allTimestamps].sort((a, b) => a - b);

    console.log(`[spotPrice] ⭐ Multi-hop: ${sortedTimes.length} total timestamps`);

    // Create maps for quick lookup
    const hopMaps = hopCandlesArray.map(candles => {
        const map = new Map();
        candles.forEach(c => map.set(c.time, c.value));
        return map;
    });

    // For each timestamp, get price from each hop (forward-fill if missing)
    const lastKnownPrices = hopMaps.map(() => null);

    const result = [];
    for (const time of sortedTimes) {
        // Update last known prices and check if all hops have been initialized
        let allHopsInitialized = true;

        for (let i = 0; i < hopMaps.length; i++) {
            if (hopMaps[i].has(time)) {
                lastKnownPrices[i] = hopMaps[i].get(time);
            }
            if (lastKnownPrices[i] === null) {
                allHopsInitialized = false;
            }
        }

        // Only add candle when all hops have at least one known price
        if (allHopsInitialized) {
            const compositeValue = lastKnownPrices.reduce((product, price) => product * price, 1);
            result.push({ time, value: compositeValue });
        }
    }

    console.log(`[spotPrice] ⭐ Multi-hop: ${result.length} composite candles (forward-filled)`);
    return result;
}

// ==============================================================
// MAIN EXPORTS
// ==============================================================

/**
 * Fetch spot price candles using configurable ticker
 * 
 * @param {string} configString - "TOKEN::RATE/QUOTE-interval-limit-network" or multi-hop with +
 * @param {number} limit - Override limit if needed
 * @returns {Promise<{candles, price, rate, pool, error}>}
 */
export async function fetchSpotCandles(configString = DEFAULT_CONFIG, limit = null) {
    try {
        const config = parseConfig(configString);
        if (!config) {
            return { candles: [], price: null, rate: null, pool: null, error: 'Invalid config' };
        }

        // Override limit if provided
        if (limit) config.limit = limit;

        console.log('[spotPrice] Config:', JSON.stringify(config, null, 2));

        // ============================================================
        // ⭐ MULTI-HOP PATH
        // ============================================================
        if (config.isMultiHop) {
            console.log(`[spotPrice] ⭐ MULTI-HOP: ${config.hops.length} hops`);

            // Fetch candles for each hop in parallel
            const hopCandlesPromises = config.hops.map(hop =>
                fetchHopCandles(hop, config.network, config.interval, config.limit)
            );
            const hopCandlesArray = await Promise.all(hopCandlesPromises);

            // Combine by multiplying prices
            let candles = combineHopCandles(hopCandlesArray);

            // Apply invert if specified
            if (config.invert) {
                candles = candles.map(c => ({ ...c, value: 1 / c.value }));
                console.log('[spotPrice] Inverted prices (1/price)');
            }

            const latestPrice = candles.length > 0 ? candles[candles.length - 1].value : null;
            const hopNames = config.hops.map(h => `${h.base}/${h.quote}`).join(' → ');

            console.log(`[spotPrice] ⭐ Multi-hop result: ${candles.length} candles, latest: ${latestPrice?.toFixed(6)}`);

            return {
                candles,
                price: latestPrice,
                rate: null,
                pool: hopNames,
                error: null,
            };
        }

        // ============================================================
        // SINGLE POOL PATH (original logic)
        // ============================================================
        let poolAddress;
        let poolName;

        if (config.poolAddress) {
            poolAddress = config.poolAddress;
            poolName = 'Direct Pool';
        } else {
            const pool = await searchPool(config.network, config.base, config.quote);
            poolAddress = pool.address;
            poolName = pool.name;
            console.log('[spotPrice] Found pool:', poolName, poolAddress);
        }

        // Fetch candles
        let candles = await fetchCandlesFromGecko(poolAddress, config.network, config.interval, config.limit);
        console.log('[spotPrice] Fetched', candles.length, 'candles');

        // Apply rate if specified
        let rate = 1;
        if (config.rateProvider) {
            rate = await getRate(config.rateProvider, config.network);
            candles = candles.map(c => ({ ...c, value: c.value / rate }));
            console.log('[spotPrice] Applied rate (divided by):', rate);
        }

        // Apply invert if specified
        if (config.invert) {
            candles = candles.map(c => ({ ...c, value: 1 / c.value }));
            console.log('[spotPrice] Inverted prices (1/price)');
        }

        const latestPrice = candles.length > 0 ? candles[candles.length - 1].value : null;

        return {
            candles,
            price: latestPrice,
            rate,
            pool: poolAddress,
            error: null,
        };

    } catch (e) {
        console.error('[spotPrice] Error:', e.message);
        return { candles: [], price: null, rate: null, pool: null, error: e.message };
    }
}

/**
 * Get current spot price (latest candle)
 */
export async function getSpotPrice(configString = DEFAULT_CONFIG) {
    const result = await fetchSpotCandles(configString, 10);
    return result.price;
}
