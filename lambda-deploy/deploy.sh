#!/bin/bash
# ============================================
# 🚀 FUTARCHY API DEPLOYMENT (One-Click)
# ============================================
# This script:
# 1. Builds the project (npm install, zip)
# 2. Deploys the Lambda function (Create or Update)
# 3. Deploys an API Gateway (HTTP API)
# 4. Configures permissions dynamically
# ============================================

set -e

# Configuration
REGION=${1:-"eu-north-1"}
FUNCTION_NAME="futarchy-api"
API_NAME="futarchy-api-gateway"
SCRIPT_DIR="$(dirname "$0")"
ZIP_FILE="$SCRIPT_DIR/lambda.zip"

echo "🌟 Starting Deployment..."
echo "   Region: $REGION"
echo ""

# ============================================
# 1. AUTO-BUILD
# ============================================
echo "🛠️ Step 1: Building project..."
"$SCRIPT_DIR/build.sh"

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Aborting."
    exit 1
fi
echo ""

# ============================================
# 2. LAMBDA DEPLOYMENT
# ============================================
echo "⚡ Step 2: Deploying Lambda function..."

if [ ! -f "$ZIP_FILE" ]; then
    echo "❌ lambda.zip not found (even after build). Something is wrong."
    exit 1
fi

# Check if function exists
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "   Updating existing function code..."
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --zip-file "fileb://$ZIP_FILE" \
        --region "$REGION" >/dev/null
else
    echo "   Creating new function..."
    
    # Get or create IAM role
    ROLE_ARN=$(aws iam get-role --role-name lambda-basic-execution 2>/dev/null | jq -r '.Role.Arn' || echo "")
    
    if [ -z "$ROLE_ARN" ]; then
        echo "   Creating IAM role..."
        aws iam create-role \
            --role-name lambda-basic-execution \
            --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
        
        aws iam attach-role-policy \
            --role-name lambda-basic-execution \
            --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
        
        # Wait for propagation
        echo "   Waiting for role propagation..."
        sleep 10
        ROLE_ARN=$(aws iam get-role --role-name lambda-basic-execution | jq -r '.Role.Arn')
    fi
    
    aws lambda create-function \
        --function-name "$FUNCTION_NAME" \
        --runtime nodejs20.x \
        --handler handler.handler \
        --role "$ROLE_ARN" \
        --zip-file "fileb://$ZIP_FILE" \
        --memory-size 256 \
        --timeout 30 \
        --region "$REGION" >/dev/null
fi
echo "   Lambda deployed successfully."
echo ""

# ============================================
# 3. API GATEWAY DEPLOYMENT
# ============================================
echo "🌐 Step 3: Configuring API Gateway..."

# Get Lambda ARN
FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text)

# Get or Create API
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" | jq -r ".Items[] | select(.Name == \"$API_NAME\") | .ApiId")

if [ -z "$API_ID" ]; then
    API_ID=$(aws apigatewayv2 create-api --name "$API_NAME" --protocol-type HTTP --region "$REGION" --query 'ApiId' --output text)
    echo "   Created new API: $API_ID"
else
    echo "   Found existing API: $API_ID"
fi

# Get or Create Integration
INTEGRATION_ID=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" | jq -r ".Items[] | select(.IntegrationUri == \"$FUNCTION_ARN\") | .IntegrationId")

if [ -z "$INTEGRATION_ID" ]; then
    INTEGRATION_ID=$(aws apigatewayv2 create-integration \
        --api-id "$API_ID" \
        --integration-type AWS_PROXY \
        --integration-uri "$FUNCTION_ARN" \
        --payload-format-version 2.0 \
        --region "$REGION" \
        --query 'IntegrationId' --output text)
    echo "   Created integration: $INTEGRATION_ID"
else
    echo "   Found existing integration: $INTEGRATION_ID"
fi

# Create Route (ANY /{proxy+})
ROUTE_ID=$(aws apigatewayv2 get-routes --api-id "$API_ID" --region "$REGION" | jq -r ".Items[] | select(.RouteKey == \"ANY /{proxy+}\") | .RouteId")

if [ -z "$ROUTE_ID" ]; then
    aws apigatewayv2 create-route \
        --api-id "$API_ID" \
        --route-key "ANY /{proxy+}" \
        --target "integrations/$INTEGRATION_ID" \
        --region "$REGION" >/dev/null
    echo "   Created route"
fi

# Deploy Stage
aws apigatewayv2 update-stage --api-id "$API_ID" --stage-name '$default' --auto-deploy --region "$REGION" >/dev/null 2>&1 || \
aws apigatewayv2 create-stage --api-id "$API_ID" --stage-name '$default' --auto-deploy --region "$REGION" >/dev/null

# ============================================
# 4. PERMISSIONS
# ============================================
echo "Vk Step 4: Setting Permissions..."

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Remove old permission if exists (idempotency)
aws lambda remove-permission --function-name "$FUNCTION_NAME" --statement-id ApiGatewayInvoke --region "$REGION" >/dev/null 2>&1 || true

aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id ApiGatewayInvoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/*/{proxy+}" \
    --region "$REGION" >/dev/null

# CORs
aws apigatewayv2 update-api \
    --api-id "$API_ID" \
    --cors-configuration '{"AllowOrigins":["*"], "AllowMethods":["GET","POST","OPTIONS"], "AllowHeaders":["Content-Type"]}' \
    --region "$REGION" >/dev/null

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
ENDPOINT=$(aws apigatewayv2 get-api --api-id "$API_ID" --region "$REGION" --query 'ApiEndpoint' --output text)
echo "---------------------------------------------------"
echo "🌐 API URL: $ENDPOINT"
echo "---------------------------------------------------"
echo "📍 Test Endpoints:"
echo "   Health Check:  $ENDPOINT/health"
echo "   Prices:        $ENDPOINT/api/v1/market-events/proposals/{id}/prices"
echo "---------------------------------------------------"
