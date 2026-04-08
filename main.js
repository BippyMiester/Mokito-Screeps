'use strict';

// ============================================
// Mokito Bot - Combined Build
// Built: 2026-04-08T10:03:21.606Z
// ============================================


// --- Harvester.js ---
/**
 * Harvester - Two-phase strategy
 * Phase 1: Deliver energy to spawn (until enough harvesters exist)
 * Phase 2: Stationary harvesting (drop energy on ground)
 */
class Harvester {
    run(creep) {
        // Check if we should use stationary strategy
        const shouldUseStationary = this.checkStationaryStrategy(creep.room);
        
        if (shouldUseStationary) {
            // Stationary mode: go to source position and drop energy
            this.runStationary(creep);
        } else {
            // Traditional mode: harvest and deliver to spawn
            this.runTraditional(creep);
        }
    }
    
    /**
     * Check if we have enough harvesters to switch to stationary strategy
     * Returns true if all open positions around sources are covered
     */
    checkStationaryStrategy(room) {
        const sources = room.find(FIND_SOURCES);
        
        // Count total open positions around all sources
        let totalPositions = 0;
        for (const source of sources) {
            totalPositions += this.countOpenPositions(source);
        }
        
        // Count current harvesters
        const harvesters = room.find(FIND_MY_CREEPS, {
            filter: c => c.memory.role === 'harvester'
        });
        
        // Switch to stationary when we have harvesters >= positions
        // (or close to it, allow some buffer)
        return harvesters.length >= totalPositions;
    }
    
    /**
     * Count open positions around a source
     */
    countOpenPositions(source) {
        const room = source.room;
        const terrain = room.getTerrain();
        let count = 0;
        
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                
                const x = source.pos.x + dx;
                const y = source.pos.y + dy;
                
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    count++;
                }
            }
        }
        
        return count;
    }
    
    /**
     * Traditional harvester: Harvest energy and deliver to spawn
     */
    runTraditional(creep) {
        // State: harvesting or delivering
        if (creep.memory.delivering && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.delivering = false;
            creep.say('⛏️ harvest');
        }
        if (!creep.memory.delivering && creep.store.getFreeCapacity() === 0) {
            creep.memory.delivering = true;
            creep.say('📦 deliver');
        }
        
        if (creep.memory.delivering) {
            // Deliver to spawn
            const target = this.findDeliveryTarget(creep);
            if (target) {
                const result = creep.transfer(target, RESOURCE_ENERGY);
                if (result === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target);
                } else if (result === ERR_FULL) {
                    // Target is full, try to find another target
                    creep.say('🚫 full');
                    // Clear any cached target so we find a new one next tick
                } else if (result === OK) {
                    // Transfer successful
                    if (creep.store[RESOURCE_ENERGY] === 0) {
                        creep.memory.delivering = false;
                        creep.say('⛏️ harvest');
                    }
                }
            } else {
                // No target available - spawn/extensions are full
                // Wait near spawn or drop energy on ground
                const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
                if (spawn) {
                    if (!creep.pos.inRangeTo(spawn, 3)) {
                        creep.moveTo(spawn, { range: 3 });
                    } else {
                        // Near spawn but it's full - drop energy so we can keep harvesting
                        creep.drop(RESOURCE_ENERGY);
                        creep.say('💧 drop');
                        creep.memory.delivering = false;
                    }
                }
            }
        } else {
            // Harvest from assigned source
            const source = Game.getObjectById(creep.memory.sourceId);
            if (source) {
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source);
                }
            } else {
                // No source assigned, find one
                const sources = creep.room.find(FIND_SOURCES);
                if (sources.length > 0) {
                    creep.memory.sourceId = sources[0].id;
                }
            }
        }
    }
    
    /**
     * Stationary harvester: Go to position, harvest, and drop
     */
    runStationary(creep) {
        // If we don't have a position assigned yet, find one
        if (!creep.memory.harvestPos) {
            this.findPosition(creep);
        }
        
        // If we have a position, check if we're there
        if (creep.memory.harvestPos) {
            const targetPos = new RoomPosition(
                creep.memory.harvestPos.x,
                creep.memory.harvestPos.y,
                creep.memory.harvestPos.roomName
            );
            
            // If not at position, move there
            if (!creep.pos.isEqualTo(targetPos)) {
                creep.moveTo(targetPos, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
                return;
            }
            
            // We're at our position - harvest and drop
            this.harvestAndDrop(creep);
        }
    }
    
    findPosition(creep) {
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) return;
        
        const positions = this.getOpenPositions(source);
        
        for (const pos of positions) {
            let occupied = false;
            for (const name in Game.creeps) {
                const otherCreep = Game.creeps[name];
                if (otherCreep.id !== creep.id &&
                    otherCreep.memory.role === 'harvester' &&
                    otherCreep.memory.harvestPos &&
                    otherCreep.memory.harvestPos.x === pos.x &&
                    otherCreep.memory.harvestPos.y === pos.y) {
                    occupied = true;
                    break;
                }
            }
            
            if (!occupied) {
                creep.memory.harvestPos = {
                    x: pos.x,
                    y: pos.y,
                    roomName: pos.roomName
                };
                creep.say('⛏️ ' + pos.x + ',' + pos.y);
                return;
            }
        }
    }
    
    getOpenPositions(source) {
        const positions = [];
        const room = source.room;
        const terrain = room.getTerrain();
        
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                
                const x = source.pos.x + dx;
                const y = source.pos.y + dy;
                
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    positions.push(new RoomPosition(x, y, room.name));
                }
            }
        }
        
        return positions;
    }
    
    harvestAndDrop(creep) {
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) return;
        
        const result = creep.harvest(source);
        
        if (result === OK) {
            if (creep.store.getFreeCapacity() === 0) {
                creep.drop(RESOURCE_ENERGY);
                creep.say('💧 drop');
            }
        } else if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(source);
        } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
            creep.say('⏳ wait');
        }
    }
    
    findDeliveryTarget(creep) {
        // Priority: Spawn > Extension > Tower
        const spawn = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_SPAWN && 
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (spawn) return spawn;
        
        const extension = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION && 
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (extension) return extension;
        
        const tower = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER && 
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (tower) return tower;
        
        // Fallback: just go to spawn even if full
        return creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_SPAWN
        });
    }
}

