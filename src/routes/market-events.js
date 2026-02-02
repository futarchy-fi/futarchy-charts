/**
 * Market Events Route
 * Replaces: stag.api.tickspread.com/api/v1/market-events/proposals/:proposalId/prices
 * 
 * Uses Futarchy Registry V2 subgraph to dynamically lookup proposals by metadata key
 * Falls back to Algebra pools data + spot price from GeckoTerminal
 */

import { fetchPoolsForProposal } from '../services/algebra-client.js';
import { getSdaiRateCached } from '../services/sdai-rate.js';
import { getSpotPrice } from '../services/spot-price.js';

// ============================================================================
// CONFIGURATION - Easy to modify
// ============================================================================

// Futarchy Registry V2 Subgraph
const FUTARCHY_REGISTRY_ENDPOINT = 'https://d3ugkaojqkfud0.cloudfront.net/subgraphs/name/futarchy-complete-new-v3';

// Trustur Aggregator - filters which organizations to search
const AGGREGATOR_ADDRESS = '0xc5eb43d53e2fe5fdde5faf400cc4167e5b5d4fc1';

// ============================================================================

/**
 * Query Futarchy Registry to find proposal by snapshot_id in proposal metadata
 * 
 * NEW PATTERN: Search metadataEntries where:
 * - key = "snapshot_id" 
 * - value = the snapshot proposal ID
 * - proposal belongs to an org under our aggregator
 * 
 * Returns: { proposalId, proposalAddress, organizationId, organizationName } or null
 */
async function lookupProposalBySnapshotId(snapshotProposalId) {
    const normalizedId = snapshotProposalId.toLowerCase();

    // Query metadataEntries at the Proposal level with snapshot_id key
    // Note: The Graph doesn't support deeply nested filters, so we fetch and verify aggregator in code
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
            // Filter by aggregator in code since nested GraphQL filter isn't supported
            const matching = data.data.metadataEntries.find(entry => {
                const aggregatorId = entry.proposal?.organization?.aggregator?.id?.toLowerCase();
                return aggregatorId === AGGREGATOR_ADDRESS.toLowerCase();
            });

            if (matching) {
                const proposal = matching.proposal;
                console.log(`   🔍 Found by snapshot_id in "${proposal?.organization?.name || 'unknown'}"`);
                console.log(`   📋 Proposal: ${proposal?.title || 'N/A'}`);
                return {
                    proposalId: proposal?.id,  // Metadata contract address
                    proposalAddress: proposal?.proposalAddress,  // Trading contract address
                    organizationId: proposal?.organization?.id,
                    organizationName: proposal?.organization?.name
                };
            }
        }

        return null;
    } catch (error) {
        console.log(`   ⚠️ snapshot_id lookup failed: ${error.message}`);
        return null;
    }
}

/**
 * FALLBACK: Query by organization metadata key (legacy pattern)
 * Some organizations store proposal mappings at the org level
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
            console.log(`   🔍 Found by org metadata in "${entry.organization?.name || 'unknown'}"`);
            return {
                proposalId: entry.value,  // The value is the proposal address
                proposalAddress: entry.value,
                organizationId: entry.organization?.id,
                organizationName: entry.organization?.name
            };
        }

        return null;
    } catch (error) {
        console.log(`   ⚠️ Org metadata lookup failed: ${error.message}`);
        return null;
    }
}

// ============================================================================
// ⭐ COINGECKO TICKER LOOKUP
// ============================================================================
// 
// Store in database with key "coingecko_ticker" and value like:
//   PNK/WETH+!sDAI/WETH-hour-500-xdai
// 
// This will be used to fetch spot price data from GeckoTerminal
// ============================================================================

/**
 * Query Futarchy Registry for organization's coingecko_ticker metadata
 * This allows each organization to configure their spot price ticker
 */
