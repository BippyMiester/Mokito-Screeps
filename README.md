# Mokito Screeps Bot

[![Screeps](https://img.shields.io/badge/Screeps-AI%20Bot-brightgreen)](https://screeps.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An advanced AI bot for [Screeps](https://screeps.com/), the world's first persistent MMO strategy game where you control units through writing JavaScript code.

**REDESIGNED PHASE STRUCTURE (2026-04-18):** Focusing on clear phase progression with specific creep counts.

---

## 📊 Implementation Status

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 1 | Harvesters | Harvesters = open_spaces / 2 | 🔄 IN PROGRESS |
| 2 | Upgraders | 3 upgraders | 🔄 IN PROGRESS |
| 3 | Builders + Extensions | 3 builders | 🔄 IN PROGRESS |
| 4 | Runners + Repairers + Stationary | 3 runners, 2 repairers, stationary | 🔄 IN PROGRESS |
| 5 | Road Network | 10+ roads | 🔄 IN PROGRESS |
| 6 | Ramparts (Room Defense) | Ramparts at exits, no openings | 🔄 IN PROGRESS |
| 7+ | COMING SOON | Not yet implemented | ⏳ NOT STARTED |

**Current Focus:** Completing Phases 1-6 with clear requirements

---

## 🎮 Features

### In Progress (Phases 1-6) 🔄
- **Phase 1**: Harvesters = open_spaces / 2 (rounded down)
- **Phase 2**: Exactly 3 upgraders
- **Phase 3**: Exactly 3 builders + extensions
- **Phase 4**: 3 runners + 2 repairers + stationary harvesting
- **Phase 5**: Road network (10+ roads)
- **Phase 6**: Ramparts at room exits (continuous wall)

### Coming Soon (Phase 7+) ⏳
- Remote mining
- Storage system
- Tower defense
- Military operations
- Market trading
- Nuclear capabilities

---

## 📋 Creep Limits

| Role | Count | Phase |
|------|-------|-------|
| Harvester | open_spaces / 2 | 1 |
| Upgrader | 3 | 2 |
| Builder | 3 | 3 |
| Runner | 3 | 4 |
| Repairer | 2 | 4 |

---

## 🚀 Quick Start

### Prerequisites
- [Screeps](https://screeps.com/) account (Steam or Web)

### Installation
1. Clone or download this repository
2. Copy the contents of `main.js` (the compiled output)
3. Paste into your Screeps IDE or upload via API

```bash
# Using CLI tools
npm install -g screeps
screeps upload main.js
```

## 🕹️ Usage

Once deployed, Mokito will automatically progress through phases:

**Phase 1**: Spawn harvesters (open_spaces / 2)
**Phase 2**: Spawn 3 upgraders
**Phase 3**: Spawn 3 builders + build extensions
**Phase 4**: Spawn 3 runners + 2 repairers, switch to stationary
**Phase 5**: Build road network
**Phase 6**: Build ramparts at exits

### Monitoring
Watch the console for heartbeat messages every 60 ticks:
```
💓 Mokito | Phase 2: Upgraders | Creeps: H:3 U:2/3 | Next: ⚡ upgrader
```

## 👷 Creep Roles

| Role | Emoji | Purpose | Phase |
|------|-------|---------|-------|
| **Harvester** | 🌱 | Mines energy from sources | 1 |
| **Upgrader** | ⚡ | Upgrades room controller | 2 |
| **Builder** | 🔨 | Builds construction sites | 3 |
| **Runner** | 🏃 | Transports energy from drops | 4 |
| **Repairer** | 🔧 | Repairs structures | 4 |

## 🏗️ Architecture

```
.
├── main.js                 # Compiled entry point
├── build.js                # Build script
├── src/                    # Source code
│   ├── core/
│   │   └── Mokito.js      # Main game loop
│   ├── managers/
│   │   ├── SpawnManager.js
│   │   ├── CreepManager.js
│   │   ├── RoomManager.js
│   │   └── ConstructionManager.js
│   └── roles/
│       ├── Harvester.js
│       ├── Upgrader.js
│       ├── Builder.js
│       ├── Runner.js
│       └── Repairer.js
├── memory/                 # Documentation
│   ├── AGENT-KNOWLEDGE.md
│   └── *.md
└── strategy/              # Strategy docs
    ├── STRATEGY.md
    └── TASK_IMPLEMENTATION.md
```

## 🛠️ Development

### Build Process
```bash
node build.js              # Build and minify
bash scripts/push-to-github.sh "message"  # Push to GitHub
```

### Reset Server Data
```bash
node cli/reset-server.js   # Reset without restarting server
```

## 📚 Documentation
- `/memory/AGENT-KNOWLEDGE.md` - Project summary
- `/strategy/STRATEGY.md` - Complete phase strategy
- `/strategy/TASK_IMPLEMENTATION.md` - Task tracking

---

*Last Updated: 2026-04-18*
*Phases 1-6: IN PROGRESS | Phases 7+: COMING SOON*
