#!/bin/bash
# Complete Screeps Server Reset Script
# Wipes all game data and creates fresh database

echo "🔄 Stopping Screeps server..."
pkill -f screeps 2>/dev/null || true

sleep 2

echo "💾 Backing up old database..."
if [ -f /root/db.json ]; then
    cp /root/db.json /root/db.json.backup.$(date +%s)
    echo "   Backed up to db.json.backup.$(date +%s)"
fi

echo "🗑️  Creating fresh empty database..."
cat > /root/db.json << 'EOF'
{
  "filename": "/root/db.json",
  "collections": [
    {"name": "env", "data": []},
    {"name": "users", "data": []},
    {"name": "rooms", "data": []},
    {"name": "rooms.objects", "data": []},
    {"name": "market.orders", "data": []},
    {"name": "market.intents", "data": []},
    {"name": "users.notifications", "data": []},
    {"name": "transactions", "data": []},
    {"name": "rooms.terrain", "data": []},
    {"name": "rooms.intents", "data": []},
    {"name": "rooms.flags", "data": []},
    {"name": "users.code", "data": []},
    {"name": "users.power_creeps", "data": []},
    {"name": "users.console", "data": []},
    {"name": "users.intents", "data": []},
    {"name": "users.messages", "data": []}
  ],
  "databaseVersion": 1.5,
  "engineVersion": 1.5,
  "autosave": true,
  "autosaveInterval": 5000,
  "autosaveHandle": null,
  "throttledSaves": true
}
EOF

echo "✅ Database reset complete!"
echo ""
echo "🚀 To restart the server, run:"
echo "   cd /root && npx screeps start"
echo ""
echo "⚠️  ALL GAME DATA HAS BEEN WIPED"
echo "   - No users exist"
echo "   - No rooms owned"
echo "   - No code uploaded"
echo ""
echo "🎮 You'll need to:"
echo "   1. Start the server"
echo "   2. Create a new account in the game client"
echo "   3. Choose a spawn room"
echo "   4. Upload your bot code"
