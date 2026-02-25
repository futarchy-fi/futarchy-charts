/**
 * Registry Adapter
 *
 * Provides a unified interface for looking up proposals from either
 * Graph Node or Checkpoint, normalizing schema differences.
 *
 * Graph Node:
 *   - Entity: proposalEntities (camelCase)
 *   - Metadata: embedded JSON in `metadata` field
 *   - Nested filters: org_: { aggregator_: { id: "..." } }
 *   - Metadata entries: metadataEntries with `where: { key: "...", organization_: { aggregator: "..." } }`
 *
 * Checkpoint:
 *   - Entity: proposalentities (lowercase)
 *   - Metadata: separate metadataentries table
 *   - Flat FK filters: organization: "0x..."
 *   - ID format: plain addresses (same as Graph Node for registry)
 */

import { ENDPOINTS, IS_CHECKPOINT } from '../config/endpoints.js';
import { registryCache } from '../utils/cache.js';

const AGGREGATOR_ADDRESS = '0xc5eb43d53e2fe5fdde5faf400cc4167e5b5d4fc1';

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

async function gqlFetch(url, query, variables = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    const json = await response.json();
    if (json.errors) {
        throw new Error(`GraphQL: ${json.errors[0].message}`);
    }
    return json.data;
}

// ============================================================================
// GRAPH NODE IMPLEMENTATION
// ============================================================================

async function graphNode_lookupBySnapshotId(snapshotId) {
    const normalized = snapshotId.toLowerCase();

    const data = await gqlFetch(ENDPOINTS.registry, `{
        metadataEntries(where: {
            key: "snapshot_id",
            value: "${normalized}"
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
    }`);

    const entries = data?.metadataEntries || [];
    const matching = entries.find(entry => {
        const aggId = entry.proposal?.organization?.aggregator?.id?.toLowerCase();
        return aggId === AGGREGATOR_ADDRESS.toLowerCase();
    });

    if (!matching) return null;

    const proposal = matching.proposal;
    let config = {};
    if (proposal?.metadata) {
        try { config = JSON.parse(proposal.metadata); } catch (e) { /* ignore */ }
    }

    return normalizeProposalResult(proposal, config);
}

async function graphNode_lookupInOrgMetadata(snapshotId) {
    const normalized = snapshotId.toLowerCase();

    const data = await gqlFetch(ENDPOINTS.registry, `{
        metadataEntries(where: {
            key: "${normalized}",
            organization_: { aggregator: "${AGGREGATOR_ADDRESS}" }
        }) {
            value
            organization {
                id
                name
            }
        }
    }`);

    const entry = data?.metadataEntries?.[0];
    if (!entry) return null;

    return {
        proposalId: entry.value?.toLowerCase(),
        proposalAddress: entry.value?.toLowerCase(),
        originalProposalId: entry.value,
        organizationId: entry.organization?.id,
        organizationName: entry.organization?.name,
    };
}

async function graphNode_lookupOrgMetadata(orgId, key) {
    if (!orgId) return null;

    const data = await gqlFetch(ENDPOINTS.registry, `{
        metadataEntries(where: {
            key: "${key}",
            organization: "${orgId}"
        }) {
            value
        }
    }`);

    return data?.metadataEntries?.[0]?.value || null;
}

// ============================================================================
// CHECKPOINT IMPLEMENTATION
// ============================================================================

async function checkpoint_lookupBySnapshotId(snapshotId) {
    const normalized = snapshotId.toLowerCase();

    // Single nested query — Checkpoint supports full nesting!
    // Replaces 4 sequential queries (~4100ms) with 1 query (~500ms)
    const metaData = await gqlFetch(ENDPOINTS.registry, `{
        metadataentries(where: {
            key: "snapshot_id",
            value_contains_nocase: "${normalized}"
        }, first: 5) {
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
    }`);

    // Exact match client-side (value_contains_nocase may return partial matches)
    const entries = (metaData?.metadataentries || [])
        .filter(e => e.value?.toLowerCase() === normalized);

    // Filter by our aggregator
    const matching = entries.find(entry => {
        const aggId = entry.proposal?.organization?.aggregator?.id?.toLowerCase();
        return aggId === AGGREGATOR_ADDRESS.toLowerCase();
    });

    if (!matching) return null;

    const proposal = matching.proposal;
    let config = {};
    if (proposal?.metadata) {
        try { config = JSON.parse(proposal.metadata); } catch (e) { /* ignore */ }
    }

    return normalizeProposalResult(proposal, config);
}

