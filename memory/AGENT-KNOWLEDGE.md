# Mokito Screeps Bot - Project Summary

## Project Overview
Mokito is an advanced AI bot for [Screeps](https://screeps.com/), a persistent MMO RTS where players control units through JavaScript code. The bot features a multi-phase economy system with stationary harvesting, automatic creep spawning priorities, and intelligent energy distribution.

## Current Status (2026-04-17)
- **Bot Size**: 177.98 KB
- **Modules**: 20
- **Creep Roles**: 12 implemented
- **Phases Complete**: 0-9 (100%)
- **Next Phase**: Phase 10 - Scout Network Enhancement, Military Squad System

## Implementation Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | ✅ Complete | Emergency Mode - Basic survival |
| 1 | ✅ Complete | Foundation - Harvester, Runner, basic spawning |
| 2 | ✅ Complete | Stabilization - Upgrader, Builder roles |
| 3 | ✅ Complete | Capacity - Extension construction |
| 4 | ✅ Complete | Efficiency - Stationary harvesting, containers |
| 5 | ✅ Complete | Infrastructure - Road networks |
| 6 | ✅ Complete | Defense - Ramparts around critical structures |
| 7 | ✅ Complete | Defense - Tower construction and AI |
| 8 | ✅ Complete | Storage - Storage construction, energy balancing |
| 9 | ✅ Complete | Remote Mining - RemoteHarvester, Hauler, Claimer |
| 10-11 | 🔄 Next | Scout Network, Military Squads |
| 12+ | ⏳ Pending | Squad Warfare, Expansion, Endgame |

## Architecture

### Core Structure
```
src/
├── main.js                    # Entry point
├── core/
│   └── Mokito.js             # Main game loop, heartbeat every 60 ticks
├── managers/
│   ├── SpawnManager.js       # Creep spawning with priority system
│   ├── CreepManager.js       # Role execution
│   ├── RoomManager.js        # Room operations, defense, remote mining
│   ├── ConstructionManager.js # Build planning (extensions, roads, defense)
│   ├── MemoryManager.js       # Memory cleanup
│   └── SourceManager.js       # Source management
└── roles/
    ├── Harvester.js          # Mining logic (traditional/stationary modes)
    ├── Runner.js             # Energy transport
    ├── Upgrader.js           # Controller upgrading
    ├── Builder.js            # Construction
    ├── Repairer.js           # Structure repair
    ├── RemoteHarvester.js    # Multi-room mining
    ├── Hauler.js             # Long-distance transport
    ├── Claimer.js            # Room reservation
    ├── Defender.js           # Room defense
    ├── Attacker.js           # Military attacks (squad-based)
    ├── Healer.js             # Squad support
    └── Scout.js              # Intelligence gathering
```

### Creep Ratios (Current)
- **Harvesters**: 1 per open source position (fills all spots around sources)
- **Runners**: 1 per 2 harvesters
- **Upgraders**: 1:1 ratio with harvesters
- **Builders**: 1:1 ratio with upgraders (max 3)
- **Repairers**: (Builders + Upgraders) / 2 (max 4)

### Key Systems
1. **Emergency Protocol**: If harvesters < 2, immediately spawn more
2. **Stationary Mode**: Harvesters drop energy at source; Runners collect
3. **Defense System**: Tower targeting, Defender spawning, threat detection
4. **Remote Mining**: Auto-scouts adjacent rooms, spawns RemoteHarvesters/Haulers/Claimers
5. **Squad Warfare**: 3 attackers + 1 healer coordination for attacks

## Strategy Documentation
Located in `/root/bot/strategy/`:
- **STRATEGY.md** - Complete 20-phase game strategy
- **TASK_IMPLEMENTATION.md** - Prioritized task list (32 tasks)
- **BOT_COMPARISON.md** - Analysis of TooAngel, Overmind, Hivemind bots
- **MILITARY_ANALYSIS.md** - Squad tactics, defense strategies
- **TESTING_FRAMEWORK.md** - Testing approach for Screeps environment

## Build Process
- Source code in `src/` is modular JavaScript
- `build.js` bundles modules into single `main.js` for deployment
- Deploy `main.js` to Screeps IDE or via API

## Key User Preferences
- Multi-line heartbeat output (every 60 ticks)
- Wait for full energy before spawning (for maximum body parts)
- All creeps upgrade controller when idle
- Obstacle avoidance: Harvesters request other creeps to move
- Screeps server running via systemd (tick rate: 250ms)
- Steam API key stored in `.env` file

## Server Management
```bash
systemctl start/stop/restart screeps  # Server control
node cli/set-tickrate.js 250          # Set tick rate
node cli/reset-server.js              # Reset server data
```

## Memory System
Session logs stored in `/root/bot/memory/`:
- `SESSION-STATE.md` - Current session status
- `YYYY-MM-DD.md` - Daily development logs
- `index.md` - Memory index

## Derived From
Analysis of 3 top-tier Screeps bots:
- **TooAngel** - Squad warfare, comprehensive roles (40+), room planning
- **Overmind** - Colony-based architecture, TypeScript, task queuing
- **Hivemind (Mirroar)** - Empire management, inter-shard operations

## Next Tasks (Phase 10-11)
1. Enhance Scout role with comprehensive intelligence gathering
2. Implement room threat assessment and hostile identification
3. Complete military squad coordination system (Attackers + Healers)
4. Add squad formation waiting and group movement logic
