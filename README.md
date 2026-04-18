# Mokito Screeps Bot

[![Screeps](https://img.shields.io/badge/Screeps-AI%20Bot-brightgreen)](https://screeps.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An advanced AI bot for [Screeps](https://screeps.com/), the world's first persistent MMO strategy game where you control units through writing JavaScript code. Mokito features an efficient multi-phase economy system with stationary harvesting, automatic creep spawning priorities, and intelligent energy distribution.

## 📊 Implementation Status

| Phase | Status | Description | Completion |
|-------|--------|-------------|------------|
| 0 | ✅ **COMPLETE** | Emergency Mode - Basic survival with minimal creeps | 100% |
| 1 | ✅ **COMPLETE** | Foundation - Harvester, Runner, basic spawning | 100% |
| 2 | ✅ **COMPLETE** | Stabilization - Upgrader, Builder roles | 100% |
| 3 | ✅ **COMPLETE** | Capacity - Extension construction | 100% |
| 4 | ✅ **COMPLETE** | Efficiency - Stationary harvesting, containers | 100% |
| 5 | ✅ **COMPLETE** | Road Networks - Automated path construction | 100% |
| 6 | ✅ **COMPLETE** | Defense Foundations - Ramparts, basic defense | 100% |
| 7 | ✅ **COMPLETE** | Towers - Tower construction and AI | 100% |
| 8 | ✅ **COMPLETE** | Storage System - Storage construction | 100% |
| 9 | ✅ **COMPLETE** | Remote Mining - RemoteHarvester, Hauler, Claimer | 100% |
| 10-20 | ⏳ PENDING | Military, Market, Nuclear, Endgame | 0% |

**Current Focus:** Phases 0-9 are **100% complete** with comprehensive economy and defense! 🎉

**Bot Statistics:**
- Size: 209 KB
- 20 modules
- 12 creep roles implemented
- 35% energy reserve for emergencies
- Phase-based spawning with grace periods
- Last updated: 2026-04-18

---

## 🎮 Features

### Implemented (Phases 0-9) ✅
- **Emergency Recovery**: Automatic spawning when harvesters < 2
- **Phase-Based Spawning**: Dynamic priority system with phase persistence and grace periods
- **Multi-Role Creeps**: Harvester, Runner, Upgrader, Builder, Repairer, RemoteHarvester, Hauler, Claimer, Defender
- **Smart Energy Distribution**: 35% energy reserve maintained for emergencies
- **Extension Construction**: Automated placement
- **Stationary Harvesting**: Container-based mining with automatic mode switching
- **Road Networks**: Automated path construction from spawn to sources and controller
- **Defense System**: Ramparts around critical structures, tower AI, defender creeps
- **Storage System**: Energy buffer for burst spending
- **Remote Mining**: Multi-room harvesting with haulers
- **Console Management**: Minimal spam - only heartbeats, spawn messages, and errors
- **Memory Persistence**: Session history and development logs

### Planned (Phases 10-20)
- **Military Operations**: Attack squads, healing coordination
- **Scout Network**: Intelligence gathering
- **Market Trading**: Resource arbitrage
- **Power Processing**: NPC strongholds
- **Nuclear Capabilities**: Endgame destruction

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Usage](#usage)
- [Creep Roles](#creep-roles)
- [Spawning Strategy](#spawning-strategy)
- [Architecture](#architecture)
- [Development](#development)
- [Configuration](#configuration)

## 🚀 Quick Start

### Prerequisites

- [Screeps](https://screeps.com/) account (Steam or Web)
- Basic understanding of Screeps game mechanics

### Installation

1. **Clone or download** this repository
2. **Copy** the contents of `main.js` (the compiled output)
3. **Paste** into your Screeps IDE or upload via API

```bash
# Alternative: Using Screeps CLI tools
npm install -g screeps
screeps upload main.js
```

4. **Deploy** to your room - the bot will automatically initialize

## 🕹️ Usage

### Getting Started

Once deployed, Mokito will automatically:

1. **Phase 1 (Early Game)**: Spawn 2 harvesters to gather energy, then 1 upgrader
2. **Phase 2 (Growth)**: Fill all available harvester positions around energy sources
3. **Phase 3 (Stationary Mode)**: Switch to stationary harvesting with runners transporting energy
4. **Phase 4 (Construction)**: Spawn builders and repairers to develop your base

The bot requires **no manual configuration** - it automatically adapts to your room's RCL (Room Controller Level) and available energy.

### Monitoring

Watch the console for heartbeat messages every 60 ticks:

```
💓 Mokito | Creeps: H:4 R:2 U:3 B:1 Rp:1 | GCL:1 | RCL:2 | Energy:1250 | Next: 🌱 harvester (4/6 positions filled)
```

**Legend:**
- `H`: Harvesters
- `R`: Runners  
- `U`: Upgraders
- `B`: Builders
- `Rp`: Repairers
- `Next`: Shows what creep will spawn next

### Manual Intervention (Optional)

While fully autonomous, you can:

- **Set room memory**: `Game.rooms['W1N1'].memory.stationaryMode = true/false`
- **Force traditional mode**: Set if you want harvesters to deliver to spawn
- **View spawn queue**: Check `Game.rooms['W1N1'].memory.spawnPriority`

## 👷 Creep Roles

| Role | Emoji | Purpose | Status |
|------|-------|---------|--------|
| **Harvester** | 🌱 | Mines energy from sources | ✅ Phase 1 |
| **Runner** | 🏃 | Transports energy from drops to spawn | ✅ Phase 1 |
| **Upgrader** | ⚡ | Upgrades room controller | ✅ Phase 2 |
| **Builder** | 🔨 | Builds construction sites | ✅ Phase 2 |
| **Repairer** | 🔧 | Repairs roads, containers, walls | ✅ Phase 2 |
| **RemoteHarvester** | 🌍 | Mines energy in adjacent rooms | ✅ Phase 6 |
| **Hauler** | 🚚 | Long-distance energy transport | ✅ Phase 6 |
| **Claimer** | 🏳️ | Room reservation and claiming | ✅ Phase 9 |
| **Defender** | 🛡️ | Room defense and attack response | ✅ Phase 7 |
| **Attacker** | ⚔️ | Military offensive operations | ⏳ Phase 12 |
| **Healer** | 💚 | Squad healing and support | ⏳ Phase 12 |
| **Scout** | 🔍 | Intelligence gathering | ⏳ Phase 11 |

### Role Behaviors

- **Harvester**: Dual-mode system (traditional delivery or stationary drop), automatic mode switching
- **Runner**: Collect dropped energy and deliver to spawn → extensions → towers → storage
- **Upgrader**: Self-sufficient upgraders that mine their own energy or collect from drops
- **Builder**: Collect dropped energy, build structures, or help repair when idle
- **Repairer**: Maintain roads, containers, ramparts, and walls
- **RemoteHarvester**: Travel to adjacent rooms, build containers, mine sources
- **Hauler**: Collect from remote containers, deliver to home room storage
- **Claimer**: Reserve or claim controller in adjacent rooms
- **Defender**: Attack hostile creeps, protect room from invaders

## 📊 Spawning Strategy

Mokito follows a strict spawning priority system:

### Phase 1: Initial Setup
1. Spawn 2 **Harvesters** (deliver energy to spawn)
2. Spawn 1 **Upgrader** (self-mines)

### Phase 2: Harvester Saturation
3. Continue spawning **Harvesters** until all source positions filled
4. Switch to **Stationary Mode** when complete

### Phase 3: Energy Distribution (Stationary Mode)
5. Spawn **Runners** (1 per 2 harvesters)
6. Spawn **Upgraders** (1:1 ratio with harvesters)

### Phase 4: Base Development
7. Spawn **Builders** (max 3, requires construction sites)
8. Spawn **Repairers** (2 per 1 builder, max 4)

### Phase 5-9: Advanced Infrastructure
9. Build **Containers** at sources for stationary harvesting
10. Build **Roads** (10+ minimum) for movement efficiency
11. Build **Ramparts** for defense (3+ around critical structures)
12. Build **Towers** (max allowed by RCL) with automated defense AI
13. Build **Storage** for resource buffering
14. Spawn **Remote Workers** (RemoteHarvester, Hauler, Claimer) for multi-room expansion

### Emergency Protocol
- If harvesters drop below 2, **immediately** rebuild harvesters
- Pause all other spawning until energy production restored

## 🏗️ Architecture

```
.
├── main.js                 # Compiled entry point (deploy to Screeps)
├── build.js                # Build script
├── src/                    # Source code
│   ├── main.js            # Entry point
│   ├── core/
│   │   └── Mokito.js      # Main game loop
│   ├── managers/
│   │   ├── SpawnManager.js    # Creep spawning logic
│   │   ├── CreepManager.js    # Creep role execution
│   │   ├── RoomManager.js     # Room-level operations
│   │   ├── ConstructionManager.js  # Build planning
│   │   ├── MemoryManager.js   # Memory cleanup
│   │   └── SourceManager.js   # Source management
│   ├── roles/
│   │   ├── Harvester.js     # Mining logic (Phase 1 ✅)
│   │   ├── Runner.js        # Energy transport (Phase 1 ✅)
│   │   ├── Upgrader.js      # Controller upgrading (Phase 2 ✅)
│   │   ├── Builder.js       # Construction (Phase 2 ✅)
│   │   ├── Repairer.js      # Repair logic (Phase 2 ✅)
│   │   ├── RemoteHarvester.js  # Remote mining (Phase 6)
│   │   ├── Hauler.js        # Long-distance transport (Phase 6)
│   │   ├── Claimer.js       # Room reservation (Phase 9)
│   │   ├── Defender.js      # Room defense (Phase 10)
│   │   ├── Attacker.js      # Military attacks (Phase 12)
│   │   ├── Healer.js        # Squad support (Phase 12)
│   │   └── Scout.js         # Intelligence (Phase 11)
│   └── utils/
├── strategy/              # Strategy documentation
│   ├── STRATEGY.md        # Complete 20-phase strategy
│   ├── TASK_IMPLEMENTATION.md  # Detailed task list
│   ├── BOT_COMPARISON.md  # Example bot analysis
│   ├── MILITARY_ANALYSIS.md    # Military tactics
│   └── README.md          # Strategy index
├── cli/                   # CLI utilities
│   ├── reset-server.js    # Server reset script
│   └── set-tickrate.js    # Tick rate configuration
├── memory/                # Session memories
├── scripts/               # Helper scripts
│   └── push-to-github.sh  # Automated push with memory sync
├── AGENTS.md              # OpenCode agent configuration
├── .env.example           # Environment template
└── README.md              # This file
```

## 💻 Development

### Building from Source

```bash
# Install dependencies (if any)
npm install

# Build the project
node build.js

# Deploy (copy main.js to Screeps)
```

### Project Structure

- **Source code** in `src/` - modular JavaScript classes
- **Build process** (`build.js`) - combines modules into single `main.js`
- **Output** (`main.js`) - deployed to Screeps

### Adding New Features

1. Edit files in `src/`
2. Run `node build.js`
3. Deploy `main.js` to Screeps

## ⚙️ Configuration

### Environment Variables

Create a `.env` file for local development (not deployed):

```bash
GITHUB_USERNAME=your_username
GITHUB_PAT=your_personal_access_token
```

### Room Memory

Access room configuration via Screeps console:

```javascript
// Check if room is in stationary mode
Game.rooms['W1N1'].memory.stationaryMode

// View spawn priority queue
Game.rooms['W1N1'].memory.spawnPriority

// Force traditional mode (harvesters deliver to spawn)
Game.rooms['W1N1'].memory.stationaryMode = false
```

## 🏷️ Tags

This repository is tagged with:
- `screeps` - Official Screeps game
- `screeps-bot` - Screeps AI bot
- `screeps-ai` - Artificial Intelligence for Screeps
- `javascript` - Vanilla JavaScript implementation
- `game-ai` - Game artificial intelligence
- `mmo-strategy` - MMO strategy game
- `automation` - Automated gameplay

## 🤝 Contributing

This project uses [OpenCode](https://opencode.ai/) for AI-assisted development. See `AGENTS.md` for project-specific context and coding conventions.

To contribute:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## 📝 License

MIT License - feel free to use, modify, and distribute!

## 👤 Author

**BippyMiester** - [GitHub](https://github.com/BippyMiester)

## 🙏 Acknowledgments

- [Screeps](https://screeps.com/) - The amazing game that makes this possible
- Screeps community for inspiration and examples
- OpenCode for AI-assisted development

---

**🎮 Note**: This is a game AI bot. The code runs on Screeps game servers to autonomously control your in-game units. Happy coding!

## 🔗 Links

- [Screeps Official Website](https://screeps.com/)
- [Screeps Documentation](https://docs.screeps.com/)
- [Screeps API Reference](https://docs.screeps.com/api/)

## 📊 Stats

![GitHub repo size](https://img.shields.io/github/repo-size/BippyMiester/Mokito-Screeps)
![GitHub last commit](https://img.shields.io/github/last-commit/BippyMiester/Mokito-Screeps)
![GitHub stars](https://img.shields.io/github/stars/BippyMiester/Mokito-Screeps?style=social)