// --- Upgrader.js ---
/**
 * Upgrader - Upgrades room controller
 * Priority: Dropped energy > Containers/Storage > Self-mining
 * NEVER takes from spawn - keeps spawn energy for creep spawning
 */
class Upgrader {
    run(creep) {
        // State management
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.upgrading = false;
            creep.say('🔍 collect');
        }
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() === 0) {
            creep.memory.upgrading = true;
            creep.say('⚡ upgrade');
        }

        if (creep.memory.upgrading) {
            // Upgrade controller
            this.upgradeController(creep);
        } else {
            // Collect dropped energy from ground
            this.collectEnergy(creep);
        }
    }

    collectEnergy(creep) {
        // Priority 1: Dropped energy (from stationary harvesters)
        const droppedEnergy = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount >= 20
        });

        if (droppedEnergy) {
            if (creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
                creep.moveTo(droppedEnergy, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            }
            return;
        }

        // Priority 2: Containers/Storage
        const storage = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: (s) => (s.structureType === STRUCTURE_CONTAINER ||
                           s.structureType === STRUCTURE_STORAGE) &&
                           s.store[RESOURCE_ENERGY] > 0
        });

        if (storage) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage);
            }
            return;
        }

        // Priority 3: Mine energy yourself (if stationary harvesters not available)
        // Upgraders should NOT take from spawn - only from ground or containers
        const source = creep.pos.findClosestByPath(FIND_SOURCES);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            }
            creep.say('⛏️ mine');
            return;
        }

        // If no sources available, wait
        creep.say('⏳ waiting');
    }

    upgradeController(creep) {
        const controller = creep.room.controller;
        if (!controller) return;

        const result = creep.upgradeController(controller);

        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller, {
                visualizePathStyle: { stroke: '#ffffff' }
            });
        } else if (result === OK) {
            // Successfully upgrading
            if (Game.time % 10 === 0) {
                creep.say('⚡ ' + creep.store[RESOURCE_ENERGY]);
            }
        }
    }
}

// --- Builder.js ---
/**
 * Builder - Builds construction sites
 * Priority: Dropped energy > Containers/Storage > Self-mining
 * NEVER takes from spawn - keeps spawn energy for creep spawning
 */
