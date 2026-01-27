# 🧪 Parity Testing Guide

This guide explains how to verify that your local development environment matches the deployed API Gateway environment exactly.

## Prerequisite: Node.js v18+

Ensure you have a modern Node.js version (v18, v20, or v22) to support `fetch`.

```bash
nvm use 22
```

## Step 1: Start Local Server

Run the local server on port 3030.

```bash
npm start
```

*Leave this running in a separate terminal.*

## Step 2: Run Parity Test

In a new terminal (ensure correct Node version), run the test script:

```bash
node test-local-vs-gateway.js
```

### What it does:
1.  Fetches proposal details from `http://localhost:3030`.
2.  Fetches proposal details from the **Production API Gateway**.
3.  Compares the results field-by-field:
    -   ✅ Event ID match
    -   ✅ Spot Price match (within tolerance)
    -   ✅ Candle Count match

### Passing Result:
```
🎉 TEST PASSED: Environments are consistent.
```

### Failing Result:
```
💥 TEST FAILED: Discrepancies found.
```

---

## Troubleshooting

- **`fetch is not defined`**: You are using an old Node.js version. Run `nvm use 22`.
- **`Local failed: fetch failed`**: Local server is not running. Run `npm start`.
- **`Remote failed`**: API Gateway is down or unreachable. Check your internet connection.
