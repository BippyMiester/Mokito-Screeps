'use strict';

const CreepManager = require('../managers/CreepManager');
const RoomManager = require('../managers/RoomManager');
const MemoryManager = require('../managers/MemoryManager');

class Mokito {
    constructor() {
        this.creepManager = new CreepManager();
        this.roomManager = new RoomManager();
        this.memoryManager = new MemoryManager();
        
        this.initialized = false;
    }
    
    run() {
        // Clean up memory
        this.memoryManager.cleanup();
        
        // Run rooms - focus on GCL gain and base building
        this.roomManager.run();
        
        // Run creeps
        this.creepManager.run();
        
        // Heartbeat every 60 ticks (15 seconds at 250ms tick rate)
        if (Game.time % 60 === 0) {
            const room = Game.rooms[Object.keys(Game.rooms)[0]];
            if (room && room.controller) {
                const creeps = room.find(FIND_MY_CREEPS);
                const harvesters = creeps.filter(c => c.memory.role === 'harvester').length;
                const upgraders = creeps.filter(c => c.memory.role === 'upgrader').length;
                const builders = creeps.filter(c => c.memory.role === 'builder').length;
                const repairers = creeps.filter(c => c.memory.role === 'repairer').length;
                const runners = creeps.filter(c => c.memory.role === 'runner').length;
                const remoteHarvesters = creeps.filter(c => c.memory.role === 'remoteharvester').length;
                const haulers = creeps.filter(c => c.memory.role === 'hauler').length;
                const claimers = creeps.filter(c => c.memory.role === 'claimer').length;
                const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
                    filter: r => r.resourceType === RESOURCE_ENERGY
                }).reduce((sum, r) => sum + r.amount, 0);
                
                // Get spawn priority info from room memory
                let upNext = 'None';
                const nextSpawns = room.memory.spawnPriority || [];
                if (nextSpawns.length > 0) {
                    upNext = nextSpawns[0].emoji + ' ' + nextSpawns[0].role;
                    if (nextSpawns.length > 1) {
                        upNext += ' → ' + nextSpawns[1].emoji + ' ' + nextSpawns[1].role;
                    }
                }
                
                // Determine current phase
                const phase = this.getCurrentPhase(room, harvesters, runners);
                
                // Build multi-line status message
                let status = '\n💓 ========== MOKITO HEARTBEAT ==========\n';
                status += '📍 Phase ' + phase.current + ': ' + phase.name + ' | Next: Phase ' + phase.next + '\n';
                status += 'Creeps: H:' + harvesters + ' R:' + runners + ' U:' + upgraders + ' B:' + builders + ' Rp:' + repairers;
                if (remoteHarvesters > 0 || haulers > 0 || claimers > 0) {
                    status += ' | RH:' + remoteHarvesters + ' Ha:' + haulers + ' C:' + claimers;
                }
                status += '\n';
                status += 'GCL:' + Game.gcl.level + ' | RCL:' + room.controller.level + '\n';
                status += 'Dropped Energy: ' + droppedEnergy + '\n';
                
                // Check if waiting for energy
                if (room.memory.waitingForEnergy) {
                    const energyAvailable = room.energyAvailable;
                    const energyCapacity = room.energyCapacityAvailable;
                    status += '⏳ Waiting for full energy: ' + energyAvailable + '/' + energyCapacity + '\n';
                }
                
                status += 'Next Spawn: ' + upNext + '\n';
                status += '======================================\n';
                
                console.log(status);
            }
        }
    }

    /**
     * Determine current game phase based on room state
     */
    getCurrentPhase(room, harvesters, runners) {
        const rcl = room.controller.level;
        const sources = room.find(FIND_SOURCES);
        const sourcePositions = sources.length * 8; // Approximate
        const extensions = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION
        }).length;
        const roomMem = Memory.rooms[room.name] || {};
        
        // Phase 0: Emergency (less than 2 harvesters)
        if (harvesters < 2) {
            return { current: 0, name: 'Emergency - Survive', next: 1 };
        }
        
        // Check if we've already achieved stationary mode (persist even if harvesters die)
        // Once we've reached Phase 4+, we don't drop back to Phase 3 just because harvesters died
        const inStationaryMode = roomMem.harvesterMode === 'stationary';
        
        // CRITICAL: Even in stationary mode, if we have no runners, we must build them
        // Otherwise harvesters drop energy at sources but spawn can't get it
        if (inStationaryMode && runners < 1) {
            return { current: 1, name: 'Foundation - EMERGENCY: Need Runners!', next: 2 };
        }
        
        // Phase 4+: If we're in stationary mode with runners, continue with Phase 4+ logic
        if (inStationaryMode) {
            // Phase 4: Efficiency (stationary harvesting, containers)
            const containers = room.find(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            }).length;
            if (containers < sources.length) {
                return { current: 4, name: 'Efficiency - Build Containers', next: 5 };
            }
            
            // Phase 5: Infrastructure (roads)
            const roads = room.find(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_ROAD
            }).length;
            if (roads < 10 && rcl >= 3) {
                return { current: 5, name: 'Infrastructure - Road Network', next: 6 };
            }
            
            // Phase 6: Defense (ramparts, walls)
            if (rcl >= 3) {
                const ramparts = room.find(FIND_MY_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_RAMPART
                }).length;
                if (ramparts < 1) {
                    return { current: 6, name: 'Defense - Build Ramparts', next: 7 };
                }
            }
            
            // Phase 7: Towers
            const towers = room.find(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_TOWER
            }).length;
            const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][rcl] || 0;
            if (towers < maxTowers && rcl >= 3) {
                return { current: 7, name: 'Defense - Build Towers', next: 8 };
            }
            
            // Phase 8: Storage
            const storage = room.find(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_STORAGE
            })[0];
            if (!storage && rcl >= 4) {
                return { current: 8, name: 'Storage - Build Storage', next: 9 };
            }
            
            // If all Phase 4-8 objectives complete, show we're in stationary mode
            return { current: 4, name: 'Efficiency - Stationary Mode Active', next: 5 };
        }
        
        // Phase 1: Foundation (need runners)
        if (runners < Math.ceil(harvesters / 2)) {
            return { current: 1, name: 'Foundation - Build Runners', next: 2 };
        }
        
        // Phase 2: Stabilization (need upgraders)
        const upgraders = room.find(FIND_MY_CREEPS, {
            filter: c => c.memory.role === 'upgrader'
        }).length;
        if (upgraders < 1) {
            return { current: 2, name: 'Stabilization - First Upgrader', next: 3 };
        }
        
        // Phase 3: Capacity (fill harvesters, get builders)
        if (harvesters < sourcePositions) {
            return { current: 3, name: 'Capacity - Fill Sources', next: 4 };
        }
        const builders = room.find(FIND_MY_CREEPS, {
            filter: c => c.memory.role === 'builder'
        }).length;
        if (builders < 1 && rcl >= 2) {
            return { current: 3, name: 'Capacity - Start Building', next: 4 };
        }
        
        // Phase 4: Efficiency (stationary harvesting, containers) - initial transition
        return { current: 4, name: 'Efficiency - Stationary Harvest', next: 5 };
    }
}

module.exports = Mokito;
