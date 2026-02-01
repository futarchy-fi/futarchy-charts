# 🖐️ Manual Deployment Guide (AWS Console)

If you prefer to deploy using the AWS Website (Console) instead of the CLI, follow these steps.

## Phase 1: Build the Package Locally

You still need to create the `lambda.zip` file on your computer.

```bash
cd /home/arthur/graph-node/futarchy-charts
./lambda-deploy/build.sh
```
✅ **Result:** You will have a file at `lambda-deploy/lambda.zip`.

---

## Phase 2: Create/Update Lambda Function

1.  **Log in to AWS Console** and go to **Lambda**.
2.  Click **Create function** (or select `futarchy-api` if it exists).
    -   **Name:** `futarchy-api`
    -   **Runtime:** `Node.js 20.x`
    -   **Architecture:** `x86_64` (Important!)
3.  **Upload Code**:
    -   In the "Code source" section, click **Upload from** -> **.zip file**.
    -   Select the `lambda-deploy/lambda.zip` file you built.
    -   Click **Save**.
4.  **Configure Handler**:
    -   Scroll down to "Runtime settings".
    -   Click **Edit**.
    -   Set **Handler** to `handler.handler`.
    -   Click **Save**.
5.  **Configuration**:
    -   Go to **Configuration** tab -> **General configuration**.
    -   Set **Timeout** to `30 sec`.
    -   Click **Save**.

---

## Phase 3: Connect API Gateway

Since Function URLs are blocked on your account, you must use API Gateway.

1.  **Go to API Gateway** service in AWS Console.
2.  Click **Create API**.
3.  Select **HTTP API** (Build).
4.  **Create an API**:
    -   **Integrations**: Click "Add integration" -> Select **Lambda**.
    -   **Lambda function**: Select `futarchy-api`.
    -   **API Name**: `futarchy-api-gateway`.
    -   Click **Next**.
5.  **Configure routes**:
    -   Leave Method as `ANY` and Resource path as `/{proxy+}`.
    -   (Or ensure it matches `ANY` -> `futarchy-api`).
    -   Click **Next**.
6.  **Configure stages**:
    -   Leave Stage name as `$default` (Auto-deploy enabled).
    -   Click **Next**.
7.  **Review and Create**:
    -   Click **Create**.

---

## Phase 4: Get URL & Test

1.  You will be redirected to the API details page.
2.  Copy the **Invoke URL** (e.g., `https://xyz.execute-api.eu-north-1.amazonaws.com`).
3.  Test it in your browser: `https://YOUR-URL/health`.

---

## Phase 5: Fixing Permissions (Crucial)

If you get `Internal Server Error` or permissions errors:

1.  Go back to **Lambda** -> `futarchy-api`.
2.  Go to **Configuration** -> **Permissions**.
3.  Scroll to **Resource-based policy statements**.
4.  You should see a policy allowing API Gateway.
    -   If NOT, you might need to add it manually or just use the CLI script `deploy.sh` which handles this difficult part automatically.

**Recommendation:**
Use `./lambda-deploy/deploy.sh` for Phase 3-5, as connecting permissions manually is error-prone.
