#!/bin/bash

# Deploy all endpoint workers
# Usage: ./deploy-all.sh

set -e

echo "🚀 Deploying all endpoint workers..."

# Deploy endpoint-1
echo ""
echo "📦 Deploying endpoint-1..."
cd endpoint-1
npm run deploy
cd ..

# Deploy endpoint-2
echo ""
echo "📦 Deploying endpoint-2..."
cd endpoint-2
npm run deploy
cd ..

# Deploy endpoint-3
echo ""
echo "📦 Deploying endpoint-3..."
cd endpoint-3
npm run deploy
cd ..

echo ""
echo "✅ All endpoint workers deployed successfully!"
echo ""
echo "Update your workflow-engine-ui endpoint URLs with the deployed worker URLs."

