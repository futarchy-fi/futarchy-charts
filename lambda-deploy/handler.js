/**
 * AWS Lambda Handler for Futarchy API
 * 
 * This wraps the Express app for Lambda deployment.
 * The original src/ code remains unchanged.
 */

import serverless from 'serverless-http';
import express from 'express';
import cors from 'cors';
import { handleMarketEventsRequest } from './src/routes/market-events.js';
import { handleGraphQLRequest } from './src/routes/graphql-proxy.js';

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: 'lambda'
    });
});

// ============================================
// FUTARCHY API ENDPOINTS
// ============================================

// Market Events - prices, volume, metadata
app.get('/api/v1/market-events/proposals/:proposalId/prices', handleMarketEventsRequest);

// GraphQL Proxy - candles data
app.post('/subgraphs/name/algebra-proposal-candles-v1', handleGraphQLRequest);

// ============================================
// LAMBDA HANDLER EXPORT
// ============================================

export const handler = serverless(app);
