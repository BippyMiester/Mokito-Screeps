# Mokito Screeps Bot - Project Summary

## Project Overview
Mokito is an AI bot for [Screeps](https://screeps.com/), a persistent MMO RTS where players control units through JavaScript code.

## Current Status (2026-04-18)
- **Bot Size**: ~220 KB
- **Modules**: 20
- **Creep Roles**: 12 implemented
- **Current Phase**: Phases 1-6 (Redesigned)
- **Phase 7+**: COMING SOON

## NEW Phase Structure (Redesigned 2026-04-18)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 1 | Harvesters | Harvesters = open_spaces / 2 | 🔄 IN PROGRESS |
| 2 | Upgraders | 3 upgraders | 🔄 IN PROGRESS |
| 3 | Builders + Extensions | 3 builders | 🔄 IN PROGRESS |
| 4 | Runners + Repairers + Stationary | 3 runners, 2 repairers, stationary mode | 🔄 IN PROGRESS |
| 5 | Road Network | 10+ roads | 🔄 IN PROGRESS |
| 6 | Ramparts (Room Defense) | Ramparts at exits, continuous wall | 🔄 IN PROGRESS |
| 7+ | COMING SOON | Not yet implemented | ⏳ NOT STARTED |

## Creep Limits (NEW - Per Phase)

| Role | Count | Phase |
|------|-------|-------|
| Harvester | open_spaces / 2 | 1 |
| Upgrader | 3 | 2 |
| Builder | 3 | 3 |
| Runner | 3 | 4 |
| Repairer | 2 | 4 |

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

## Strategy Documentation
Located in `/root/bot/strategy/`:
- **STRATEGY.md** - Complete phase strategy (NEW phases 1-6)
- **TASK_IMPLEMENTATION.md** - Task list updated for new phases
- **BOT_COMPARISON.md** - Analysis of example bots
- **MILITARY_ANALYSIS.md** - Squad tactics, defense strategies
- **TESTING_FRAMEWORK.md** - Testing approach

## Build Process
- Source code in `src/` is modular JavaScript
- `build.js` bundles modules into single `main.js` for deployment
- Deploy `main.js` to Screeps IDE or via API

## Server Management
```bash
systemctl start/stop/restart screeps  # Server control
node cli/reset-server.js              # Reset server data (USE THIS, don't restart)
```

## Memory System
Session logs stored in `/root/bot/memory/`:
- `SESSION-STATE.md` - Current session status
- `YYYY-MM-DD.md` - Daily development logs
- `index.md` - Memory index

## Next Tasks (Focus on Phases 1-6)
1. Complete Phase 1: Harvester spawning with correct formula
2. Complete Phase 2: 3 upgraders
3. Complete Phase 3: 3 builders + extensions
4. Complete Phase 4: 3 runners + 2 repairers + stationary mode
5. Complete Phase 5: Road network
6. Complete Phase 6: Ramparts with no openings

*Last Updated: 2026-04-18*
