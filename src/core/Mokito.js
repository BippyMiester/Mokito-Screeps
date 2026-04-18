'use strict';

const CreepManager = require('../managers/CreepManager');
const RoomManager = require('../managers/RoomManager');
const MemoryManager = require('../managers/MemoryManager');

/**
 * MOKITO PHASE MANAGEMENT SYSTEM v5
 *
 * NEW PHASE STRUCTURE (as of 2026-04-18):
 *
 * Phase 1: HARVESTERS
 *   - Spawn harvesters based on: open_spaces / 2 (rounded down)
 *   - Harvesters deliver energy to spawn/extensions
 *
 * Phase 2: UPGRADERS
 *   - Spawn 3 upgraders
 *   - Focus on controller progress
 *
 * Phase 3: BUILDERS + EXTENSIONS
 *   - Spawn 3 builders
 *   - Build extensions to increase energy capacity
 *
 * Phase 4: RUNNERS + REPAIRERS + STATIONARY HARVESTING
 *   - Spawn 3 runners
 *   - Spawn 2 repairers
 *   - First runner triggers stationary harvesting mode
 *
 * Phase 5: ROAD NETWORK
 *   - Build roads throughout the room
 *
 * Phase 6: RAMPARTS (Room Defense)
 *   - Build ramparts 2+ spaces from room exits
 *   - Create continuous wall with no openings
 *
 * Phase 7+: COMING SOON
 *   - Not yet implemented
 */
class Mokito {
    constructor() {
        this.creepManager = new CreepManager();
        this.roomManager = new RoomManager();
        this.memoryManager = new MemoryManager();
    }

    run() {
        this.memoryManager.cleanup();
        this.roomManager.run();
        this.creepManager.run();

        // Heartbeat every 60 ticks
        if (Game.time % 60 === 0) {
            // Find the home room (owned room with controller and spawn)
            let homeRoom = null;
            for (const roomName in Game.rooms) {
                const room = Game.rooms[roomName];
                if (room && room.controller && room.controller.my) {
                    const spawns = room.find(FIND_MY_SPAWNS);
                    if (spawns.length > 0) {
                        homeRoom = room;
                        break;
                    }
                }
            }

            // Fallback: use any owned room
            if (!homeRoom) {
                for (const roomName in Game.rooms) {
                    const room = Game.rooms[roomName];
                    if (room && room.controller && room.controller.my) {
                        homeRoom = room;
                        break;
                    }
                }
            }

            if (homeRoom) {
                const metrics = this.gatherRoomMetrics(homeRoom);
                const phase = this.getCurrentPhase(homeRoom, metrics);
                this.logHeartbeat(homeRoom, metrics, phase);
            }
        }
    }

