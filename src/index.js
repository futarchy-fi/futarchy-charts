/**
 * Local Express Server for Futarchy Development
 * 
 * Replaces:
 * - stag.api.tickspread.com → localhost:3030/api/v1/...
 * - Algebra candles subgraph → localhost:3030/subgraphs/name/algebra-proposal-candles-v1
 * 
 * Run: npm start (or npm run dev for watch mode)
 */

import express from 'express';
import cors from 'cors';
import { handleMarketEventsRequest } from './routes/market-events.js';
import { handleGraphQLRequest } from './routes/graphql-proxy.js';
import { handleUnifiedChartRequest, refreshChart } from './routes/unified-chart.js';
import { fetchSpotCandles } from './services/spot-price.js';
import { getRateCached } from './services/rate-provider.js';
import { startWarmer, getWarmerStatus } from './utils/warmer.js';
import { ENABLE_WARMER } from './config/cache-config.js';
const app = express();
const PORT = 3031;
// Middleware — allow all origins for local dev
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Apollo-Require-Preflight', 'X-Futarchy-Secret'],
    exposedHeaders: ['X-Cache', 'X-Cache-TTL', 'X-Response-Time'],
}));
app.use(express.json());
app.disable('etag'); // Prevent 304 — ensures browser always gets fresh response

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Warmer status
app.get('/warmer', (req, res) => {
    res.json(getWarmerStatus());
});

// ============================================
// ⚡ UNIFIED CHART ENDPOINT (v2) — single call for everything
// Route: /api/v2/proposals/:proposalId/chart?minTimestamp=...&maxTimestamp=...
// ============================================
app.get('/api/v2/proposals/:proposalId/chart', handleUnifiedChartRequest);

// ============================================
// FUTARCHY API (v1 — legacy, kept for backward compatibility)
// Route: /api/v1/market-events/proposals/:proposalId/prices
// ============================================
app.get('/api/v1/market-events/proposals/:proposalId/prices', handleMarketEventsRequest);

// ============================================
// SPOT CANDLES (GeckoTerminal → rate-divided)
// Route: /api/v1/spot-candles?ticker=...&minTimestamp=...&maxTimestamp=...
// ============================================

app.get('/api/v1/spot-candles', async (req, res) => {
    const { ticker, minTimestamp, maxTimestamp } = req.query;
    if (!ticker) return res.status(400).json({ error: 'ticker required' });

    const min = parseInt(minTimestamp) || 0;
    const max = parseInt(maxTimestamp) || Math.floor(Date.now() / 1000);

    try {
        const spotData = await fetchSpotCandles(ticker, 500);

        // Compute rate divisor when ticker has :: rate provider
        let rateDivisor = 1;
        if (ticker.includes('::')) {
            const rateProviderAddress = ticker.split('::')[1]?.split('-')[0];
            const networkPart = ticker.split('-').pop() || 'xdai';
            const chainId = networkPart === 'xdai' ? 100 : 1;
            if (rateProviderAddress) {
                rateDivisor = await getRateCached(rateProviderAddress, chainId);
            }
        }

        const candles = (spotData?.candles || [])
            .filter(c => c.time >= min && c.time <= max)
            .map(c => ({
                periodStartUnix: String(c.time),
                close: String(c.value / rateDivisor)
            }));

        console.log(`📊 [Spot Candles] ticker=${ticker.slice(0, 20)}... → ${candles.length} candles (rate: ${rateDivisor.toFixed(4)})`);
        res.json({ spotCandles: candles });
    } catch (error) {
        console.error('❌ Spot candles error:', error.message);
        res.status(500).json({ error: error.message, spotCandles: [] });
    }
});

// ============================================
// ALGEBRA CANDLES GRAPHQL PROXY
// Route: /subgraphs/name/algebra-proposal-candles-v1
// Proxies: d3ugkaojqkfud0.cloudfront.net/subgraphs/name/algebra-proposal-candles-v1
// ============================================
app.post('/subgraphs/name/algebra-proposal-candles-v1', handleGraphQLRequest);

// Start server

app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('🚀 Futarchy Local Server Running');
    console.log('─'.repeat(50));
    console.log(`   Port: ${PORT}`);
    console.log('');
    console.log('📍 Endpoints:');
    console.log(`   GET  http://localhost:${PORT}/api/v2/proposals/:id/chart`);
    console.log(`   GET  http://localhost:${PORT}/api/v1/market-events/proposals/:id/prices`);
    console.log(`   GET  http://localhost:${PORT}/warmer  (status)`);
    console.log('');
    console.log('🔧 To use in frontend, change URLs to:');
    console.log(`   VITE_FUTARCHY_API_URL=http://localhost:${PORT}`);
    console.log('─'.repeat(50));

    // Start background warmer
    if (ENABLE_WARMER) {
        startWarmer(async (params) => {
            await refreshChart(params);
        });
    } else {
        console.log('🔥 [Warmer] Disabled (ENABLE_WARMER=false)');
    }
});