class Builder {
    run(creep) {
        // State management
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.building = false;
            creep.say('🔍 collect');
        }
        if (!creep.memory.building && creep.store.getFreeCapacity() === 0) {
            creep.memory.building = true;
            creep.say('🔨 build');
        }

        if (creep.memory.building) {
            // Build construction sites
            this.build(creep);
        } else {
            // Collect dropped energy from ground
            this.collectEnergy(creep);
        }
    }

    collectEnergy(creep) {
        // Priority 1: Dropped energy (from stationary harvesters)
        const droppedEnergy = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount >= 20
        });

        if (droppedEnergy) {
            if (creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
                creep.moveTo(droppedEnergy, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            }
            return;
        }

        // Priority 2: Containers/Storage
        const storage = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: (s) => (s.structureType === STRUCTURE_CONTAINER ||
                           s.structureType === STRUCTURE_STORAGE) &&
                           s.store[RESOURCE_ENERGY] > 0
        });

        if (storage) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage);
            }
            return;
        }

        // Priority 3: Mine energy yourself (if stationary harvesters not available)
        // Builders should NOT take from spawn - only from ground or containers
        const source = creep.pos.findClosestByPath(FIND_SOURCES);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            }
            creep.say('⛏️ mine');
            return;
        }

        // If no sources available, wait
        creep.say('⏳ waiting');
    }

    build(creep) {
        // Find construction sites
        const target = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);

        if (target) {
            const result = creep.build(target);

            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: '#ffffff' }
                });
            } else if (result === OK) {
                if (Game.time % 10 === 0) {
                    creep.say('🔨 ' + creep.store[RESOURCE_ENERGY]);
                }
            }
        } else {
            // No construction sites - repair roads or walls
            this.repair(creep);
        }
    }

    repair(creep) {
        const target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: (s) => (s.structureType === STRUCTURE_ROAD ||
                          s.structureType === STRUCTURE_CONTAINER) &&
                          s.hits < s.hitsMax
        });

        if (target) {
            if (creep.repair(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target);
            }
        } else {
            // Nothing to repair - idle
            creep.say('⏳ idle');
        }
    }
}

// --- Repairer.js ---
/**
 * Repairer - Repairs structures (roads, containers, ramparts, walls)
 * Priority: Dropped energy > Containers/Storage > Self-mining
 * NEVER takes from spawn - keeps spawn energy for creep spawning
 */
class Repairer {
    run(creep) {
        // State: repairing or collecting
        if (creep.memory.repairing && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.repairing = false;
            creep.say('🔍 collect');
        }
        if (!creep.memory.repairing && creep.store.getFreeCapacity() === 0) {
            creep.memory.repairing = true;
            creep.say('🔧 repair');
        }

        if (creep.memory.repairing) {
            this.repair(creep);
        } else {
            this.collectEnergy(creep);
        }
    }

    collectEnergy(creep) {
        // Priority 1: Dropped energy
        const droppedEnergy = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: r => r.resourceType === RESOURCE_ENERGY && r.amount >= 20
        });

        if (droppedEnergy) {
            if (creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
                creep.moveTo(droppedEnergy);
            }
            return;
        }

        // Priority 2: Containers/Storage
        const storage = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_CONTAINER ||
                         s.structureType === STRUCTURE_STORAGE) &&
                         s.store[RESOURCE_ENERGY] > 0
        });

        if (storage) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage);
            }
            return;
        }

        // Priority 3: Mine energy yourself (if stationary harvesters not available)
        // Repairers should NOT take from spawn - only from ground or containers
        const source = creep.pos.findClosestByPath(FIND_SOURCES);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source);
            }
            creep.say('⛏️ mine');
            return;
        }

        creep.say('⏳ waiting');
    }

    repair(creep) {
        // Priority 1: Containers (critical for energy flow)
        const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER &&
                        s.hits < s.hitsMax * 0.8
        });

        if (container) {
            if (creep.repair(container) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container);
            }
            return;
        }

        // Priority 2: Roads
        const road = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_ROAD &&
                        s.hits < s.hitsMax * 0.5
        });

        if (road) {
            if (creep.repair(road) === ERR_NOT_IN_RANGE) {
                creep.moveTo(road);
            }
            return;
        }

        // Priority 3: Ramparts (maintain at safe level)
        const rampart = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_RAMPART &&
                        s.hits < 1000000 // 1M hits minimum
        });

        if (rampart) {
            if (creep.repair(rampart) === ERR_NOT_IN_RANGE) {
                creep.moveTo(rampart);
            }
            return;
        }

        // Priority 4: Walls
        const wall = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_WALL &&
                        s.hits < 1000000
        });

        if (wall) {
            if (creep.repair(wall) === ERR_NOT_IN_RANGE) {
                creep.moveTo(wall);
            }
            return;
        }

        // Nothing to repair - help with building
        creep.say('⏳ idle');
    }
}

