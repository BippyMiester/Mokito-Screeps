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
