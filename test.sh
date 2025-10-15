#!/bin/bash
# Simple test script for Game Search API v2

echo "🧪 Testing Game Search API v2..."
echo ""

# Test 1: Health check
echo "1️⃣ Testing health endpoint..."
curl -s http://localhost:3000/health | jq '.'
echo ""

# Test 2: Search
echo "2️⃣ Testing search endpoint..."
curl -s "http://localhost:3000/?search=cuphead" | jq '.success, .count'
echo ""

# Test 3: Site-specific search
echo "3️⃣ Testing site-specific search..."
curl -s "http://localhost:3000/?search=hollow%20knight&site=freegog" | jq '.success, .site, .count'
echo ""

# Test 4: Recent uploads
echo "4️⃣ Testing recent uploads..."
curl -s http://localhost:3000/recent | jq '.success, .count'
echo ""

echo "✅ Tests complete!"