async function lookupTickerInRegistry(organizationId) {
    if (!organizationId) return null;

    const query = `{
        metadataEntries(where: { 
            key: "coingecko_ticker",
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

        if (data.data?.metadataEntries?.length > 0) {
            const ticker = data.data.metadataEntries[0].value;
            console.log(`   📊 Found coingecko_ticker: ${ticker}`);
            return ticker;
        }

        console.log(`   ℹ️ No coingecko_ticker found for org, using default`);
        return null;
    } catch (error) {
        console.log(`   ⚠️ Ticker lookup failed: ${error.message}`);
        return null;
    }
}

/**
 * Query Futarchy Registry for organization's chart_start_range metadata
 * This allows overriding the chart start date for specific proposals
 * Store as Unix timestamp (e.g., "1769385600" for Jan 26, 2026)
 */
async function lookupChartStartRangeInRegistry(organizationId) {
    if (!organizationId) return null;

    const query = `{
        metadataEntries(where: { 
            key: "chart_start_range",
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

        if (data.data?.metadataEntries?.length > 0) {
            const chartStart = parseInt(data.data.metadataEntries[0].value);
            if (!isNaN(chartStart)) {
                console.log(`   📅 Found chart_start_range: ${chartStart} (${new Date(chartStart * 1000).toISOString()})`);
                return chartStart;
            }
        }

        return null;
    } catch (error) {
        console.log(`   ⚠️ chart_start_range lookup failed: ${error.message}`);
        return null;
    }
}

/**
 * Query Futarchy Registry for organization's price_precision metadata
 * This controls decimal places in the price legend (default: 6)
 * Store as string (e.g., "2" for 2 decimal places)
 */
async function lookupPricePrecisionInRegistry(organizationId) {
    if (!organizationId) return null;

    const query = `{
        metadataEntries(where: { 
            key: "price_precision",
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

        if (data.data?.metadataEntries?.length > 0) {
            const precision = parseInt(data.data.metadataEntries[0].value);
            if (!isNaN(precision) && precision >= 0 && precision <= 10) {
                console.log(`   🎯 Found price_precision: ${precision}`);
                return precision;
            }
        }

        return null;
    } catch (error) {
        console.log(`   ⚠️ price_precision lookup failed: ${error.message}`);
        return null;
    }
}

/**
 * Query Futarchy Registry for organization's currency_stable_rate metadata
 * This is a rate provider address for converting sDAI to USD
 * When present, YES/NO chart prices should be multiplied by this rate
 * Store as address (e.g., "0x89c80a4540a00b5270347e02e2e144c71da2eced")
 */
async function lookupCurrencyRateProviderInRegistry(organizationId) {
    if (!organizationId) return null;

    const query = `{
        metadataEntries(where: { 
            key: "currency_stable_rate",
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

        if (data.data?.metadataEntries?.length > 0) {
            const rateProviderAddress = data.data.metadataEntries[0].value;
            if (rateProviderAddress && rateProviderAddress.startsWith('0x')) {
                console.log(`   💱 Found currency_stable_rate: ${rateProviderAddress.slice(0, 10)}...`);
                return rateProviderAddress;
            }
        }

        return null;
    } catch (error) {
        console.log(`   ⚠️ currency_stable_rate lookup failed: ${error.message}`);
        return null;
    }
}

/**
 * Query Futarchy Registry for organization's currency_stable_symbol metadata
 * This is the display symbol for the stable currency (e.g., "xDAI", "USD")
 * Store as string (e.g., "xDAI")
 */
async function lookupCurrencyStableSymbolInRegistry(organizationId) {
    if (!organizationId) return null;

    const query = `{
        metadataEntries(where: { 
            key: "currency_stable_symbol",
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

        if (data.data?.metadataEntries?.length > 0) {
            const symbol = data.data.metadataEntries[0].value;
            if (symbol) {
                console.log(`   💵 Found currency_stable_symbol: ${symbol}`);
                return symbol;
            }
        }

        return null;
    } catch (error) {
        console.log(`   ⚠️ currency_stable_symbol lookup failed: ${error.message}`);
        return null;
    }
}

/**
 * Resolve Snapshot proposal ID to Futarchy proposal ID
 * 
 * Priority:
 * 1. Try snapshot_id lookup in proposal metadata (NEW - most reliable)
 * 2. Fall back to organization metadata key lookup (legacy)
 * 3. Use the ID directly as-is (last resort)
 * 
 * Returns: { proposalId, proposalAddress, organizationId, organizationName }
 */
async function resolveProposalId(proposalId) {
    const normalized = proposalId.toLowerCase();

    // 1. Try snapshot_id lookup (NEW - preferred method)
    const snapshotResult = await lookupProposalBySnapshotId(normalized);
    if (snapshotResult) {
        return {
            proposalId: snapshotResult.proposalId?.toLowerCase(),  // Metadata contract
            proposalAddress: snapshotResult.proposalAddress?.toLowerCase(),  // Trading contract
            originalProposalId: snapshotResult.proposalId,
            organizationId: snapshotResult.organizationId,
            organizationName: snapshotResult.organizationName
        };
    }

    // 2. Fall back to org metadata lookup (legacy pattern)
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

    // 3. Use ID directly (assume it's already a Futarchy proposal ID)
    console.log(`   ℹ️ No registry mapping found, using proposal ID directly`);
    return {
        proposalId: normalized,
        proposalAddress: normalized,  // Assume it's the trading contract directly
        originalProposalId: proposalId,  // Keep original case
        organizationId: null,
        organizationName: null
    };
}

// Mocked timeline: start = 2 days ago, end = 3 days from now
function getMockedTimeline() {
    const now = Date.now();
    const start = now - (2 * 24 * 60 * 60 * 1000); // 2 days ago
    const end = now + (3 * 24 * 60 * 60 * 1000);   // 3 days from now
    return {
        start: Math.floor(start / 1000),
        end: Math.floor(end / 1000)
    };
}

export async function handleMarketEventsRequest(req, res) {
    const { proposalId } = req.params;

    console.log(`📊 [Market Events] Request: ${proposalId.slice(0, 10)}...`);

    try {
        // Dynamically resolve proposal ID using registry
        const resolved = await resolveProposalId(proposalId);
        // Use proposalAddress (trading contract) for pool lookup
        const tradingContractId = resolved.proposalAddress || resolved.proposalId;
        console.log(`   🔗 Resolved to trading contract: ${tradingContractId?.slice(0, 10)}...`);

        // ⭐ Lookup organization's coingecko_ticker metadata
        const ticker = await lookupTickerInRegistry(resolved.organizationId);

        // ⭐ Lookup chart_start_range (optional override for chart start date)
        const chartStartRange = await lookupChartStartRangeInRegistry(resolved.organizationId);

        // ⭐ Lookup price_precision (controls decimal places in legend)
        const pricePrecision = await lookupPricePrecisionInRegistry(resolved.organizationId);

        // ⭐ Lookup currency_stable_rate (rate provider for sDAI→USD conversion)
        const currencyRateProvider = await lookupCurrencyRateProviderInRegistry(resolved.organizationId);

        // ⭐ Lookup currency_stable_symbol (display symbol like "xDAI")
        const currencyStableSymbol = await lookupCurrencyStableSymbolInRegistry(resolved.organizationId);

        // Fetch sDAI rate for USD conversion
        const sdaiRate = await getSdaiRateCached();

        // ⭐ Only fetch spot price if coingecko_ticker is configured
        let spotPrice = null;
        if (ticker) {
            spotPrice = await getSpotPrice(ticker);
            console.log(`   💹 Spot price: $${spotPrice?.toFixed(4) || 'N/A'}`);
        } else {
            console.log(`   ⏭️ Skipping spot price (no coingecko_ticker configured)`);
        }

        // Fetch pools from Algebra subgraph using trading contract address
        const pools = await fetchPoolsForProposal(tradingContractId);
        console.log(`   📦 Found ${pools.length} pools`);

        // Find YES and NO conditional pools
        const yesPool = pools.find(p => p.outcomeSide === 'YES' && p.type === 'CONDITIONAL');
        const noPool = pools.find(p => p.outcomeSide === 'NO' && p.type === 'CONDITIONAL');

        // Get company token from proposal
        const proposal = pools[0]?.proposal;
        const companyToken = proposal?.companyToken;
        const currencyToken = proposal?.currencyToken;

        // Convert sDAI prices to USD
        const yesPrice = yesPool ? parseFloat(yesPool.price) * sdaiRate : 0;
        const noPrice = noPool ? parseFloat(noPool.price) * sdaiRate : 0;

        // Get timeline (mocked for now)
        const timeline = getMockedTimeline();

        // Build response with REAL pool IDs (essential for candles query)
        const response = {
            event_id: resolved.originalProposalId,  // Original case for links
            conditional_yes: {
                price_usd: yesPrice,
                pool_id: yesPool?.id || ''  // Real pool ID from subgraph
            },
            conditional_no: {
                price_usd: noPrice,
                pool_id: noPool?.id || ''   // Real pool ID from subgraph
            },
            spot: {
                price_usd: spotPrice,
                // ⭐ Include ticker so graphql-proxy can fetch spot candles
                pool_ticker: ticker || null
            },
            company_tokens: {
                base: {
                    tokenSymbol: companyToken?.symbol || 'PNK'
                },
                currency: {
                    tokenSymbol: currencyToken?.symbol || 'sDAI',
                    stableSymbol: currencyStableSymbol || null  // e.g., "xDAI" from metadata
                }
            },
            timeline: {
                start: timeline.start,
                end: timeline.end,
                chart_start_range: chartStartRange || null,
                price_precision: pricePrecision,
                // If rate provider is configured, include the rate for YES/NO price conversion
                currency_rate: currencyRateProvider ? sdaiRate : null
            },
            volume: {
                conditional_yes: yesPool ? (() => {
                    // Roles are: YES_CURRENCY, NO_CURRENCY, YES_COMPANY, NO_COMPANY
                    // Use includes() to match the suffix
                    const currencyVolume = yesPool.token0?.role?.includes('CURRENCY')
                        ? yesPool.volumeToken0
                        : yesPool.token1?.role?.includes('CURRENCY')
                            ? yesPool.volumeToken1
                            : yesPool.volumeToken1;
                    const companyVolume = yesPool.token0?.role?.includes('COMPANY')
                        ? yesPool.volumeToken0
                        : yesPool.token1?.role?.includes('COMPANY')
                            ? yesPool.volumeToken1
                            : yesPool.volumeToken0;
                    return {
                        status: 'ok',
                        pool_id: yesPool.id,
                        volume: companyVolume || '0',
                        // Return raw currency volume - rate will be applied in frontend based on toggle
                        volume_usd: currencyVolume || '0'
                    };
                })() : undefined,
                conditional_no: noPool ? (() => {
                    const currencyVolume = noPool.token0?.role?.includes('CURRENCY')
                        ? noPool.volumeToken0
                        : noPool.token1?.role?.includes('CURRENCY')
                            ? noPool.volumeToken1
                            : noPool.volumeToken1;
                    const companyVolume = noPool.token0?.role?.includes('COMPANY')
                        ? noPool.volumeToken0
                        : noPool.token1?.role?.includes('COMPANY')
                            ? noPool.volumeToken1
                            : noPool.volumeToken0;
                    return {
                        status: 'ok',
                        pool_id: noPool.id,
                        volume: companyVolume || '0',
                        // Return raw currency volume - rate will be applied in frontend based on toggle
                        volume_usd: currencyVolume || '0'
                    };
                })() : undefined
            }
        };

        if (yesPool && noPool) {
            console.log(`   ✅ YES: $${yesPrice.toFixed(4)} (${yesPool.id.slice(0, 10)}...), NO: $${noPrice.toFixed(4)} (${noPool.id.slice(0, 10)}...)`);
        } else {
            console.log(`   ⚠️ Missing pools - YES: ${!!yesPool}, NO: ${!!noPool}`);
        }

        res.json(response);

    } catch (error) {
        console.error('   ❌ Error:', error.message);
        res.status(500).json({ error: error.message });
    }
}