// --- SourceManager.js ---
/**
 * SourceManager - Manages stationary harvesting
 * Each source gets dedicated harvesters for each open position around it
 */
class SourceManager {
    constructor() {
        this.cache = {};
    }

    /**
     * Get all open positions around a source where a creep can stand and harvest
     */
    getHarvestPositions(source) {
        const cacheKey = source.id + '_positions';
        if (this.cache[cacheKey]) {
            return this.cache[cacheKey];
        }

        const positions = [];
        const room = source.room;
        const terrain = room.getTerrain();

        // Check all 8 adjacent positions
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;

                const x = source.pos.x + dx;
                const y = source.pos.y + dy;

                // Check bounds
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;

                // Check if position is walkable (not a wall)
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    positions.push(new RoomPosition(x, y, room.name));
                }
            }
        }

        this.cache[cacheKey] = positions;
        return positions;
    }

    /**
     * Count how many harvesters are assigned to a source
     */
    countHarvestersForSource(source) {
        const positions = this.getHarvestPositions(source);
        let count = 0;

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'harvester' && 
                creep.memory.sourceId === source.id) {
                count++;
            }
        }

        return count;
    }

    /**
     * Get available harvest positions for a source (not occupied by other harvesters)
     */
    getAvailablePositions(source) {
        const allPositions = this.getHarvestPositions(source);
        const occupied = new Set();

        // Mark positions occupied by stationary harvesters
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'harvester' && 
                creep.memory.sourceId === source.id &&
                creep.memory.harvestPos) {
                occupied.add(creep.memory.harvestPos.x + ',' + creep.memory.harvestPos.y);
            }
        }

        return allPositions.filter(pos => !occupied.has(pos.x + ',' + pos.y));
    }

    /**
     * Calculate how many WORK parts are needed to fully harvest a source
     */
    getNeededWorkParts(source) {
        // Each WORK part harvests 2 energy per tick
        // Sources regenerate 3000 energy every 300 ticks = 10 energy/tick average
        // Need 5 WORK parts to harvest 10 energy per tick (fully deplete)
        // But we want some buffer, so aim for 5-6 WORK parts total per source
        return 5;
    }

    /**
     * Get optimal body for a stationary harvester
     */
    getHarvesterBody(energyAvailable) {
        // Stationary harvester: WORK parts to harvest, 1 CARRY to store, no MOVE needed
        // Maximize WORK parts based on available energy
        const workParts = Math.min(Math.floor((energyAvailable - 50) / 100), 5);
        
        const body = [];
        for (let i = 0; i < workParts; i++) {
            body.push(WORK);
        }
        body.push(CARRY);
        
        return body;
    }

    /**
     * Check if we need more harvesters for a room
     */
    checkSpawnNeeds(room) {
        const sources = room.find(FIND_SOURCES);
        const needs = [];

        for (const source of sources) {
            const positions = this.getHarvestPositions(source);
            const currentHarvesters = this.countHarvestersForSource(source);
            const availablePositions = this.getAvailablePositions(source);

            // Spawn harvesters to fill all positions
            if (currentHarvesters < positions.length && availablePositions.length > 0) {
                needs.push({
                    source: source,
                    position: availablePositions[0],
                    priority: 1  // High priority
                });
            }
        }

        return needs;
    }

    /**
     * Find dropped energy near sources for collection
     */
    findDroppedEnergy(room) {
        const sources = room.find(FIND_SOURCES);
        const energyPiles = [];

        for (const source of sources) {
            const positions = this.getHarvestPositions(source);
            for (const pos of positions) {
                const resources = pos.lookFor(LOOK_RESOURCES);
                for (const resource of resources) {
                    if (resource.resourceType === RESOURCE_ENERGY) {
                        energyPiles.push(resource);
                    }
                }
            }
        }

        return energyPiles;
    }

    /**
     * Get total energy dropped near sources
     */
    getDroppedEnergyAmount(room) {
        const piles = this.findDroppedEnergy(room);
        return piles.reduce((sum, pile) => sum + pile.amount, 0);
    }
}

