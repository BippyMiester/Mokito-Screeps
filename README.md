# Mokito Screeps Bot

[![Screeps](https://img.shields.io/badge/Screeps-AI%20Bot-brightgreen)](https://screeps.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An advanced AI bot for [Screeps](https://screeps.com/), the world's first persistent MMO strategy game where you control units through writing JavaScript code. Mokito features an efficient multi-phase economy system with stationary harvesting, automatic creep spawning priorities, and intelligent energy distribution.

## 🎮 Features

- **Multi-Phase Economy System**: Automatically adapts from early game to late game
- **Stationary Harvesting**: Maximizes energy output with dedicated harvesters
- **Smart Energy Distribution**: Runners transport energy from drops to spawn/extensions
- **Automated Spawning**: Intelligent creep priority system based on room needs
- **Construction Management**: Automatic road building, extension placement, and structure repair
- **Role-Based Architecture**: Modular design with specialized creep roles
- **Emergency Recovery**: Automatically recovers from disaster scenarios

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

| Role | Emoji | Purpose | Energy Source |
|------|-------|---------|---------------|
| **Harvester** | 🌱 | Mines energy from sources | Self-mining (drops on ground in stationary mode) |
| **Runner** | 🏃 | Transports energy from drops to spawn | Picks up dropped energy |
| **Upgrader** | ⚡ | Upgrades room controller | Picks up dropped energy or self-mines |
| **Builder** | 🔨 | Builds construction sites | Picks up dropped energy or self-mines |
| **Repairer** | 🔧 | Repairs roads, containers, walls | Picks up dropped energy or self-mines |

### Role Behaviors

- **Harvesters**: In stationary mode, stand by sources and drop energy. In traditional mode, deliver to spawn.
- **Runners**: Collect dropped energy and deliver to spawn → extensions → towers.
- **Upgraders**: Self-sufficient upgraders that mine their own energy or collect from drops.
- **Builders**: Collect dropped energy, build structures, or help repair when idle.
- **Repairers**: Maintain roads, containers, ramparts, and walls.

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
7. Spawn **Builders** first (max 3, requires construction sites)
8. Spawn **Repairers** after builders (2 per 1 builder, max 4)

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
│   │   ├── Harvester.js     # Mining logic
│   │   ├── Runner.js        # Energy transport
│   │   ├── Upgrader.js      # Controller upgrading
│   │   ├── Builder.js       # Construction
│   │   └── Repairer.js      # Repair logic
│   └── utils/
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