async function checkpoint_lookupInOrgMetadata(snapshotId) {
    const normalized = snapshotId.toLowerCase();

    // Get organizations for our aggregator first
    const orgData = await gqlFetch(ENDPOINTS.registry, `{
        organizations(where: { aggregator: "${AGGREGATOR_ADDRESS}" }) {
            id
            name
        }
    }`);

    const orgs = orgData?.organizations || [];

    // Check each org for a metadata entry with key === snapshotId
    for (const org of orgs) {
        const metaData = await gqlFetch(ENDPOINTS.registry, `{
            metadataentries(where: {
                key: "${normalized}",
                organization: "${org.id}"
            }) {
                value
            }
        }`);

        const entry = metaData?.metadataentries?.[0];
        if (entry) {
            return {
                proposalId: entry.value?.toLowerCase(),
                proposalAddress: entry.value?.toLowerCase(),
                originalProposalId: entry.value,
                organizationId: org.id,
                organizationName: org.name,
            };
        }
    }

    return null;
}

async function checkpoint_getProposalMetadata(proposalId) {
    const data = await gqlFetch(ENDPOINTS.registry, `{
        metadataentries(where: { proposal: "${proposalId}" }, first: 200) {
            key
            value
        }
    }`);
    return data?.metadataentries || [];
}

async function checkpoint_lookupOrgMetadata(orgId, key) {
    if (!orgId) return null;

    const data = await gqlFetch(ENDPOINTS.registry, `{
        metadataentries(where: {
            key: "${key}",
            organization: "${orgId}"
        }) {
            value
        }
    }`);

    return data?.metadataentries?.[0]?.value || null;
}

// ============================================================================
// NORMALIZATION
// ============================================================================

function normalizeProposalResult(proposal, config) {
    return {
        proposalId: proposal?.id?.toLowerCase(),
        proposalAddress: proposal?.proposalAddress?.toLowerCase(),
        originalProposalId: proposal?.id,
        organizationId: proposal?.organization?.id,
        organizationName: proposal?.organization?.name,
        coingeckoTicker: config.coingecko_ticker || null,
        closeTimestamp: config.closeTimestamp ? parseInt(config.closeTimestamp) : null,
        startCandleUnix: config.startCandleUnix ? parseInt(config.startCandleUnix) : null,
        twapStartTimestamp: config.twapStartTimestamp ? parseInt(config.twapStartTimestamp) : null,
        twapDurationHours: config.twapDurationHours ? parseInt(config.twapDurationHours) : null,
        twapDescription: config.twapDescription || null,
        chain: config.chain ? parseInt(config.chain) : null,
        pricePrecision: config.price_precision ? parseInt(config.price_precision) : null,
        currencyStableRate: config.currency_stable_rate || null,
        currencyStableSymbol: config.currency_stable_symbol || null,
    };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Resolve a Snapshot proposal ID to Futarchy proposal data.
 * Works identically regardless of backend mode.
 *
 * @param {string} proposalId - Snapshot proposal ID or trading contract address
 * @returns {Promise<Object>} Normalized proposal data
 */
export async function resolveProposalId(proposalId) {
    const normalized = proposalId.toLowerCase();

    // Check cache first (5 min TTL)
    const cached = registryCache.get(normalized);
    if (cached) {
        console.log(`   ⚡ Registry cache hit: ${normalized.slice(0, 10)}...`);
        return cached;
    }

    // 1. Try snapshot_id lookup
    const lookupFn = IS_CHECKPOINT ? checkpoint_lookupBySnapshotId : graphNode_lookupBySnapshotId;
    const snapshotResult = await lookupFn(normalized);
    if (snapshotResult) {
        registryCache.set(normalized, snapshotResult);
        return snapshotResult;
    }

    // 2. Fall back to org metadata lookup
    const orgLookupFn = IS_CHECKPOINT ? checkpoint_lookupInOrgMetadata : graphNode_lookupInOrgMetadata;
    const orgResult = await orgLookupFn(normalized);
    if (orgResult) {
        registryCache.set(normalized, orgResult);
        return orgResult;
    }

    // 3. Use ID directly
    const fallback = {
        proposalId: normalized,
        proposalAddress: normalized,
        originalProposalId: proposalId,
        organizationId: null,
        organizationName: null,
    };
    registryCache.set(normalized, fallback);
    return fallback;
}

/**
 * Lookup organization-level metadata.
 *
 * @param {string} orgId - Organization ID
 * @param {string} key - Metadata key
 * @returns {Promise<string|null>} Metadata value
 */
export async function lookupOrgMetadata(orgId, key) {
    return IS_CHECKPOINT
        ? checkpoint_lookupOrgMetadata(orgId, key)
        : graphNode_lookupOrgMetadata(orgId, key);
}