// --- MemoryManager.js ---
class MemoryManager {
    cleanup() {
        // Clean up dead creeps from memory
        for (const name in Memory.creeps) {
            if (!Game.creeps[name]) {
                delete Memory.creeps[name];
            }
        }
        
        // Initialize persistent memory structures
        if (!Memory.mokito) {
            Memory.mokito = {
                version: '1.0.0',
                rooms: {},
                stats: {}
            };
        }
        
        // Cleanup old memory
        for (const roomName in Memory.rooms) {
            if (!Game.rooms[roomName]) {
                // Keep intel but remove runtime data
            }
        }
    }
}

// --- ConstructionManager.js ---
class ConstructionManager {
    run(room) {
        const rcl = room.controller.level;
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        
        if (!spawn) return;
        
        // Get existing construction sites count
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length >= 3) return; // Don't overwhelm with construction
        
        // Build based on RCL
        this.buildEssentials(room, spawn);
        
        if (rcl >= 2) {
            this.buildExtensions(room);
        }
        
        if (rcl >= 3) {
            this.buildTower(room);
        }
        
        if (rcl >= 4) {
            this.buildStorage(room);
        }
    }
    
    buildEssentials(room, spawn) {
        // Build roads to sources
        const sources = room.find(FIND_SOURCES);
        for (const source of sources) {
            this.buildRoad(room, spawn.pos, source.pos);
        }
        
        // Build road to controller
        if (room.controller) {
            this.buildRoad(room, spawn.pos, room.controller.pos);
        }
    }
    
    buildExtensions(room) {
        // Build extensions around spawn
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn) return;
        
        // Get current extension count
        const extensions = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_EXTENSION }
        });
        
        const maxExtensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
        
        if (extensions.length < maxExtensions) {
            // Place extension near spawn
            this.placeStructureNear(room, spawn.pos, STRUCTURE_EXTENSION, 2);
        }
    }
    
    buildTower(room) {
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_TOWER }
        });
        
        const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0;
        
        if (towers.length < maxTowers) {
            const spawn = room.find(FIND_MY_SPAWNS)[0];
            this.placeStructureNear(room, spawn.pos, STRUCTURE_TOWER, 3);
        }
    }
    
    buildStorage(room) {
        const storages = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_STORAGE }
        });
        
        if (storages.length === 0) {
            const spawn = room.find(FIND_MY_SPAWNS)[0];
            this.placeStructureNear(room, spawn.pos, STRUCTURE_STORAGE, 2);
        }
    }
    
    buildRoad(room, fromPos, toPos) {
        const path = fromPos.findPathTo(toPos, {
            ignoreCreeps: true,
            ignoreRoads: true
        });
        
        for (const step of path) {
            const pos = new RoomPosition(step.x, step.y, room.name);
            const structures = pos.lookFor(LOOK_STRUCTURES);
            const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
            
            if (!hasRoad) {
                pos.createConstructionSite(STRUCTURE_ROAD);
            }
        }
    }
    
    placeStructureNear(room, centerPos, structureType, range) {
        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                const x = centerPos.x + dx;
                const y = centerPos.y + dy;
                
                if (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
                    const pos = new RoomPosition(x, y, room.name);
                    const terrain = pos.lookFor(LOOK_TERRAIN);
                    
                    if (terrain.length > 0 && terrain[0] !== 'wall') {
                        const structures = pos.lookFor(LOOK_STRUCTURES);
                        const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                        
                        if (structures.length === 0 && sites.length === 0) {
                            pos.createConstructionSite(structureType);
                            return; // Place one at a time
                        }
                    }
                }
            }
        }
    }
}

// --- SpawnManager.js ---
/**
 * SpawnManager - Manages creep spawning with priority system
 * 
 * Phase 1: Fill all harvester positions (cycle: 2 harvesters, 1 upgrader)
 * Phase 2: Fill all upgrader positions
 * Phase 3: Spawn builders and repairers (1:1 ratio, max 3 each)
 */
