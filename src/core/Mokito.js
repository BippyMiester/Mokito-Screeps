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
        
        // Phase 0: Emergency (less than 2 harvesters)
        if (harvesters < 2) {
            return { current: 0, name: 'Emergency - Survive', next: 1 };
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
        
        // Phase 4: Efficiency (stationary harvesting, containers)
        const roomMem = Memory.rooms[room.name] || {};
        if (roomMem.harvesterMode !== 'stationary') {
            return { current: 4, name: 'Efficiency - Stationary Harvest', next: 5 };
        }
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
        
        // Phase 9: Links
        const links = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_LINK
        }).length;
        if (links < 2 && rcl >= 5) {
            return { current: 9, name: 'Links - Build Link Network', next: 10 };
        }
        
        // Phase 10: Remote Mining
        const remoteHarvesters = room.find(FIND_MY_CREEPS, {
            filter: c => c.memory.role === 'remoteharvester'
        }).length;
        if (remoteHarvesters < 2 && rcl >= 4) {
            return { current: 10, name: 'Expansion - Remote Mining', next: 11 };
        }
        
        // Phase 11: Claiming
        const claimers = room.find(FIND_MY_CREEPS, {
            filter: c => c.memory.role === 'claimer'
        }).length;
        const flags = Object.keys(Game.flags).length;
        if (claimers < 1 && rcl >= 4 && flags < 1) {
            return { current: 11, name: 'Expansion - Claim New Room', next: 12 };
        }
        
        // Phase 12: Labs
        const labs = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_LAB
        }).length;
        if (labs < 3 && rcl >= 6) {
            return { current: 12, name: 'Industry - Build Labs', next: 13 };
        }
        
        // Phase 13: Minerals
        const minerals = room.find(FIND_MINERALS).length;
        const extractors = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTRACTOR
        }).length;
        if (extractors < minerals && rcl >= 6) {
            return { current: 13, name: 'Industry - Mineral Extraction', next: 14 };
        }
        
        // Phase 14: Terminal
        const terminal = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TERMINAL
        })[0];
        if (!terminal && rcl >= 6) {
            return { current: 14, name: 'Industry - Build Terminal', next: 15 };
        }
        
        // Phase 15: Factory
        const factory = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_FACTORY
        })[0];
        if (!factory && rcl >= 7) {
            return { current: 15, name: 'Industry - Build Factory', next: 16 };
        }
        
        // Phase 16: Observer
        const observer = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_OBSERVER
        })[0];
        if (!observer && rcl >= 8) {
            return { current: 16, name: 'Intel - Build Observer', next: 17 };
        }
        
        // Phase 17: Power
        const nuker = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_NUKER
        })[0];
        if (!nuker && rcl >= 8) {
            return { current: 17, name: 'Power - Build Nuker', next: 18 };
        }
        
        // Phase 18: Multi-room empire
        const rooms = Object.keys(Game.rooms).filter(rn => 
            Game.rooms[rn].controller && Game.rooms[rn].controller.my
        ).length;
        if (rooms < 2) {
            return { current: 18, name: 'Empire - Expand to 2 Rooms', next: 19 };
        }
        
        // Phase 19: Maximize GCL
        if (Game.gcl.level < 2) {
            return { current: 19, name: 'Growth - Maximize GCL', next: 20 };
        }
        
        // Phase 20: Endgame
        return { current: 20, name: 'Endgame - Maintain Empire', next: 20 };
    }
}

module.exports = Mokito;
