/**
 * Futarchy Charts — Endpoint Configuration
 *
 * Toggle between Graph Node (legacy subgraph) and Checkpoint (api.futarchy.fi)
 * using the FUTARCHY_MODE environment variable.
 *
 * Usage:
 *   FUTARCHY_MODE=checkpoint npm start    # use Checkpoint API
 *   FUTARCHY_MODE=graph_node npm start    # use Graph Node (default)
 */

const MODE = (process.env.FUTARCHY_MODE || 'graph_node').toLowerCase();

if (!['graph_node', 'checkpoint'].includes(MODE)) {
    console.warn(`[endpoints] Unknown FUTARCHY_MODE="${MODE}", falling back to graph_node`);
}

const GRAPH_NODE = {
    registry: 'https://d3ugkaojqkfud0.cloudfront.net/subgraphs/name/futarchy-complete-new-v3',
    candles:  'https://d3ugkaojqkfud0.cloudfront.net/subgraphs/name/algebra-proposal-candles-v1',
};

const CHECKPOINT = {
    registry: 'https://api.futarchy.fi/registry/graphql',
    candles:  'https://api.futarchy.fi/candles/graphql',
};

export const ENDPOINTS = MODE === 'checkpoint' ? CHECKPOINT : GRAPH_NODE;
export const IS_CHECKPOINT = MODE === 'checkpoint';
export { MODE };

console.log(`[endpoints] Mode: ${MODE.toUpperCase()}`);
console.log(`[endpoints] Registry: ${ENDPOINTS.registry}`);
console.log(`[endpoints] Candles:  ${ENDPOINTS.candles}`);