class SpawnManager {
    constructor() {
        this.sourceManager = new SourceManager();
    }

    run(room) {
        const spawns = room.find(FIND_MY_SPAWNS);
        const spawn = spawns[0];
        if (!spawn || spawn.spawning) return;

        const energyAvailable = room.energyAvailable;
        const energyCapacity = room.energyCapacityAvailable;

        // Count existing creeps
        const creeps = room.find(FIND_MY_CREEPS);
        const harvesters = creeps.filter(c => c.memory.role === 'harvester');
        const upgraders = creeps.filter(c => c.memory.role === 'upgrader');
        const builders = creeps.filter(c => c.memory.role === 'builder');
        const repairers = creeps.filter(c => c.memory.role === 'repairer');

        // Get total needed harvesters from SourceManager
        const needs = this.sourceManager.checkSpawnNeeds(room);
        const totalNeededHarvesters = needs.length;
        const desiredUpgraders = Math.ceil(totalNeededHarvesters / 2);

        // PHASE 1: Fill all harvester positions around sources
        if (harvesters.length < totalNeededHarvesters) {
            const cyclePosition = (harvesters.length + upgraders.length) % 3;
            
            if (cyclePosition === 0 || cyclePosition === 1) {
                // Spawn harvester
                const body = this.getHarvesterBody(energyCapacity);
                if (energyAvailable >= this.calculateBodyCost(body)) {
                    this.spawnHarvester(spawn, needs[0].source);
                }
            } else {
                // Spawn upgrader
                if (upgraders.length < desiredUpgraders) {
                    const body = this.getUpgraderBody(energyCapacity);
                    if (energyAvailable >= this.calculateBodyCost(body)) {
                        this.spawnUpgrader(spawn);
                    }
                }
            }
            return;
        }

        // PHASE 2: Fill all upgrader positions
        if (upgraders.length < desiredUpgraders) {
            const body = this.getUpgraderBody(energyCapacity);
            if (energyAvailable >= this.calculateBodyCost(body)) {
                this.spawnUpgrader(spawn);
            }
            return;
        }

        // PHASE 3: Spawn builders and repairers (1:1 ratio, max 3 each)
        // Only after ALL harvesters AND ALL upgraders are complete
        
        const maxBuilders = 3;
        const maxRepairers = 3;
        
        // Determine which to spawn based on 1:1 ratio
        // If builders == repairers, spawn builder first
        // If builders > repairers, spawn repairer
        const shouldSpawnBuilder = builders.length <= repairers.length;
        
        if (shouldSpawnBuilder && builders.length < maxBuilders) {
            // Check if there are construction sites
            const sites = room.find(FIND_CONSTRUCTION_SITES);
            if (sites.length > 0) {
                const body = this.getBuilderBody(energyCapacity);
                if (energyAvailable >= this.calculateBodyCost(body)) {
                    this.spawnBuilder(spawn);
                }
            }
            return;
        }
        
        if (!shouldSpawnBuilder && repairers.length < maxRepairers) {
            // Check if there are structures to repair
            const needsRepair = this.needsRepair(room);
            if (needsRepair) {
                const body = this.getRepairerBody(energyCapacity);
                if (energyAvailable >= this.calculateBodyCost(body)) {
                    this.spawnRepairer(spawn);
                }
            }
        }
    }

    needsRepair(room) {
        // Check if anything needs repair
        const damaged = room.find(FIND_STRUCTURES, {
            filter: s => {
                if (s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.5) return true;
                if (s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.8) return true;
                if (s.structureType === STRUCTURE_RAMPART && s.hits < 1000000) return true;
                if (s.structureType === STRUCTURE_WALL && s.hits < 1000000) return true;
                return false;
            }
        });
        return damaged.length > 0;
    }

    calculateBodyCost(body) {
        const costs = {
            [MOVE]: 50,
            [WORK]: 100,
            [CARRY]: 50
        };
        return body.reduce((sum, part) => sum + (costs[part] || 0), 0);
    }

    getHarvesterBody(energyCapacity) {
        const body = [];
        let remaining = energyCapacity - 100;
        const maxWork = Math.min(Math.floor(remaining / 100), 5);
        
        for (let i = 0; i < maxWork; i++) {
            body.push(WORK);
        }
        body.push(CARRY);
        body.push(MOVE);
        return body;
    }

