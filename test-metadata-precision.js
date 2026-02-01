/**
 * Test: Direct Subgraph Query for price_precision metadata
 * 
 * This tests the exact same query that futarchy-charts uses
 * to lookup price_precision for an organization.
 */

const FUTARCHY_REGISTRY_ENDPOINT = 'https://d3ugkaojqkfud0.cloudfront.net/subgraphs/name/futarchy-complete-new-v3';
const AGGREGATOR_ADDRESS = '0xc5eb43d53e2fe5fdde5faf400cc4167e5b5d4fc1';

// Test proposal ID (Snapshot)
const SNAPSHOT_PROPOSAL_ID = '0x006f4ae69973023cc3ca516065ca7410a2db5c915688a64f368020b87db7e149';

async function lookupProposal(snapshotId) {
    const normalizedId = snapshotId.toLowerCase();

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

    const response = await fetch(FUTARCHY_REGISTRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    const data = await response.json();
    console.log('🔍 Proposal Lookup Response:');
    console.log(JSON.stringify(data, null, 2));

    if (data.data?.metadataEntries?.length > 0) {
        return {
            proposalId: data.data.metadataEntries[0].value,
            organizationId: data.data.metadataEntries[0].organization?.id,
            organizationName: data.data.metadataEntries[0].organization?.name
        };
    }
    return null;
}

async function lookupPricePrecision(organizationId) {
    const query = `{
        metadataEntries(where: { 
            key: "price_precision",
            organization: "${organizationId}"
        }) {
            value
        }
    }`;

    console.log('\n📊 Query for price_precision:');
    console.log(query);

    const response = await fetch(FUTARCHY_REGISTRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    const data = await response.json();
    console.log('\n🎯 Price Precision Response:');
    console.log(JSON.stringify(data, null, 2));

    if (data.data?.metadataEntries?.length > 0) {
        return data.data.metadataEntries[0].value;
    }
    return null;
}

async function listAllMetadataForOrg(organizationId) {
    const query = `{
        metadataEntries(where: { 
            organization: "${organizationId}"
        }, first: 50) {
            key
            value
        }
    }`;

    console.log('\n📋 All metadata for organization:');

    const response = await fetch(FUTARCHY_REGISTRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));

    return data.data?.metadataEntries || [];
}

async function main() {
    console.log('='.repeat(60));
    console.log('Testing price_precision metadata lookup');
    console.log('='.repeat(60));
    console.log(`\nSnapshot Proposal ID: ${SNAPSHOT_PROPOSAL_ID}`);
    console.log(`Registry Endpoint: ${FUTARCHY_REGISTRY_ENDPOINT}`);

    // Step 1: Lookup proposal to get organization ID
    const proposal = await lookupProposal(SNAPSHOT_PROPOSAL_ID);

    if (!proposal) {
        console.log('\n❌ Proposal not found in registry');
        return;
    }

    console.log(`\n✅ Found proposal: ${proposal.proposalId}`);
    console.log(`   Organization: ${proposal.organizationName} (${proposal.organizationId})`);

    // Step 2: Lookup price_precision
    const precision = await lookupPricePrecision(proposal.organizationId);
    console.log(`\n🎯 RESULT: price_precision = ${precision || 'NOT FOUND (will use default)'}`);

    // Step 3: List all metadata for reference
    const allMetadata = await listAllMetadataForOrg(proposal.organizationId);
    console.log(`\n📋 Total metadata entries for org: ${allMetadata.length}`);
}

main().catch(console.error);