    /**
     * Calculate total open positions around all sources
     */
    calculateSourcePositions(room) {
        const sources = room.find(FIND_SOURCES);
        let total = 0;
        for (const source of sources) {
            const terrain = room.getTerrain();
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    const x = source.pos.x + dx;
                    const y = source.pos.y + dy;
                    if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
                        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                            total++;
                        }
                    }
                }
            }
        }
        return total;
    }

    /**
     * Gather all room metrics for phase determination
     */
    gatherRoomMetrics(room) {
        const creeps = room.find(FIND_MY_CREEPS);
        const structures = room.find(FIND_MY_STRUCTURES);
        const allStructures = room.find(FIND_STRUCTURES);
        const constructionSites = room.find(FIND_CONSTRUCTION_SITES);

        // Creep counts
        const metrics = {
            harvesters: creeps.filter(c => c.memory.role === 'harvester').length,
            runners: creeps.filter(c => c.memory.role === 'runner').length,
            upgraders: creeps.filter(c => c.memory.role === 'upgrader').length,
            builders: creeps.filter(c => c.memory.role === 'builder').length,
            repairers: creeps.filter(c => c.memory.role === 'repairer').length,
            totalCreeps: creeps.length,

            // Buildings
            extensions: structures.filter(s => s.structureType === STRUCTURE_EXTENSION).length,
            maxExtensions: CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0,
            roads: allStructures.filter(s => s.structureType === STRUCTURE_ROAD).length,
            ramparts: structures.filter(s => s.structureType === STRUCTURE_RAMPART).length,
            towers: structures.filter(s => s.structureType === STRUCTURE_TOWER).length,
            maxTowers: CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0,
            storage: structures.find(s => s.structureType === STRUCTURE_STORAGE),
            spawn: structures.find(s => s.structureType === STRUCTURE_SPAWN),

            // Construction
            constructionSites: constructionSites.length,

            // Resources
            droppedEnergy: room.find(FIND_DROPPED_RESOURCES, {
                filter: r => r.resourceType === RESOURCE_ENERGY
            }).reduce((sum, r) => sum + r.amount, 0),

            // Room state
            rcl: room.controller.level,
            gcl: Game.gcl.level,
            totalSourcePositions: this.calculateSourcePositions(room),
            inStationaryMode: Memory.rooms[room.name]?.harvesterMode === 'stationary'
        };

        return metrics;
    }

    /**
     * Initialize phase tracking memory
     */
    initPhaseMemory(roomName) {
        if (!Memory.mokito) {
            Memory.mokito = {};
        }
        if (!Memory.mokito.phaseTracking) {
            Memory.mokito.phaseTracking = {};
        }
        if (!Memory.mokito.phaseTracking[roomName]) {
            Memory.mokito.phaseTracking[roomName] = {
                currentPhase: 1,
                phaseDropTimer: 0,
                lastPhaseCheck: Game.time
            };
        }
        return Memory.mokito.phaseTracking[roomName];
    }

    /**
     * Check if metrics meet phase criteria
     */
    checkPhaseCriteria(phase, metrics) {
        // Calculate required harvesters: open spaces / 2, rounded down
        const requiredHarvesters = Math.floor(metrics.totalSourcePositions / 2);

        switch (phase) {
            case 1: // Phase 1: Harvesters
                return metrics.harvesters >= requiredHarvesters;

            case 2: // Phase 2: Upgraders
                return metrics.harvesters >= requiredHarvesters &&
                       metrics.upgraders >= 3;

            case 3: // Phase 3: Builders + Extensions
                return metrics.harvesters >= requiredHarvesters &&
                       metrics.upgraders >= 3 &&
                       metrics.builders >= 3;

            case 4: // Phase 4: Runners + Repairers (Stationary)
                return metrics.harvesters >= requiredHarvesters &&
                       metrics.upgraders >= 3 &&
                       metrics.builders >= 3 &&
                       metrics.runners >= 3 &&
                       metrics.repairers >= 2;

            case 5: // Phase 5: Road Network
                if (!this.checkPhaseCriteria(4, metrics)) return false;
                return metrics.roads >= 10;

            case 6: // Phase 6: Ramparts
                if (!this.checkPhaseCriteria(5, metrics)) return false;
                return metrics.ramparts >= 3 && metrics.rcl >= 4;

            case 7: // Phase 7+: COMING SOON
            case 8:
            case 9:
                // Not implemented yet
                return false;

            default:
                return false;
        }
    }

    /**
     * Determine current phase
     */
    getCurrentPhase(room, metrics) {
        const phaseMem = this.initPhaseMemory(room.name);

        // Check each phase from highest to lowest
        for (let p = 6; p >= 1; p--) {
            if (this.checkPhaseCriteria(p, metrics)) {
                phaseMem.currentPhase = p;
                return {
                    current: p,
                    name: this.getPhaseName(p),
                    metrics: metrics
                };
            }
        }

        // Default to Phase 1 if none met
        phaseMem.currentPhase = 1;
        return {
            current: 1,
            name: this.getPhaseName(1),
            metrics: metrics
        };
    }

    /**
     * Get phase display name
     */
    getPhaseName(phase) {
        const names = {
            1: 'Harvesters - Open Spaces / 2',
            2: 'Upgraders - 3 Required',
            3: 'Builders + Extensions',
            4: 'Runners + Repairers + Stationary',
            5: 'Road Network',
            6: 'Ramparts - Room Defense',
            7: 'COMING SOON',
            8: 'COMING SOON',
            9: 'COMING SOON'
        };
        return names[phase] || 'Unknown Phase';
    }

    /**
     * Get next phase requirements
     */
    getNextPhaseRequirements(currentPhase, metrics) {
        const requiredHarvesters = Math.floor(metrics.totalSourcePositions / 2);

        switch (currentPhase) {
            case 1:
                return [`${requiredHarvesters}+ harvesters (open spaces / 2)`];
            case 2:
                return ['3+ upgraders'];
            case 3:
                return ['3+ builders'];
            case 4:
                return ['3+ runners', '2+ repairers'];
            case 5:
                return ['10+ roads'];
            case 6:
                return ['Ramparts at exits'];
            default:
                return ['Phase not yet implemented'];
        }
    }

    /**
     * Log heartbeat with phase info
     */
    logHeartbeat(room, metrics, phase) {
        const nextSpawns = room.memory.spawnPriority || [];
        let upNext = 'None';
        if (nextSpawns.length > 0) {
            upNext = nextSpawns[0].emoji + ' ' + nextSpawns[0].role;
            if (nextSpawns.length > 1) {
                upNext += ' → ' + nextSpawns[1].emoji + ' ' + nextSpawns[1].role;
            }
        }

        const nextRequirements = this.getNextPhaseRequirements(phase.current, metrics);

        let status = '\n💓 ========== MOKITO HEARTBEAT ==========\n';
        status += `📍 Phase ${phase.current}: ${phase.name}\n`;

        // Progress to next phase
        if (phase.current < 6) {
            status += `   Next: ${nextRequirements.join(', ')}\n`;
        }

        status += '\n';
        status += `Creeps: H:${metrics.harvesters} R:${metrics.runners} U:${metrics.upgraders} B:${metrics.builders} Rp:${metrics.repairers}\n`;
        status += `RCL: ${metrics.rcl} | GCL: ${metrics.gcl}\n`;
        status += `Buildings: Ex:${metrics.extensions}/${metrics.maxExtensions} Rd:${metrics.roads} Ra:${metrics.ramparts}\n`;
        status += `Open Spaces: ${metrics.totalSourcePositions} | Dropped: ${metrics.droppedEnergy}\n`;

        if (room.memory.waitingForEnergy) {
            status += `⏳ Waiting for energy: ${room.energyAvailable}/${room.energyCapacityAvailable}\n`;
        }

        status += `Next Spawn: ${upNext}\n`;
        status += '======================================\n';

        console.log(status);
    }
}

module.exports = Mokito;
