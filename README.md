# Mokito Screeps Bot

An AI bot for [Screeps](https://screeps.com/), the world's first persistent MMO strategy game where you control units through writing JavaScript code.

## Overview

This repository contains the Mokito Screeps AI bot, designed to autonomously manage resources, build structures, spawn creeps, and defend your territory in the Screeps game world.

## Project Structure

```
.
├── main.js              # Compiled entry point (deployed to Screeps)
├── build.js             # Build script for bundling source code
├── src/                 # Source code directory
│   ├── main.js          # Source entry point
│   ├── core/            # Core game logic
│   ├── managers/        # Manager modules (creeps, rooms, etc.)
│   ├── prototypes/      # Creep/structure prototypes
│   ├── roles/           # Creep role definitions
│   ├── tasks/           # Task definitions
│   └── utils/           # Utility functions
├── AGENTS.md            # OpenCode agent configuration
└── .gitignore          # Git ignore rules
```

## Architecture

The bot is built in a modular fashion:
- **Source code** lives in `src/` directory
- **Build process** (`build.js`) bundles the source into `main.js`
- **Final output** (`main.js`) is deployed to Screeps

## Development

### Prerequisites

- [Screeps](https://screeps.com/) account
- Node.js (if using build tools)

### Building

Run the build script to compile the source code:

```bash
node build.js
```

This will bundle all modules from `src/` into `main.js` ready for deployment.

### Deployment

1. Copy the contents of `main.js`
2. Paste into the Screeps IDE or use the Screeps API/CLI tools

## Features

- **Modular Architecture**: Clean separation of concerns with managers, roles, and tasks
- **Creep Management**: Automated creep spawning based on room needs
- **Role System**: Extensible role definitions for different creep types
- **Task System**: Priority-based task queue for efficient creep utilization
- **Prototype Extensions**: Enhanced creep and structure prototypes

## Contributing

This project uses [OpenCode](https://opencode.ai/) for AI-assisted development. See `AGENTS.md` for project-specific instructions.

## License

[Your License Here]

## Author

[BippyMiester](https://github.com/BippyMiester)

---

**Note**: This is a game AI bot. The code runs on Screeps game servers to control your in-game units.
