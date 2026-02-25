/**
 * Unified Chart Endpoint (v2)
 * 
 * GET /api/v2/proposals/:proposalId/chart?minTimestamp=...&maxTimestamp=...
 * 
 * Combines all data the UI needs in a single request:
 *   - Market metadata (prices, pool IDs, volume, timeline, tokens)
 *   - YES/NO candles (from Checkpoint or Graph Node)
 *   - Spot candles (from GeckoTerminal, rate-divided)
 * 
 * Reuses existing adapters from market-events.js — no logic duplication.
 */

import { fetchPoolsForProposal as fetchPoolsAdapter, fetchCandles } from '../adapters/candles-adapter.js';
import { resolveProposalId as resolveProposalAdapter } from '../adapters/registry-adapter.js';
import { IS_CHECKPOINT, ENDPOINTS } from '../config/endpoints.js';
import { fetchPoolsForProposal } from '../services/algebra-client.js';
import { getRateCached } from '../services/rate-provider.js';
import { getSpotPrice, fetchSpotCandles } from '../services/spot-price.js';

// ============================================================================
// REGISTRY HELPERS (only for non-Checkpoint fallback)
// ============================================================================

const FUTARCHY_REGISTRY_ENDPOINT = ENDPOINTS.registry;
const AGGREGATOR_ADDRESS = '0xc5eb43d53e2fe5fdde5faf400cc4167e5b5d4fc1';

async function gqlFetch(url, query) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    return res.json();
}

/**
 * Lookup org-level metadata (price_precision, currency_stable_rate, etc.)
 * Only needed when not available from proposal-level metadata.
 */
