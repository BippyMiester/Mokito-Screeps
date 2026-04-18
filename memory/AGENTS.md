# Screeps AI Bot - Project Context

## AI CONTEXT

Read this file and commit this file to your context for this session. Follow all instructions located within this file while working on the project. After you have read these files and you're ready to start development, let the user know. Refer back to this file for every new task to ensure that you are following the correct procedures for every single task. Do this first before start working on the task.

## Project Overview
This is an AI bot for the game [Screeps](https://screeps.com/), a persistent MMO RTS where players control units through JavaScript code.

## New Session Setup

When a new agent session starts, the agent will read this file and all files located in the `/root/bot/memory` directory to get a sense of what the project is accomplishing, how much we have accomplished, and what we still need to do.
The `/root/bot/strategy` directory contains all of the combine strategies of the three example bots into one giant strategy. This strategy is what we are implementing.
The `/root/bot` directory will be referred to as the bot's root directory.
The screeps server itself should never be altered.
The screeps server should never be restarted unless directed to do so specifically by the user.
The `build.js` file will minify the full script into a more performant version.
You will push commits to github using the `/root/scripts/push-to-github.sh` script. Read over this script and how to use it.
A new repository release will happen when we complete a phase and push it to github. However, the user will let you know when to create a new release. The release is handled by the `/root/bot/.github/phase-release.yml` file. Read this file to understand how releases work.
The screeps server will be interacted with using the Screeps CLI. There are scripts located in the `/root/bot/cli` directory that interact with the Screeps CLI to do various tasks. Read over these files and understand how to use them.
Example Screeps bot AI projects are located at `/root/screeps/examples`. Refer to them whenever we are implementing a new phase. These projects will also be referred to as the bot examples.
The bot examples can sometimes be written in TypeScript. We are not using TypeScript for our bot development. We are using vanilla Javascript to develop our bot.
All of our previous conversations will be saved in `/root/bot/chats`. Read over all of our previous chats to learn what we have accomplished and the issues we ran into and how we fixed them.
You can interact with the server using the `/root/bot/cli` scripts located within this directory. You may create additional scripts in this directory. The screeps server has the ScreepsMod Admin Utils mod installed. More information about this mod can be found at their Github: https://github.com/ScreepsMods/screepsmod-admin-utils

## Screeps Documentation

The Screeps API data can be found at: https://docs.screeps.com/api/
The Screeps Engine GitHub repository can be found at: https://github.com/screeps/screeps?tab=readme-ov-file
The Screeps Community Documentation can be found at: https://docs.screeps.com/index.html

Use this documentation to help build the bot and ensure that there are no errors or bugs when creating the bot. This documentation can also be used to create strategies and learn about the mechanics of the Screeps game, terminiology, and more.

## File Structure
- `main.js` - The primary entry point
- `build.js` - Build script for the project
- `src/` - Source directory containing modular code
- `main.js.backup` - Backup of previous version

## Architecture
The bot is built in a modular fashion with code in `src/` being compiled/bundled into `main.js` for deployment to Screeps.

## Development Notes
- Uses a build process (`build.js`) to bundle the source code
- The `main.js` file is a minified file
- The `main-full.js` file is a human readable regular file with code comments
- The `src/` directory contains the modular source code
- Final output is `main.js` which gets deployed to Screeps
- After work is complete on a task, push the changes to github
- You must keep the following files updated while working on the bot. A `*` means all files within that directory: `/root/bot/memory/AGENT-KNOWLEDGE.md`, `/root/bot/strategy/*`, 
- After making changes after a task is complete, build the project using the `/root/bot/build.js` script
- Every task given by the user should have an OpenCode task list associated with it. You should update this task list during development.
- Clear the OpenCode modified files list after a push to github using the github push script.
- Ensure that there is never any console spam. The only things that should be in the console are the heartbeat, the spawning new creep message, and any errors that the bot encounters while running.

## Provider Configuration
Current provider: Ollama Cloud (kimi-k2.5:cloud)
Configuration: `~/.config/opencode/opencode.json`
