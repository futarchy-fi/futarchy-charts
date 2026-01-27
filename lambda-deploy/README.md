# 🚀 Futarchy API on AWS

Serverless API for Futarchy Charts, deployed via AWS Lambda + API Gateway (HTTP API).

⚠️ **Important**: Use `./lambda-deploy/deploy.sh` to build and deploy. This correctly handles account restrictions by using API Gateway.

---

## ⚡ Deployment (One Command)

```bash
cd /home/arthur/graph-node/futarchy-charts
./lambda-deploy/deploy.sh
```

This will:
1. **Auto-Build** the project (install deps + zip).
2. **Auto-Deploy** Lambda function (create/update).
3. **Auto-Configure** API Gateway (public HTTPS endpoint).
4. **Print the API URL** (e.g., `https://xyz.execute-api.eu-north-1.amazonaws.com`).

---

## 🧪 Testing

```bash
# Health Check
curl https://YOUR-API-URL/health
# Response: {"status":"ok", ...}

# Market Prices
curl "https://YOUR-API-URL/api/v1/market-events/proposals/{PROPOSAL_ID}/prices"
```

---

## 🔧 Update Procedure

When you change code in `src/`:
1. Run `./lambda-deploy/deploy.sh` again.
   It handles updates automatically (safe to re-run).

---

## 📂 Project Structure

| File | Purpose |
|------|---------|
| `deploy.sh` | **Main Deployment Script** (Build + Deploy via API Gateway) |
| `legacy-deploy-function-url.sh` | Old script (uses Function URL - likely blocked) |
| `build.sh` | Build utility (called automatically by deploy.sh) |
| `handler.js` | Lambda entry point |
| `TROUBLESHOOTING.md` | Common issues and fixes |

---

## ❓ Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for help with 403 errors, timeouts, or build failures.
