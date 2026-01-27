# Troubleshooting Guide

If you encounter issues deploying or using the Futarchy API, use this guide.

## 🚨 Common Errors

### 1. `403 Forbidden` on Health Check
- **Symptom**: `curl https://.../health` returns `{"message":"Forbidden"}`.
- **Cause**:
  1. **Account Restrictions**: Your AWS account likely blocks public Lambda Function URLs.
  2. **Wrong URL**: You might be using the legacy Function URL instead of the API Gateway URL.
- **Solution**:
  - Always use `./lambda-deploy/deploy.sh` (which sets up API Gateway).
  - Use the URL printed at the end of the deployment script.

### 2. `{"errorType":"Runtime.ImportModuleError"}`
- **Symptom**: Response contains `"Cannot find module"`.
- **Cause**: The `handler.js` file is missing or has incorrect import paths in the zip file.
- **Solution**:
  - Run `./lambda-deploy/deploy.sh` again (it rebuilds the zip automatically).
  - Ensure `src/` folder exists and contains `routes/`.

### 3. `500 Internal Server Error`
- **Symptom**: The API returns 500 status code.
- **Cause**: The code crashed or timed out.
- **Solution**: Check CloudWatch Logs:
  ```bash
  aws logs tail /aws/lambda/futarchy-api --follow
  ```
- **Common Timeout**: Increase timeout to 30s or 60s in `deploy.sh`.

### 4. `zip: command not found`
- **Symptom**: Deploy script fails during build step.
- **Solution**: Install zip utility:
  ```bash
  sudo apt-get install zip
  ```

---

## 🔍 Debugging Steps

1. **Verify Lambda Function Exists**:
   ```bash
   aws lambda get-function --function-name futarchy-api
   ```

2. **Test Direct Invocation** (Bypasses API Gateway/URL):
   ```bash
   aws lambda invoke --function-name futarchy-api --payload '{"rawPath":"/health","requestContext":{"http":{"method":"GET"}}}' response.json && cat response.json
   ```
   If this works (200 OK), the issue is in API Gateway or networking.
   If this fails, the issue is in the code.

3. **Check IAM Role**:
   Ensure `lambda-basic-execution` role exists and has policies attached. The deploy script handles this automatically, but you can verify in IAM console.

---

## 📞 Still Stuck?

If you need to reset everything completely:

```bash
# Delete Function
aws lambda delete-function --function-name futarchy-api

# Delete API Gateway (Find ID first)
API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='futarchy-api-gateway'].ApiId" --output text)
aws apigatewayv2 delete-api --api-id $API_ID

# Re-run Deploy
./lambda-deploy/deploy.sh
```
