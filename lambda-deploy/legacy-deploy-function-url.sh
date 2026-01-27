#!/bin/bash
# ============================================
# Deploy Lambda Function to AWS
# ============================================
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - lambda.zip built (run build.sh first)
#
# Usage:
#   ./lambda-deploy/deploy.sh [function-name] [region]
#
# Examples:
#   ./lambda-deploy/deploy.sh                    # Uses defaults
#   ./lambda-deploy/deploy.sh futarchy-api       # Custom name
#   ./lambda-deploy/deploy.sh futarchy-api eu-north-1
# ============================================

set -e

FUNCTION_NAME=${1:-"futarchy-api"}
REGION=${2:-"eu-north-1"}
SCRIPT_DIR="$(dirname "$0")"
ZIP_FILE="$SCRIPT_DIR/lambda.zip"

echo "🚀 Deploying Lambda function..."
echo "   Function: $FUNCTION_NAME"
echo "   Region: $REGION"
echo ""

# Check if zip exists
if [ ! -f "$ZIP_FILE" ]; then
    echo "❌ lambda.zip not found. Run build.sh first!"
    exit 1
fi

# Check if function exists
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null; then
    echo "📤 Updating existing function..."
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --zip-file "fileb://$ZIP_FILE" \
        --region "$REGION"
else
    echo "📤 Creating new function..."
    
    # Get or create IAM role
    ROLE_ARN=$(aws iam get-role --role-name lambda-basic-execution 2>/dev/null | jq -r '.Role.Arn' || echo "")
    
    if [ -z "$ROLE_ARN" ]; then
        echo "   Creating IAM role..."
        aws iam create-role \
            --role-name lambda-basic-execution \
            --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
        
        aws iam attach-role-policy \
            --role-name lambda-basic-execution \
            --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
        
        ROLE_ARN=$(aws iam get-role --role-name lambda-basic-execution | jq -r '.Role.Arn')
        
        echo "   Waiting for role propagation..."
        sleep 10
    fi
    
    # Create the function
    aws lambda create-function \
        --function-name "$FUNCTION_NAME" \
        --runtime nodejs20.x \
        --handler handler.handler \
        --role "$ROLE_ARN" \
        --zip-file "fileb://$ZIP_FILE" \
        --memory-size 256 \
        --timeout 30 \
        --region "$REGION"
    
    echo ""
    echo "📡 Creating Function URL..."
    aws lambda create-function-url-config \
        --function-name "$FUNCTION_NAME" \
        --auth-type NONE \
        --cors '{"AllowOrigins":["*"],"AllowMethods":["GET","POST","OPTIONS"],"AllowHeaders":["Content-Type"]}' \
        --region "$REGION"
    
    # Add permission for public access
    aws lambda add-permission \
        --function-name "$FUNCTION_NAME" \
        --statement-id FunctionURLAllowPublicAccess \
        --action lambda:InvokeFunctionUrl \
        --principal "*" \
        --function-url-auth-type NONE \
        --region "$REGION"
fi

echo ""
echo "✅ Deployment complete!"
echo ""

# Get function URL
URL=$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null | jq -r '.FunctionUrl' || echo "")

if [ -n "$URL" ]; then
    echo "🌐 Function URL: $URL"
    echo ""
    echo "📍 Test endpoints:"
    echo "   ${URL}health"
    echo "   ${URL}api/v1/market-events/proposals/{proposalId}/prices"
    echo ""
else
    echo "⚠️ No Function URL configured. Create one in AWS Console or run:"
    echo "   aws lambda create-function-url-config --function-name $FUNCTION_NAME --auth-type NONE --region $REGION"
fi
