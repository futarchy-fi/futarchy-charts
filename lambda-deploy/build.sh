#!/bin/bash
# ============================================
# Build Lambda Deployment Package
# ============================================
# Run this from the futarchy-charts folder:
#   ./lambda-deploy/build.sh
# ============================================

set -e

echo "🚀 Building Lambda deployment package..."
echo ""

# Go to parent directory (futarchy-charts)
cd "$(dirname "$0")/.."

# Clean previous build
rm -rf lambda-deploy/dist
rm -f lambda-deploy/lambda.zip

# Create dist folder
mkdir -p lambda-deploy/dist

# Copy source files
echo "📦 Copying source files..."
cp -r src lambda-deploy/dist/
cp lambda-deploy/handler.js lambda-deploy/dist/
cp package.json lambda-deploy/dist/

# Install production dependencies
echo "📦 Installing production dependencies..."
cd lambda-deploy/dist
npm install --omit=dev
npm install serverless-http

# Create zip
echo "📦 Creating lambda.zip..."
zip -r ../lambda.zip . -x "*.git*"

# Cleanup
cd ..
rm -rf dist

echo ""
echo "✅ Build complete!"
echo "   Package: lambda-deploy/lambda.zip"
echo "   Size: $(du -h lambda.zip | cut -f1)"
echo ""
echo "📤 Next steps:"
echo "   1. Go to AWS Lambda console"
echo "   2. Create function or update existing"
echo "   3. Upload lambda.zip"
echo "   4. Set handler to: handler.handler"
