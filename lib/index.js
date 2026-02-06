/**
 * Futarchy Charts - Offline Module
 * 
 * Standalone library for fetching Futarchy market data without Express server.
 * 
 * Usage:
 *   import { getMarketData, getCandles, getSpotPrice } from 'futarchy-charts/lib';
 *   
 *   const data = await getMarketData('0x45e1064348fd8a407d6d1f59fc64b05f633b28fc');
 *   console.log(data.conditional_yes.price);
 */

// Re-export all services
export { fetchPoolsForProposal, getLatestPrice } from '../src/services/algebra-client.js';
export { getRate, getRateCached } from '../src/services/rate-provider.js';
export { fetchSpotCandles, getSpotPrice } from '../src/services/spot-price.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const FUTARCHY_REGISTRY_ENDPOINT = 'https://d3ugkaojqkfud0.cloudfront.net/subgraphs/name/futarchy-complete-new-v3';
const AGGREGATOR_ADDRESS = '0xc5eb43d53e2fe5fdde5faf400cc4167e5b5d4fc1';
const ALGEBRA_ENDPOINT = 'https://d3ugkaojqkfud0.cloudfront.net/subgraphs/name/algebra-proposal-candles-v1';
const ONE_HOUR = 3600;

// ============================================================================
// REGISTRY LOOKUPS
// ============================================================================

/**
 * Query Futarchy Registry to find proposal by snapshot_id
 */
