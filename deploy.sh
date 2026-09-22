#!/bin/bash

set -e

APP_DIR="/home/ubuntu/printsetu"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

cd "$APP_DIR"

echo "========================================"
echo " PrintSetu Production Deployment"
echo "========================================"

echo ""
echo "[1/5] Checking Git status..."
git status --short

echo ""
echo "[2/5] Pulling latest code..."
git pull --ff-only origin main

echo ""
echo "[3/5] Building and restarting services..."
$COMPOSE up -d --build

echo ""
echo "[4/5] Running database migrations..."
$COMPOSE exec -T backend npx prisma migrate deploy

echo ""
echo "[5/5] Checking services..."
$COMPOSE ps

echo ""
echo "Checking application..."
if curl -fsS -o /dev/null -I http://127.0.0.1/; then
    echo "Application check: OK"
else
    echo "Application check: FAILED"
    exit 1
fi

echo ""
echo "========================================"
echo " Deployment completed successfully"
echo "========================================"
