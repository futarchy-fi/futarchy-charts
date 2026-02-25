import fetch from 'node-fetch';
const url = "http://localhost:3030/api/v1/spot-candles?ticker=0x8189c4c96826d016a99986394103dfa9ae41e7ee%3A%3A0x89c80a4540a00b5270347e02e2e144c71da2eced-hour-500-xdai&minTimestamp=1769990400&maxTimestamp=1771027200";
const res = await fetch(url);
const data = await res.json();
console.log(Object.keys(data));
console.log(JSON.stringify(data).substring(0, 150));
