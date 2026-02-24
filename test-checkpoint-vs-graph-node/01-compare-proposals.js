/**
 * 01-compare-proposals.js
 * ───────────────────────
 * Fetches the same proposal from both Graph Node and Checkpoint APIs,
 * then compares the results side-by-side to verify consistency.
 */

const GRAPH_REGISTRY = 'https://d3ugkaojqkfud0.cloudfront.net/subgraphs/name/futarchy-complete-new-v3';
const CHECKPOINT_REGISTRY = 'https://api.futarchy.fi/registry/graphql';

const TEST_PROPOSAL_ADDRESS = '0x45e1064348fd8a407d6d1f59fc64b05f633b28fc';

// ── Helpers ─────────────────────────────────────────────────────────

async function gql(url, query) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const json = await res.json();
    if (json.errors) throw new Error(`GQL: ${json.errors[0].message}`);
    return json.data;
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }

function compare(label, a, b) {
    const match = String(a).toLowerCase() === String(b).toLowerCase();
    if (match) pass(`${label}: "${a}" ≡ "${b}"`);
    else       fail(`${label}: Graph="${a}" vs Checkpoint="${b}"`);
    return match;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
    console.log('═'.repeat(60));
    console.log('  01 — Compare Proposals: Graph Node vs Checkpoint');
    console.log('═'.repeat(60));
    console.log(`  Target: ${TEST_PROPOSAL_ADDRESS}\n`);

    // ── Graph Node ──────────────────────────────────────────────
    info('Fetching from Graph Node...');
    const graphData = await gql(GRAPH_REGISTRY, `{
        proposalEntities(where: { proposalAddress: "${TEST_PROPOSAL_ADDRESS}" }) {
            id
            proposalAddress
            title
            metadata
        }
    }`);
    const graphProposal = graphData?.proposalEntities?.[0];
    if (!graphProposal) { fail('No proposal found in Graph Node'); return; }
    pass(`Graph Node: "${graphProposal.title?.slice(0, 50)}..."`);

    // Parse metadata
    let graphMeta = {};
    try { graphMeta = JSON.parse(graphProposal.metadata || '{}'); } catch {}

    // ── Checkpoint ──────────────────────────────────────────────
    info('Fetching from Checkpoint...');
    const checkData = await gql(CHECKPOINT_REGISTRY, `{
        proposalentities(where: { proposalAddress: "${TEST_PROPOSAL_ADDRESS}" }) {
            id
            proposalAddress
            title
            metadata
        }
    }`);
    const checkProposal = checkData?.proposalentities?.[0];
    if (!checkProposal) { fail('No proposal found in Checkpoint'); return; }
    pass(`Checkpoint: "${checkProposal.title?.slice(0, 50)}..."`);

    // Parse metadata
    let checkMeta = {};
    try { checkMeta = JSON.parse(checkProposal.metadata || '{}'); } catch {}

    // Also fetch flattened metadata entries
    const flatMetaData = await gql(CHECKPOINT_REGISTRY, `{
        metadataentries(where: { proposal: "${checkProposal.id}" }, first: 200) {
            key
            value
        }
    }`);
    const flatMeta = {};
    (flatMetaData?.metadataentries || []).forEach(m => flatMeta[m.key] = m.value);

    // ── Compare ─────────────────────────────────────────────────
    console.log('\n  --- Comparison ---');

    compare('proposalAddress', graphProposal.proposalAddress, checkProposal.proposalAddress);
    compare('title', graphProposal.title?.slice(0, 30), checkProposal.title?.slice(0, 30));

    // Compare key metadata fields
    const metaKeys = ['coingecko_ticker', 'closeTimestamp', 'startCandleUnix', 'price_precision', 'currency_stable_rate'];
    for (const key of metaKeys) {
        const graphVal = graphMeta[key] || 'N/A';
        const checkVal = checkMeta[key] || flatMeta[key] || 'N/A';
        compare(`metadata.${key}`, graphVal, checkVal);
    }

    console.log('\n  Done.\n');
}

main().catch(err => { console.error('❌ FATAL:', err.message); process.exit(1); });