async function lookupOrgMetadataField(orgId, key) {
    if (!orgId) return null;
    try {
        const query = `{
            metadataEntries(where: { key: "${key}", organization: "${orgId}" }) { value }
        }`;
        const data = await gqlFetch(FUTARCHY_REGISTRY_ENDPOINT, query);
        return data?.data?.metadataEntries?.[0]?.value || null;
    } catch { return null; }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleUnifiedChartRequest(req, res) {
    const { proposalId } = req.params;
    const minTimestamp = parseInt(req.query.minTimestamp) || 0;
    const maxTimestamp = parseInt(req.query.maxTimestamp) || Math.floor(Date.now() / 1000);

    console.log(`⚡ [Unified Chart] ${proposalId.slice(0, 10)}... (${minTimestamp}→${maxTimestamp})`);
    const t0 = Date.now();

    try {
        // ── Step 1: Resolve proposal using EXISTING adapter ──
        // This is the same function market-events.js uses
        const resolved = await resolveProposalAdapter(proposalId);
        const tradingContractId = resolved.proposalAddress || resolved.proposalId;
        const ticker = resolved.coingeckoTicker || null;
        const chartStartRange = resolved.startCandleUnix || null;
        const closeTimestamp = resolved.closeTimestamp || null;
        const chainId = resolved.chain || 100;

        console.log(`   🔗 Resolved: ${tradingContractId?.slice(0, 10)}... chain=${chainId} ticker=${ticker?.slice(0, 20) || 'none'}`);

        // ── Step 2: Fetch pools ──
        const pools = IS_CHECKPOINT
            ? await fetchPoolsAdapter(tradingContractId, chainId)
            : await fetchPoolsForProposal(tradingContractId);

        const yesPool = pools.find(p => p.outcomeSide === 'YES' && p.type === 'CONDITIONAL');
        const noPool = pools.find(p => p.outcomeSide === 'NO' && p.type === 'CONDITIONAL');

        console.log(`   📦 Pools: YES=${!!yesPool} NO=${!!noPool}`);

        // ── Step 3: Org-level metadata (fallback when not on proposal) ──
        const pricePrecision = resolved.pricePrecision ?? await lookupOrgMetadataField(resolved.organizationId, 'price_precision');
        const currencyRateProvider = resolved.currencyStableRate ?? await lookupOrgMetadataField(resolved.organizationId, 'currency_stable_rate');
        const currencyStableSymbol = resolved.currencyStableSymbol ?? await lookupOrgMetadataField(resolved.organizationId, 'currency_stable_symbol');

        // ── Step 4: Fetch ALL remaining data in PARALLEL ──
        const [currencyRate, yesCandles, noCandles, spotData] = await Promise.all([
            getRateCached(currencyRateProvider, chainId),
            yesPool ? fetchCandles(yesPool.id, minTimestamp, maxTimestamp, chainId) : Promise.resolve([]),
            noPool ? fetchCandles(noPool.id, minTimestamp, maxTimestamp, chainId) : Promise.resolve([]),
            ticker ? fetchSpotCandles(ticker, 500) : Promise.resolve(null),
        ]);

        // ── Step 5: Process spot candles (filter + rate-divide) ──
        let spotCandles = [];
        let spotPrice = null;
        if (spotData && ticker) {
            let rateDivisor = 1;
            if (ticker.includes('::')) {
                rateDivisor = currencyRate || 1;
            }
            spotCandles = (spotData.candles || [])
                .filter(c => c.time >= minTimestamp && c.time <= maxTimestamp)
                .map(c => ({
                    periodStartUnix: String(c.time),
                    close: String(c.value / rateDivisor)
                }));

            const rawSpotPrice = spotData.price;
            if (rawSpotPrice !== null) {
                spotPrice = ticker.includes('::') ? rawSpotPrice / (currencyRate || 1) : rawSpotPrice;
            }
        }

        // ── Step 6: Extract token info ──
        const proposal = pools[0]?.proposal;
        let companyToken = proposal?.companyToken;
        let currencyToken = proposal?.currencyToken;

        if (!companyToken?.symbol && yesPool?.name) {
            const match = yesPool.name.match(/^YES_(\w+)\s*\/\s*YES_(\w+)$/);
            if (match) {
                companyToken = { id: null, symbol: match[1] };
                currencyToken = { id: null, symbol: match[2] };
            }
        }

        // ── Step 7: Prices ──
        const yesPrice = yesPool ? parseFloat(yesPool.price) * (currencyRate || 1) : 0;
        const noPrice = noPool ? parseFloat(noPool.price) * (currencyRate || 1) : 0;

        // ── Step 8: Volume ──
        function extractVolume(pool) {
            if (!pool) return undefined;
            const currencyVolume = pool.token0?.role?.includes('CURRENCY')
                ? pool.volumeToken0 : pool.token1?.role?.includes('CURRENCY')
                    ? pool.volumeToken1 : pool.volumeToken1;
            const companyVolume = pool.token0?.role?.includes('COMPANY')
                ? pool.volumeToken0 : pool.token1?.role?.includes('COMPANY')
                    ? pool.volumeToken1 : pool.volumeToken0;
            return { status: 'ok', pool_id: pool.id, volume: companyVolume || '0', volume_usd: currencyVolume || '0' };
        }

        // ── Build unified response ──
        const now = Math.floor(Date.now() / 1000);
        const response = {
            market: {
                event_id: resolved.originalProposalId,
                conditional_yes: { price_usd: yesPrice, pool_id: yesPool?.id || '' },
                conditional_no: { price_usd: noPrice, pool_id: noPool?.id || '' },
                spot: { price_usd: spotPrice, pool_ticker: ticker || null },
                company_tokens: {
                    base: { tokenSymbol: companyToken?.symbol || 'TOKEN' },
                    currency: { tokenSymbol: currencyToken?.symbol || 'CURRENCY', stableSymbol: currencyStableSymbol || null }
                },
                timeline: {
                    start: chartStartRange || (now - 2 * 24 * 3600),
                    end: closeTimestamp || (now + 3 * 24 * 3600),
                    chain_id: chainId,
                    chart_start_range: chartStartRange || null,
                    close_timestamp: closeTimestamp || null,
                    price_precision: pricePrecision ? parseInt(pricePrecision) : null,
                    currency_rate: currencyRateProvider ? currencyRate : null
                },
                volume: {
                    conditional_yes: extractVolume(yesPool),
                    conditional_no: extractVolume(noPool)
                }
            },
            candles: {
                yes: yesCandles,
                no: noCandles,
                spot: spotCandles
            }
        };

        const elapsed = Date.now() - t0;
        console.log(`   ✅ Done: YES=${yesCandles.length} NO=${noCandles.length} SPOT=${spotCandles.length} (${elapsed}ms)`);
        res.json(response);

    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
}
