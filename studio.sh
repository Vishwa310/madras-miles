#!/bin/bash
# Open Prisma Studio connected to Render PostgreSQL
# Usage: ./studio.sh

export DATABASE_URL="postgresql://madras_walkathon_db_user:zunrJkXM8QFxZs8HULpL38jjXsukegga@dpg-d93otn7aqgkc73cd75l0-a.oregon-postgres.render.com/madras_walkathon_db"

cd /Users/epxxvis/projects/walky/server
echo "🔌 Connecting to Render PostgreSQL..."
echo "📊 Opening Prisma Studio at http://localhost:5555"
npx prisma studio
