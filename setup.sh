#!/bin/bash
# Kynex Pharmacloud — Server Setup Script
# Run once after uploading to Hostinger VPS

set -e

echo "=== Kynex Pharmacloud Setup ==="

# 1. Install Node.js 20+ via nvm if not present
if ! command -v node &>/dev/null || [[ $(node -e "process.exit(process.version.split('.')[0].slice(1) < 20 ? 1 : 0)") ]]; then
  echo "Installing Node.js via nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
fi

echo "Node: $(node -v)  npm: $(npm -v)"

# 2. Install dependencies (skip devDeps in production)
echo "Installing dependencies..."
npm install --omit=dev

# 3. Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# 4. Push schema to database (creates tables)
echo "Pushing database schema..."
npx prisma db push

# 5. Create logs directory
mkdir -p logs

# 6. Install PM2 globally if not present
if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
fi

# 7. Start the app
echo "Starting application with PM2..."
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

echo ""
echo "=== Setup Complete ==="
echo "App is running. Check status with: pm2 status"
echo "View logs with: pm2 logs kynex-pharmacloud"
echo ""
echo "IMPORTANT: Make sure your .env file has correct production values:"
echo "  - DATABASE_URL pointing to your MySQL database"
echo "  - JWT_SECRET set to a long random string"
echo "  - NODE_ENV=production"
