/**
 * Test: Lookup proposal by snapshot_id in metadata
 * 
 * The goal is to find a ProposalEntity where:
 * 1. The metadata contains snapshot_id: "0x09cb43353c0ece5544919bf70a9810908098c728f27f9ca3e211871f7ad6bf1c"
 * 2. The proposal belongs to an organization linked to the default aggregator
 */

const FUTARCHY_REGISTRY_ENDPOINT = 'https://d3ugkaojqkfud0.cloudfront.net/subgraphs/name/futarchy-complete-new-v3';
const DEFAULT_AGGREGATOR = '0xc5eb43d53e2fe5fdde5faf400cc4167e5b5d4fc1';
const SNAPSHOT_ID = '0x09cb43353c0ece5544919bf70a9810908098c728f27f9ca3e211871f7ad6bf1c';

async function testQuery() {
    console.log('🔍 Testing snapshot_id lookup...\n');
    console.log(`   Snapshot ID: ${SNAPSHOT_ID.slice(0, 20)}...`);
    console.log(`   Aggregator: ${DEFAULT_AGGREGATOR.slice(0, 20)}...`);
    console.log('');

    // Method 1: Query metadataEntries at Proposal level with snapshot_id key
    console.log('📋 Method 1: Query metadataEntries where key="snapshot_id"');
    const query1 = `{
        metadataEntries(where: { 
            key: "snapshot_id",
            value: "${SNAPSHOT_ID}"
        }) {
            key
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
            organization {
                id
                name
                aggregator { id }
            }
        }
    }`;

    const result1 = await fetch(FUTARCHY_REGISTRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query1 })
    }).then(r => r.json());

    console.log('   Result:', JSON.stringify(result1, null, 2));
    console.log('');

    // Method 2: Query all proposals from orgs under our aggregator
    console.log('📋 Method 2: Query all proposals under default aggregator');
    const query2 = `{
        proposalEntities(
            first: 50,
            where: { 
                organization_: { aggregator: "${DEFAULT_AGGREGATOR}" }
            }
        ) {
            id
            proposalAddress
            title
            metadata
            metadataProperties
            organization {
                id
                name
            }
        }
    }`;

    const result2 = await fetch(FUTARCHY_REGISTRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query2 })
    }).then(r => r.json());

    const proposals = result2.data?.proposalEntities || [];
    console.log(`   Found ${proposals.length} proposals under aggregator`);

    // Search for snapshot_id in metadata
    const matching = proposals.filter(p => {
        if (!p.metadata) return false;
        try {
            const meta = JSON.parse(p.metadata);
            return meta.snapshot_id === SNAPSHOT_ID;
        } catch {
            return p.metadata.includes(SNAPSHOT_ID);
        }
    });

    console.log(`   Proposals with matching snapshot_id: ${matching.length}`);
    if (matching.length > 0) {
        console.log('\n   ✅ FOUND:');
        matching.forEach(p => {
            console.log(`      - ${p.title}`);
            console.log(`        Proposal: ${p.id}`);
            console.log(`        Trading: ${p.proposalAddress}`);
            console.log(`        Org: ${p.organization?.name}`);
        });
    }
    console.log('');

    // Method 3: Check if metadataProperties includes "snapshot_id"
    console.log('📋 Method 3: Query proposals where metadataProperties contains "snapshot_id"');
    const query3 = `{
        proposalEntities(
            first: 20,
            where: { 
                organization_: { aggregator: "${DEFAULT_AGGREGATOR}" },
                metadataProperties_contains: ["snapshot_id"]
            }
        ) {
            id
            proposalAddress
            title
            metadata
            metadataProperties
            organization { name }
        }
    }`;

    const result3 = await fetch(FUTARCHY_REGISTRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query3 })
    }).then(r => r.json());

    const proposalsWithSnapshotId = result3.data?.proposalEntities || [];
    console.log(`   Found ${proposalsWithSnapshotId.length} proposals with snapshot_id in metadataProperties`);

    if (proposalsWithSnapshotId.length > 0) {
        proposalsWithSnapshotId.forEach(p => {
            console.log(`\n   📦 ${p.title}`);
            console.log(`      Org: ${p.organization?.name}`);
            console.log(`      Props: ${p.metadataProperties?.join(', ')}`);
            try {
                const meta = JSON.parse(p.metadata);
                console.log(`      snapshot_id: ${meta.snapshot_id || 'N/A'}`);
            } catch {
                console.log(`      metadata: (parse error)`);
            }
        });
    }
}

testQuery().catch(console.error);
