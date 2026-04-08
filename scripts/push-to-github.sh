#!/bin/bash
# Comprehensive GitHub Push Script for Mokito
# Automatically syncs memory files and pushes to GitHub

set -e  # Exit on error

echo "🚀 Starting GitHub push process..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Change to bot directory
cd /root/bot

echo -e "${YELLOW}📋 Step 1: Syncing memory files...${NC}"

# Create memory directory if it doesn't exist
mkdir -p memory

# Copy today's memory file if it exists
TODAY=$(date +%Y-%m-%d)
if [ -f "/root/.agents/memory/${TODAY}.md" ]; then
    cp "/root/.agents/memory/${TODAY}.md" memory/
    echo -e "${GREEN}  ✓ Copied ${TODAY}.md${NC}"
fi

# Copy all other memory files
for file in /root/.agents/memory/*.md; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        if [ ! -f "memory/$filename" ] || [ "$file" -nt "memory/$filename" ]; then
            cp "$file" memory/
            echo -e "${GREEN}  ✓ Copied $filename${NC}"
        fi
    fi
done

# Copy session state
if [ -f "/root/.agents/SESSION-STATE.md" ]; then
    cp "/root/.agents/SESSION-STATE.md" memory/
    echo -e "${GREEN}  ✓ Copied SESSION-STATE.md${NC}"
fi

# Update memory index
cat > memory/index.md << 'INDEXEOF'
# Mokito Memory

This directory contains session memories and development logs for the Mokito Screeps bot. These files help AI agents understand the project context and maintain continuity across sessions.

## Structure

```
memory/
├── index.md              # This file - memory index
├── SESSION-STATE.md      # Current session state
├── 2026-04-08.md         # Session: Multi-room harvesting, defense, server fixes
└── [future sessions]    # Additional session logs
```

## Purpose

The memory files serve as:
- **Development log** - Track what was built and when
- **Context preservation** - Help AI agents understand project history
- **Documentation** - Explain design decisions and architecture
- **Onboarding** - Help new developers understand the codebase

## Session Files

| Date | Focus | Key Changes |
|------|-------|-------------|
| 2026-04-08 | Multi-room, Defense, Server | RemoteHarvesters, defense structures, systemd service |

## How to Update

This index is automatically updated by the push script. To add new memories:
1. Write to `.agents/memory/YYYY-MM-DD.md`
2. Run `./push-to-github.sh "Your commit message"`
3. Memory files are automatically synced

---

*This file is auto-generated. Last updated: $(date)*
INDEXEOF

echo ""
echo -e "${YELLOW}📋 Step 2: Checking for changes...${NC}"

# Check if there are any changes
if git diff --quiet && git diff --staged --quiet; then
    echo -e "${YELLOW}  ⚠ No changes to commit${NC}"
    echo "    Everything is up to date!"
    exit 0
fi

echo -e "${GREEN}  ✓ Changes detected${NC}"

# Show what's changed
echo ""
echo -e "${YELLOW}📋 Step 3: Files to be committed:${NC}"
git status --short

echo ""
echo -e "${YELLOW}📋 Step 4: Adding files to git...${NC}"
git add -A
echo -e "${GREEN}  ✓ All files added${NC}"

echo ""
echo -e "${YELLOW}📋 Step 5: Committing...${NC}"

# Use provided commit message or default
if [ -z "$1" ]; then
    COMMIT_MSG="Update from $(date +%Y-%m-%d) - Memory files synced"
else
    COMMIT_MSG="$1"
fi

git commit -m "$COMMIT_MSG"
echo -e "${GREEN}  ✓ Committed: $COMMIT_MSG${NC}"

echo ""
echo -e "${YELLOW}📋 Step 6: Pushing to GitHub...${NC}"

# Source .env for credentials
source .env

# Push to GitHub
git push "https://${GITHUB_USERNAME}:${GITHUB_PAT}@github.com/${GITHUB_USERNAME}/Mokito-Screeps.git" master

echo -e "${GREEN}  ✓ Pushed successfully!${NC}"

echo ""
echo "========================================"
echo -e "${GREEN}✅ GitHub push complete!${NC}"
echo "========================================"
echo ""
echo "Commit: $COMMIT_MSG"
echo "Memory files synced and committed"
echo ""