async function lookupProposalBySnapshotId(snapshotProposalId) {
    const normalizedId = snapshotProposalId.toLowerCase();

    const query = `{
        metadataEntries(where: { 
            key: "snapshot_id",
            value: "${normalizedId}"
        }) {
            value
            proposal {
                id
                proposalAddress
                title
                metadata
                organization { 
                    id 
                    name 
                    aggregator { id }
                }
            }
        }
    }`;

    try {
        const response = await fetch(FUTARCHY_REGISTRY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const data = await response.json();

        if (data.data?.metadataEntries?.length > 0) {
            const matching = data.data.metadataEntries.find(entry => {
                const aggregatorId = entry.proposal?.organization?.aggregator?.id?.toLowerCase();
                return aggregatorId === AGGREGATOR_ADDRESS.toLowerCase();
            });

            if (matching) {
                const proposal = matching.proposal;
                let proposalConfig = {};
                if (proposal?.metadata) {
                    try {
                        proposalConfig = JSON.parse(proposal.metadata);
                    } catch (e) { /* ignore */ }
                }

                return {
                    proposalId: proposal?.id,
                    proposalAddress: proposal?.proposalAddress,
                    organizationId: proposal?.organization?.id,
                    organizationName: proposal?.organization?.name,
                    coingeckoTicker: proposalConfig.coingecko_ticker || null,
                    closeTimestamp: proposalConfig.closeTimestamp ? parseInt(proposalConfig.closeTimestamp) : null,
                    startCandleUnix: proposalConfig.startCandleUnix ? parseInt(proposalConfig.startCandleUnix) : null,
                    twapStartTimestamp: proposalConfig.twapStartTimestamp ? parseInt(proposalConfig.twapStartTimestamp) : null,
                    twapDurationHours: proposalConfig.twapDurationHours ? parseInt(proposalConfig.twapDurationHours) : null,
                    twapDescription: proposalConfig.twapDescription || null,
                    chain: proposalConfig.chain ? parseInt(proposalConfig.chain) : null,
                    pricePrecision: proposalConfig.price_precision ? parseInt(proposalConfig.price_precision) : null,
                    currencyStableRate: proposalConfig.currency_stable_rate || null,
                    currencyStableSymbol: proposalConfig.currency_stable_symbol || null
                };
            }
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Fallback: Query by organization metadata key (legacy pattern)
 */
async function lookupProposalInOrgMetadata(snapshotProposalId) {
    const normalizedId = snapshotProposalId.toLowerCase();

    const query = `{
        metadataEntries(where: { 
            key: "${normalizedId}",
            organization_: { aggregator: "${AGGREGATOR_ADDRESS}" }
        }) {
            value
            organization { 
                id 
                name 
            }
        }
    }`;

    try {
        const response = await fetch(FUTARCHY_REGISTRY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const data = await response.json();

        if (data.data?.metadataEntries?.length > 0) {
            const entry = data.data.metadataEntries[0];
            return {
                proposalId: entry.value,
                proposalAddress: entry.value,
                organizationId: entry.organization?.id,
                organizationName: entry.organization?.name
            };
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Lookup organization metadata by key
 */
async function lookupOrgMetadata(organizationId, key) {
    if (!organizationId) return null;

    const query = `{
        metadataEntries(where: { 
            key: "${key}",
            organization: "${organizationId}"
        }) {
            value
        }
    }`;

    try {
        const response = await fetch(FUTARCHY_REGISTRY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const data = await response.json();
        return data.data?.metadataEntries?.[0]?.value || null;
    } catch (error) {
        return null;
    }
}

/**
 * Resolve Snapshot proposal ID to Futarchy proposal ID
 */
export async function resolveProposalId(proposalId) {
    const normalized = proposalId.toLowerCase();

    // 1. Try snapshot_id lookup
    const snapshotResult = await lookupProposalBySnapshotId(normalized);
    if (snapshotResult) {
        return {
            proposalId: snapshotResult.proposalId?.toLowerCase(),
            proposalAddress: snapshotResult.proposalAddress?.toLowerCase(),
            originalProposalId: snapshotResult.proposalId,
            organizationId: snapshotResult.organizationId,
            organizationName: snapshotResult.organizationName,
            coingeckoTicker: snapshotResult.coingeckoTicker,
            closeTimestamp: snapshotResult.closeTimestamp,
            startCandleUnix: snapshotResult.startCandleUnix,
            twapStartTimestamp: snapshotResult.twapStartTimestamp,
            twapDurationHours: snapshotResult.twapDurationHours,
            twapDescription: snapshotResult.twapDescription,
            chain: snapshotResult.chain,
            pricePrecision: snapshotResult.pricePrecision,
            currencyStableRate: snapshotResult.currencyStableRate,
            currencyStableSymbol: snapshotResult.currencyStableSymbol
        };
    }

    // 2. Fall back to org metadata lookup
    const orgResult = await lookupProposalInOrgMetadata(normalized);
    if (orgResult) {
        return {
            proposalId: orgResult.proposalId?.toLowerCase(),
            proposalAddress: orgResult.proposalAddress?.toLowerCase(),
            originalProposalId: orgResult.proposalId,
            organizationId: orgResult.organizationId,
            organizationName: orgResult.organizationName
        };
    }

    // 3. Use ID directly
    return {
        proposalId: normalized,
        proposalAddress: normalized,
        originalProposalId: proposalId,
        organizationId: null,
        organizationName: null
    };
}

// ============================================================================
// MAIN API FUNCTIONS
// ============================================================================

import { fetchPoolsForProposal } from '../src/services/algebra-client.js';
import { getRateCached } from '../src/services/rate-provider.js';
import { getSpotPrice as getSpotPriceService } from '../src/services/spot-price.js';

/**
 * Get complete market data for a proposal
 * 
 * @param {string} proposalId - Snapshot proposal ID or trading contract address
 * @returns {Promise<Object>} Market data including prices, volume, timeline
 */
export async function getMarketData(proposalId) {
    // Resolve proposal ID
    const resolved = await resolveProposalId(proposalId);
    const tradingContractId = resolved.proposalAddress || resolved.proposalId;

    // Get config from proposal metadata
    const ticker = resolved.coingeckoTicker || null;
    const chartStartRange = resolved.startCandleUnix || null;
    const closeTimestamp = resolved.closeTimestamp || null;

    // Org-level fallbacks
    const pricePrecision = resolved.pricePrecision ??
        (resolved.organizationId ? parseInt(await lookupOrgMetadata(resolved.organizationId, 'price_precision')) || null : null);
    const currencyRateProvider = resolved.currencyStableRate ??
        await lookupOrgMetadata(resolved.organizationId, 'currency_stable_rate');
    const currencyStableSymbol = resolved.currencyStableSymbol ??
        await lookupOrgMetadata(resolved.organizationId, 'currency_stable_symbol');

    // Get chain from proposal metadata (default: 100 = Gnosis)
    const chainId = resolved.chain || 100;

    // Fetch currency rate using chain-aware provider
    const currencyRate = await getRateCached(currencyRateProvider, chainId);

    // Fetch spot price if ticker configured
    // If ticker includes :: it has a rate provider built-in, otherwise apply currencyRate
    let spotPrice = null;
    if (ticker) {
        const rawSpotPrice = await getSpotPriceService(ticker);
        // Check if ticker already has rate provider (::)
        const tickerHasRateProvider = ticker.includes('::');
        if (rawSpotPrice !== null) {
            // If ticker has ::, rate is already applied; otherwise multiply by currencyRate
            spotPrice = tickerHasRateProvider ? rawSpotPrice : rawSpotPrice * currencyRate;
        }
    }

    // Fetch pools from Algebra subgraph
    const pools = await fetchPoolsForProposal(tradingContractId);

    // Find YES and NO pools
    const yesPool = pools.find(p => p.outcomeSide === 'YES' && p.type === 'CONDITIONAL');
    const noPool = pools.find(p => p.outcomeSide === 'NO' && p.type === 'CONDITIONAL');

    // Get token info
    const proposal = pools[0]?.proposal;
    const companyToken = proposal?.companyToken;
    const currencyToken = proposal?.currencyToken;

    // Convert prices to USD using chain-aware rate
    const yesPrice = yesPool ? parseFloat(yesPool.price) * currencyRate : 0;
    const noPrice = noPool ? parseFloat(noPool.price) * currencyRate : 0;

    // Timeline
    const now = Math.floor(Date.now() / 1000);
    const timelineStart = chartStartRange || (now - 2 * 24 * 60 * 60);
    const timelineEnd = closeTimestamp || (now + 3 * 24 * 60 * 60);

    return {
        event_id: resolved.originalProposalId,
        conditional_yes: {
            price: yesPrice,
            pool_id: yesPool?.id || ''
        },
        conditional_no: {
            price: noPrice,
            pool_id: noPool?.id || ''
        },
        spot: {
            price: spotPrice,
            pool_ticker: ticker || null
        },
        company_tokens: {
            base: {
                tokenSymbol: companyToken?.symbol || 'TOKEN'
            },
            currency: {
                tokenSymbol: currencyToken?.symbol || 'CURRENCY',
                stableSymbol: currencyStableSymbol || null
            }
        },
        timeline: {
            start: timelineStart,
            end: timelineEnd,
            chart_start_range: chartStartRange || null,
            close_timestamp: closeTimestamp || null,
            price_precision: pricePrecision,
            currency_rate: currencyRateProvider ? currencyRate : null
        },
        volume: {
            conditional_yes: yesPool ? {
                status: 'ok',
                pool_id: yesPool.id,
                volume: yesPool.token0?.role?.includes('COMPANY') ? yesPool.volumeToken0 : yesPool.volumeToken1,
                volume_usd: yesPool.token0?.role?.includes('CURRENCY') ? yesPool.volumeToken0 : yesPool.volumeToken1
            } : undefined,
            conditional_no: noPool ? {
                status: 'ok',
                pool_id: noPool.id,
                volume: noPool.token0?.role?.includes('COMPANY') ? noPool.volumeToken0 : noPool.volumeToken1,
                volume_usd: noPool.token0?.role?.includes('CURRENCY') ? noPool.volumeToken0 : noPool.volumeToken1
            } : undefined
        },
        _meta: {
            resolved,
            currencyRate,
            chainId,
            poolCount: pools.length
        }
    };
}

// ============================================================================
// CANDLES API
// ============================================================================

/**
 * Forward-fill candles to create continuous hourly data
 */
function forwardFillCandles(candles, maxTimestamp) {
    if (!candles || candles.length === 0) return candles;

    const filled = [];
    const nowSeconds = Math.floor(Date.now() / 1000);
    const effectiveMax = Math.min(maxTimestamp, nowSeconds);

    for (let i = 0; i < candles.length; i++) {
        const current = candles[i];
        const currentTime = parseInt(current.periodStartUnix);

        if (currentTime <= effectiveMax) {
            filled.push(current);
        }

        if (i < candles.length - 1) {
            const nextTime = parseInt(candles[i + 1].periodStartUnix);
            const gapHours = (nextTime - currentTime) / ONE_HOUR;

            if (gapHours > 1) {
                for (let hour = 1; hour < gapHours; hour++) {
                    const fillTime = currentTime + (hour * ONE_HOUR);
                    if (fillTime <= effectiveMax) {
                        filled.push({
                            periodStartUnix: String(fillTime),
                            close: current.close
                        });
                    }
                }
            }
        } else {
            let fillTime = currentTime + ONE_HOUR;
            while (fillTime <= effectiveMax) {
                filled.push({
                    periodStartUnix: String(fillTime),
                    close: current.close
                });
                fillTime += ONE_HOUR;
            }
        }
    }

    return filled;
}

/**
 * Fetch candles for YES/NO pools
 * 
 * @param {Object} options
 * @param {string} options.yesPoolId - YES pool address
 * @param {string} options.noPoolId - NO pool address
 * @param {number} [options.minTimestamp] - Start of date range (unix)
 * @param {number} [options.maxTimestamp] - End of date range (unix)
 * @param {string} [options.poolTicker] - GeckoTerminal ticker for spot candles
 * @param {boolean} [options.forwardFill=true] - Fill gaps in data
 * @returns {Promise<Object>} Candles for YES, NO, and SPOT
 */
export async function getCandles({
    yesPoolId,
    noPoolId,
    minTimestamp,
    maxTimestamp,
    poolTicker = null,
    forwardFill = true
}) {
    const now = Math.floor(Date.now() / 1000);
    minTimestamp = minTimestamp || 0;
    maxTimestamp = maxTimestamp || now;

    // GraphQL query for YES/NO candles
    const query = `
    query GetCandles($yesPoolId: String!, $noPoolId: String!, $minTimestamp: BigInt!, $maxTimestamp: BigInt!) {
        yesCandles: candles(
            first: 1000
            orderBy: periodStartUnix
            orderDirection: asc
            where: { pool: $yesPoolId, period: "3600", periodStartUnix_gte: $minTimestamp, periodStartUnix_lte: $maxTimestamp }
        ) {
            periodStartUnix
            close
        }
        noCandles: candles(
            first: 1000
            orderBy: periodStartUnix
            orderDirection: asc
            where: { pool: $noPoolId, period: "3600", periodStartUnix_gte: $minTimestamp, periodStartUnix_lte: $maxTimestamp }
        ) {
            periodStartUnix
            close
        }
    }`;

    const variables = {
        yesPoolId,
        noPoolId,
        minTimestamp: String(minTimestamp),
        maxTimestamp: String(now) // Fetch up to now, filter later
    };

    // Fetch subgraph data
    const response = await fetch(ALGEBRA_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
    });

    const data = await response.json();

    if (data.errors) {
        throw new Error(data.errors[0].message);
    }

    // Process candles
    let yesCandles = data.data?.yesCandles || [];
    let noCandles = data.data?.noCandles || [];

    if (forwardFill) {
        yesCandles = forwardFillCandles(yesCandles, maxTimestamp);
        noCandles = forwardFillCandles(noCandles, maxTimestamp);
    }

    // Filter to requested range
    yesCandles = yesCandles.filter(c =>
        parseInt(c.periodStartUnix) >= minTimestamp && parseInt(c.periodStartUnix) <= maxTimestamp
    );
    noCandles = noCandles.filter(c =>
        parseInt(c.periodStartUnix) >= minTimestamp && parseInt(c.periodStartUnix) <= maxTimestamp
    );

    // Fetch spot candles if ticker provided
    let spotCandles = [];
    if (poolTicker) {
        const { fetchSpotCandles } = await import('../src/services/spot-price.js');
        const spotData = await fetchSpotCandles(poolTicker, 500);
        if (spotData?.candles?.length > 0) {
            spotCandles = spotData.candles
                .filter(c => c.time >= minTimestamp && c.time <= maxTimestamp)
                .map(c => ({
                    periodStartUnix: String(c.time),
                    close: String(c.value)
                }));
        }
    }

    return {
        yesCandles,
        noCandles,
        spotCandles,
        meta: {
            yesCount: yesCandles.length,
            noCount: noCandles.length,
            spotCount: spotCandles.length,
            range: { minTimestamp, maxTimestamp }
        }
    };
}
