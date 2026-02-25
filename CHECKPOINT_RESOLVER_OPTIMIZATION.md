# Checkpoint Registry Resolver — Optimization Plan

## The Problem

`checkpoint_lookupBySnapshotId()` in `src/adapters/registry-adapter.js` makes **4 sequential GraphQL calls** to resolve a single snapshot ID. This takes ~4 seconds.

## Current Flow (4 queries, ~4100ms)

```
Query 1: Find metadata entry with key="snapshot_id"
         → Returns: proposal ID only
         ⏱️ ~1000ms

Query 2: Fetch proposal details by ID
         → Returns: proposalAddress, title, metadata, organization ID
         ⏱️ ~1000ms

Query 3: Fetch organization by ID
         → Returns: org name, aggregator ID (to verify it belongs to us)
         ⏱️ ~1000ms

Query 4: Fetch ALL metadata entries for this proposal
         → Returns: individual key-value pairs to merge with JSON blob
         ⏱️ ~1000ms

Total: ~4100ms sequential
```

### Why 4 queries?

The code was written conservatively, assuming Checkpoint doesn't support nested object resolution (like Graph Node does). It assumed `proposal` in a metadata entry is just a flat string ID, requiring a second query to get proposal details, and a third to get the org.

## The Fix: 1 Query

**Checkpoint actually supports full nesting!** This single query returns everything:

```graphql
{
  metadataentries(where: {
    key: "snapshot_id",
    value_contains_nocase: "0x09cb43353c0ece5544919bf70a9810908098c728f27f9ca3e211871f7ad6bf1c"
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
}
```

### Proof it works (tested against `api.futarchy.fi/registry/graphql`)

```json
{
  "data": {
    "metadataentries": [{
      "value": "0x09cb43353c0ece5544919bf70a9810908098c728f27f9ca3e211871f7ad6bf1c",
      "proposal": {
        "id": "0xa78a2d5844c653dac60da8a3f9ec958d09a4ee6a",
        "proposalAddress": "0x45e1064348fd8a407d6d1f59fc64b05f633b28fc",
        "title": "What will the impact on GNO price be",
        "metadata": "{\"chain\":100,\"coingecko_ticker\":\"0x8189c4c...xdai\",\"closeTimestamp\":1772236800,...}",
        "organization": {
          "id": "0x3fd2e8e71f75eed4b5c507706c413e33e0661bbf",
          "name": "Gnosis DAO",
          "aggregator": {
            "id": "0xc5eb43d53e2fe5fdde5faf400cc4167e5b5d4fc1"
          }
        }
      }
    }]
  }
}
```

Everything in ONE response:
- ✅ `proposalAddress` (trading contract)
- ✅ `metadata` JSON blob (contains `coingecko_ticker`, `closeTimestamp`, `startCandleUnix`, `price_precision`, `currency_stable_rate`, `currency_stable_symbol`, etc.)
- ✅ `organization.id` + `organization.name`
- ✅ `organization.aggregator.id` (to verify it's our aggregator)

### What about Query 4 (all metadata entries)?

Not needed! The `metadata` JSON blob already contains all the config fields. Query 4 was a redundant merge step — it was fetching individual `metadataentries` to supplement the JSON blob, but since the blob is complete, we can skip it entirely.

## Where to change

**File:** `src/adapters/registry-adapter.js`

**Function:** `checkpoint_lookupBySnapshotId()` (lines 132–212)

Replace the entire function body with:
1. Single query (as shown above)
2. Filter by aggregator ID client-side (same as before)
3. Parse the `metadata` JSON blob
4. Call `normalizeProposalResult()` (already exists, no changes needed)

Expected result: **~4100ms → ~500-800ms**