    getUpgraderBody(energyCapacity) {
        const body = [];
        const maxSets = Math.min(Math.floor(energyCapacity / 200), 16);
        
        for (let i = 0; i < maxSets; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        return body.length > 0 ? body : [WORK, CARRY, MOVE];
    }

    getBuilderBody(energyCapacity) {
        const body = [];
        const maxSets = Math.min(Math.floor(energyCapacity / 200), 16);
        
        for (let i = 0; i < maxSets; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        return body.length > 0 ? body : [WORK, CARRY, MOVE];
    }

    getRepairerBody(energyCapacity) {
        const body = [];
        const maxSets = Math.min(Math.floor(energyCapacity / 200), 16);
        
        for (let i = 0; i < maxSets; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        return body.length > 0 ? body : [WORK, CARRY, MOVE];
    }

    spawnHarvester(spawn, source) {
        const body = this.getHarvesterBody(spawn.room.energyCapacityAvailable);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Harvester' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'harvester', sourceId: source.id, harvestPos: null }
        });

        if (result === OK) {
            console.log('Spawning harvester: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnUpgrader(spawn) {
        const body = this.getUpgraderBody(spawn.room.energyCapacityAvailable);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Upgrader' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'upgrader' }
        });

        if (result === OK) {
            console.log('Spawning upgrader: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnBuilder(spawn) {
        const body = this.getBuilderBody(spawn.room.energyCapacityAvailable);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Builder' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'builder' }
        });

        if (result === OK) {
            console.log('Spawning builder: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnRepairer(spawn) {
        const body = this.getRepairerBody(spawn.room.energyCapacityAvailable);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Repairer' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'repairer' }
        });

        if (result === OK) {
            console.log('Spawning repairer: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }
}

// --- RoomManager.js ---
class RoomManager {
    constructor() {
        this.spawnManager = new SpawnManager();
        this.constructionManager = new ConstructionManager();
    }
    
    run() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            
            if (room.controller && room.controller.my) {
                this.runOwnedRoom(room);
            }
        }
    }
    
    runOwnedRoom(room) {
        // Initialize room memory if needed
        if (!Memory.mokito.rooms[room.name]) {
            Memory.mokito.rooms[room.name] = {
                level: room.controller.level,
                spawnQueue: [],
                constructionSites: []
            };
        }
        
        // Run spawn logic - spawn creeps for GCL and base building
        this.spawnManager.run(room);
        
        // Manage construction - build base structures
        this.constructionManager.run(room);
        
        // Update room level tracking
        Memory.mokito.rooms[room.name].level = room.controller.level;
    }
}

// --- CreepManager.js ---
class CreepManager {
    constructor() {
        this.roles = {
            harvester: new Harvester(),
            upgrader: new Upgrader(),
            builder: new Builder(),
            repairer: new Repairer()
        };
    }
    
    run() {
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            
            if (creep.spawning) continue;
            
            const role = creep.memory.role;
            if (role && this.roles[role]) {
                this.roles[role].run(creep);
            }
        }
    }
}

// --- Mokito.js ---
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
                const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
                    filter: r => r.resourceType === RESOURCE_ENERGY
                }).reduce((sum, r) => sum + r.amount, 0);
                
                console.log('💓 Mokito Heartbeat | Creeps: H:' + harvesters + ' U:' + upgraders + ' B:' + builders + 
                          ' | GCL:' + Game.gcl.level + 
                          ' | RCL:' + room.controller.level + 
                          ' | Dropped:' + droppedEnergy);
            }
        }
    }
}

// --- main.js ---
// Bot: Mokito
// Entry point for Screeps



// Initialize on first run
if (!global.Mokito) {
    global.Mokito = new Mokito();
    console.log('*** Greetings from Mokito! ***');
    console.log('Current Game Tick:', Game.time);
}

// Main game loop
module.exports.loop = function() {
    global.Mokito.run();
};

// --- Bootstrap ---
module.exports.loop = function() {
    if (!global.MokitoInstance) {
        global.MokitoInstance = new Mokito();
        console.log('*** Greetings from Mokito! ***');
        console.log('Current Game Tick:', Game.time);
    }
    global.MokitoInstance.run();
};
