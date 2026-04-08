# Mokito Memory

This directory contains session memories and development logs for the Mokito Screeps bot. These files help AI agents understand the project context and maintain continuity across sessions.

## Structure

```
memory/
├── index.md              # This file - memory index
├── 2026-04-08.md        # Session: Multi-room harvesting, defense, server fixes
└── [future sessions]    # Additional session logs
```

## Purpose

The memory files serve as:
- **Development log** - Track what was built and when
- **Context preservation** - Help AI agents understand project history
- **Documentation** - Explain design decisions and architecture
- **Onboarding** - Help new developers understand the codebase

## Key Sessions

### 2026-04-08 - Multi-Room & Defense Implementation
- Multi-room harvesting system (RemoteHarvester, Hauler, Claimer)
- Defense structures (towers, ramparts, walls)
- Creep ratio updates (1:1 builders:upgraders)
- Obstacle avoidance for harvesters
- Screeps server fixes and systemd service

## Bot Features Implemented

### Phase 1: Basic Economy
- Harvester roles (traditional and stationary modes)
- Runner for energy transport
- Upgrader for controller

### Phase 2: Construction
- Builder for construction sites
- Repairer for maintenance
- Automatic road building
- Defense structures

### Phase 3: Multi-Room
- Remote harvesting from adjacent rooms
- Haulers for long-distance transport
- Claimers for room reservation
- Automatic room scouting

### Advanced Features
- Idle upgrade behavior (all creeps)
- Obstacle avoidance
- Energy-efficient spawning
- Multi-line console output

## Architecture

The bot uses a modular architecture with:
- **Roles** - Individual creep behaviors (7 roles)
- **Managers** - Room-level systems (6 managers)
- **Core** - Main game loop

See `README.md` for full documentation.

## Session Files

| Date | Focus | Key Changes |
|------|-------|-------------|
| 2026-04-08 | Multi-room, Defense, Server | RemoteHarvesters, defense structures, systemd service |

---

*Last updated: 2026-04-08*
