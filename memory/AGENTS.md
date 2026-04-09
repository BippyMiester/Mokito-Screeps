# Screeps AI Bot - Project Context

## Project Overview
This is an AI bot for the game [Screeps](https://screeps.com/), a persistent MMO RTS where players control units through JavaScript code.

## File Structure
- `main.js` - The primary entry point (40556 bytes, compiled output)
- `build.js` - Build script for the project
- `src/` - Source directory containing modular code
- `main.js.backup` - Backup of previous version

## Architecture
The bot is built in a modular fashion with code in `src/` being compiled/bundled into `main.js` for deployment to Screeps.

## Development Notes
- Uses a build process (`build.js`) to bundle the source code
- The `src/` directory contains the modular source code
- Final output is `main.js` which gets deployed to Screeps

## Session Persistence
**Important:** OpenCode automatically saves session history. To resume previous sessions:

1. **Command:** Use `/sessions` (or `/resume`, `/continue`) in the TUI to list and switch between saved sessions
2. **Location:** Sessions are stored in:
   - Database: `~/.local/share/opencode/opencode.db`
   - Snapshots: `~/.local/share/opencode/snapshot/`
   - Session diffs: `~/.local/share/opencode/storage/session_diff/`

## Commands Reference
- `/sessions` - List and resume previous sessions
- `/undo` - Undo last changes (uses git)
- `/redo` - Redo previously undone changes
- `/share` - Share current conversation
- `/export` - Export conversation to Markdown
- `/compact` - Summarize session to save tokens

## Provider Configuration
Current provider: Ollama Cloud (kimi-k2.5:cloud)
Configuration: `~/.config/opencode/opencode.json`
