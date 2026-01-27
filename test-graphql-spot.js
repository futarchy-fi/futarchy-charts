/**
 * Debug: Test graphql-proxy with poolTicker variable
 */

const ticker = '0x8189c4c96826d016a99986394103dfa9ae41e7ee::0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-500-xdai';

const query = `
  query GetCandles($yesPoolId: String!, $noPoolId: String!, $minTimestamp: Int!, $maxTimestamp: Int!, $poolTicker: String) {
    yesCandles: candles(
      first: 1000
      orderBy: periodStartUnix
      orderDirection: asc
      where: { pool: $yesPoolId, periodStartUnix_gte: $minTimestamp, periodStartUnix_lte: $maxTimestamp, period: "3600" }
    ) {
      periodStartUnix
      close
    }
    noCandles: candles(
      first: 1000
      orderBy: periodStartUnix
      orderDirection: asc
      where: { pool: $noPoolId, periodStartUnix_gte: $minTimestamp, periodStartUnix_lte: $maxTimestamp, period: "3600" }
    ) {
      periodStartUnix
      close
    }
  }
`;

const now = Math.floor(Date.now() / 1000);
const minTimestamp = now - (3 * 24 * 60 * 60); // 3 days ago

const variables = {
    yesPoolId: '0xf8346e622557763a62cc981187d084695ee296c3',
    noPoolId: '0x76f78ec457c1b14bcf972f16eae44c7aa21d578f',
    minTimestamp,
    maxTimestamp: now,
    poolTicker: ticker  // <-- The key being tested
};

console.log('=== Testing GraphQL Proxy with poolTicker ===\n');
console.log('poolTicker:', ticker);
console.log('Date range:', new Date(minTimestamp * 1000).toISOString(), 'to', new Date(now * 1000).toISOString());
console.log('\n');

fetch('http://localhost:3030/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
})
    .then(res => res.json())
    .then(data => {
        console.log('=== RESULT ===');
        console.log('YES candles:', data.data?.yesCandles?.length || 0);
        console.log('NO candles:', data.data?.noCandles?.length || 0);
        console.log('SPOT candles:', data.data?.spotCandles?.length || 0);

        if (data.data?.spotCandles?.length > 0) {
            console.log('\nFirst spot candle:', data.data.spotCandles[0]);
            console.log('Last spot candle:', data.data.spotCandles[data.data.spotCandles.length - 1]);
        } else {
            console.log('\n❌ No spot candles returned!');
        }
    })
    .catch(err => console.error('Error:', err.message));
