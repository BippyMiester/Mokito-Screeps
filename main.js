'use strict';

// ============================================
// Mokito Bot - Combined Build
// Built: 2026-04-08T10:33:14.610Z
// ============================================


// --- Harvester.js ---
/**
 * Harvester - Two-phase strategy with global room mode tracking
 * Phase 1: Traditional - Deliver energy to spawn (until all source positions filled)
 * Phase 2: Stationary - Drop energy at source (only when harvesters >= positions)
 * Emergency: Revert to traditional mode if harvesters drop below 2
 */
class Harvester {
    run(creep) {
        // Check room's harvester mode
        const mode = this.getRoomMode(creep.room);
        
        if (mode === 'stationary') {
            // Stationary mode: go to source position and drop energy
            this.runStationary(creep);
        } else {
            // Traditional mode: harvest and deliver to spawn/extensions
            this.runTraditional(creep);
        }
    }
    
    /**
     * Get the current mode for the room
     * 'stationary' - When we have enough harvesters to cover all source positions
     * 'traditional' - When harvesters are low (especially below 2) or filling up
     */
    getRoomMode(room) {
        // Check if we need to force traditional mode (emergency)
        const harvesters = room.find(FIND_MY_CREEPS, {
            filter: c => c.memory.role === 'harvester'
        });
        
        // Emergency: If less than 2 harvesters, force traditional mode
        if (harvesters.length < 2) {
            if (Memory.rooms[room.name].harvesterMode === 'stationary') {
                console.log('EMERGENCY: Harvester count dropped below 2, switching to traditional mode');
                Memory.rooms[room.name].harvesterMode = 'traditional';
            }
            return 'traditional';
        }
        
        // Count total open positions around all sources
        const sources = room.find(FIND_SOURCES);
        let totalPositions = 0;
        for (const source of sources) {
            totalPositions += this.countOpenPositions(source);
        }
        
        // Switch to stationary when we have harvesters >= positions
        if (harvesters.length >= totalPositions) {
            if (Memory.rooms[room.name].harvesterMode !== 'stationary') {
                console.log('Switching to stationary harvesting mode');
                Memory.rooms[room.name].harvesterMode = 'stationary';
            }
            return 'stationary';
        }
        
        // Otherwise stay in/return to traditional mode
        if (Memory.rooms[room.name].harvesterMode === 'stationary') {
            console.log('Harvester count dropped, reverting to traditional mode');
            Memory.rooms[room.name].harvesterMode = 'traditional';
        }
        return 'traditional';
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
     * Traditional harvester: Harvest energy and deliver to spawn/extensions
     * Used when: Starting game, low harvester count, or emergency fallback
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
            // Deliver to spawn, extensions, or towers
            const target = this.findDeliveryTarget(creep);
            if (target) {
                const result = creep.transfer(target, RESOURCE_ENERGY);
                if (result === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {
                        visualizePathStyle: { stroke: '#ffffff' }
                    });
                } else if (result === ERR_FULL) {
                    // Target is full, try to find another target
                    creep.say('🚫 full');
                } else if (result === OK) {
                    // Transfer successful
                    if (creep.store[RESOURCE_ENERGY] === 0) {
                        creep.memory.delivering = false;
                        creep.say('⛏️ harvest');
                    }
                }
            } else {
                // No target available - spawn/extensions are full
                // Wait near spawn or drop energy on ground so we can keep harvesting
                const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
                if (spawn) {
                    if (!creep.pos.inRangeTo(spawn, 3)) {
                        creep.moveTo(spawn, { 
                            range: 3,
                            visualizePathStyle: { stroke: '#ffaa00' }
                        });
                    } else {
                        // Near spawn but it's full - drop energy so we can keep harvesting
                        if (creep.store[RESOURCE_ENERGY] > 0) {
                            creep.drop(RESOURCE_ENERGY);
                            creep.say('💧 drop');
                        }
                        creep.memory.delivering = false;
                    }
                }
            }
        } else {
            // Harvest from assigned source
            const source = Game.getObjectById(creep.memory.sourceId);
            if (source) {
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source, {
                        visualizePathStyle: { stroke: '#ffaa00' }
                    });
                }
            } else {
                // No source assigned, find one
                const sources = creep.room.find(FIND_SOURCES);
                if (sources.length > 0) {
                    // Find a source with fewer harvesters
                    let bestSource = sources[0];
                    let minHarvesters = Infinity;
                    
                    for (const source of sources) {
                        const harvestersAtSource = creep.room.find(FIND_MY_CREEPS, {
                            filter: c => c.memory.role === 'harvester' && c.memory.sourceId === source.id
                        });
                        if (harvestersAtSource.length < minHarvesters) {
                            minHarvesters = harvestersAtSource.length;
                            bestSource = source;
                        }
                    }
                    
                    creep.memory.sourceId = bestSource.id;
                    creep.say('📍 source');
                }
            }
        }
    }
    
    /**
     * Stationary harvester: Go to position, harvest, and drop
     * Used when: All source positions are covered by harvesters
     */
    runStationary(creep) {
        // Clear delivering flag - stationary harvesters never deliver
        creep.memory.delivering = false;
        
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
                    visualizePathStyle: { stroke: '#ffaa00' },
                    range: 0
                });
                return;
            }
            
            // We're at our position - harvest and drop
            this.harvestAndDrop(creep);
        } else {
            // Couldn't find a position, fall back to traditional
            this.runTraditional(creep);
        }
    }
    
    findPosition(creep) {
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) return;
        
        const positions = this.getOpenPositions(source);
        
        // Sort positions by proximity to spawn for efficiency
        const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
        if (spawn) {
            positions.sort((a, b) => {
                const distA = Math.abs(a.x - spawn.pos.x) + Math.abs(a.y - spawn.pos.y);
                const distB = Math.abs(b.x - spawn.pos.x) + Math.abs(b.y - spawn.pos.y);
                return distA - distB;
            });
        }
        
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
            // Drop energy when full or when we have enough
            if (creep.store.getFreeCapacity() === 0) {
                creep.drop(RESOURCE_ENERGY);
                creep.say('💧 drop');
            }
        } else if (result === ERR_NOT_IN_RANGE) {
            // Shouldn't happen if we're at our position, but handle it
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

// --- Runner.js ---
/**
 * Runner - Transports energy from dropped locations to spawn/extensions
 * Used in stationary harvesting mode to move energy from harvester drops to storage
 */
class Runner {
    run(creep) {
        // State: collecting or delivering
        if (creep.memory.delivering && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.delivering = false;
            creep.say('🔍 collect');
        }
        if (!creep.memory.delivering && creep.store.getFreeCapacity() === 0) {
            creep.memory.delivering = true;
            creep.say('📦 deliver');
        }

        if (creep.memory.delivering) {
            this.deliverEnergy(creep);
        } else {
            this.collectEnergy(creep);
        }
    }

    collectEnergy(creep) {
        // Priority 1: Dropped energy near sources (from stationary harvesters)
        const droppedEnergy = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount >= 50
        });

        if (droppedEnergy) {
            if (creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
                creep.moveTo(droppedEnergy, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            } else {
                // Successfully picked up, check if full
                if (creep.store.getFreeCapacity() === 0) {
                    creep.memory.delivering = true;
                    creep.say('📦 deliver');
                }
            }
            return;
        }

        // Priority 2: Any dropped energy (even small amounts)
        const anyDroppedEnergy = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount >= 20
        });

        if (anyDroppedEnergy) {
            if (creep.pickup(anyDroppedEnergy) === ERR_NOT_IN_RANGE) {
                creep.moveTo(anyDroppedEnergy, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            } else {
                if (creep.store.getFreeCapacity() === 0) {
                    creep.memory.delivering = true;
                    creep.say('📦 deliver');
                }
            }
            return;
        }

        // Priority 3: Containers/Storage
        const storage = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: (s) => (s.structureType === STRUCTURE_CONTAINER ||
                           s.structureType === STRUCTURE_STORAGE) &&
                           s.store[RESOURCE_ENERGY] > 0
        });

        if (storage) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage);
            } else {
                if (creep.store.getFreeCapacity() === 0) {
                    creep.memory.delivering = true;
                    creep.say('📦 deliver');
                }
            }
            return;
        }

        // If no energy available, check if we have energy to upgrade controller
        if (creep.store[RESOURCE_ENERGY] > 0) {
            // Have energy but nothing to collect - upgrade as idle behavior
            this.upgradeController(creep);
            return;
        }
        
        // No energy to collect and no energy stored - wait near sources
        const sources = creep.room.find(FIND_SOURCES);
        if (sources.length > 0) {
            // Find source with most dropped energy nearby
            let bestSource = sources[0];
            let maxDropped = 0;
            
            for (const source of sources) {
                const dropped = source.pos.findInRange(FIND_DROPPED_RESOURCES, 3, {
                    filter: r => r.resourceType === RESOURCE_ENERGY
                });
                const totalDropped = dropped.reduce((sum, r) => sum + r.amount, 0);
                if (totalDropped > maxDropped) {
                    maxDropped = totalDropped;
                    bestSource = source;
                }
            }
            
            creep.moveTo(bestSource, {
                range: 3,
                visualizePathStyle: { stroke: '#ffaa00' }
            });
            creep.say('⏳ waiting');
        }
    }

    deliverEnergy(creep) {
        // Get all possible delivery targets and sort by priority
        const targets = [];
        
        // Priority 1: Spawn
        const spawn = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_SPAWN &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (spawn) targets.push({ type: 'spawn', obj: spawn });
        
        // Priority 2: Extensions
        const extensions = creep.room.find(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_EXTENSION &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (extensions.length > 0) {
            // Find closest extension
            const closestExtension = creep.pos.findClosestByPath(extensions);
            if (closestExtension) {
                targets.push({ type: 'extension', obj: closestExtension });
            }
        }
        
        // Priority 3: Towers
        const towers = creep.room.find(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_TOWER &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 100
        });
        if (towers.length > 0) {
            const closestTower = creep.pos.findClosestByPath(towers);
            if (closestTower) {
                targets.push({ type: 'tower', obj: closestTower });
            }
        }
        
        // Try to deliver to each target in order
        for (const target of targets) {
            const result = creep.transfer(target.obj, RESOURCE_ENERGY);
            
            if (result === OK) {
                // Successfully transferred
                if (creep.store[RESOURCE_ENERGY] === 0) {
                    creep.memory.delivering = false;
                    creep.say('🔍 collect');
                }
                return;
            } else if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(target.obj, {
                    visualizePathStyle: { stroke: '#ffffff' }
                });
                return;
            } else if (result === ERR_FULL) {
                // Target is full, continue to next target
                continue;
            }
            // Other errors - try next target
        }
        
        // If all targets are full or none available
        // Drop energy so we can collect more, or wait near spawn
        if (creep.store[RESOURCE_ENERGY] > 0) {
            // Find spawn to drop near
            const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
            if (spawn) {
                if (!creep.pos.inRangeTo(spawn, 2)) {
                    creep.moveTo(spawn, { range: 2 });
                } else {
                    // Near spawn - drop energy so we can keep collecting
                    creep.drop(RESOURCE_ENERGY);
                    creep.memory.delivering = false;
                    creep.say('💧 drop');
                }
            } else {
                // No spawn? Just drop here
                creep.drop(RESOURCE_ENERGY);
                creep.memory.delivering = false;
                creep.say('💧 drop');
            }
        } else {
            // No energy to deliver, go collect
            creep.memory.delivering = false;
            creep.say('🔍 collect');
        }
    }

    // Idle behavior: Upgrade controller when nothing to deliver
    upgradeController(creep) {
        const controller = creep.room.controller;
        if (!controller) return;

        const result = creep.upgradeController(controller);

        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller, {
                visualizePathStyle: { stroke: '#ffffff' }
            });
        } else if (result === OK) {
            if (Game.time % 10 === 0) {
                creep.say('⚡ ' + creep.store[RESOURCE_ENERGY]);
            }
        }
    }
}

// --- Upgrader.js ---
/**
 * Upgrader - Mines energy and upgrades controller
 * Priority: Self-mining (always) > Dropped energy (if available) > Containers/Storage
 * NEVER takes from spawn - upgraders are self-sufficient
 */
class Upgrader {
    run(creep) {
        // State management
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.upgrading = false;
            creep.say('⛏️ collect');
        }
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() === 0) {
            creep.memory.upgrading = true;
            creep.say('⚡ upgrade');
        }

        if (creep.memory.upgrading) {
            // Upgrade controller
            this.upgradeController(creep);
        } else {
            // Collect energy - self-mine by default, but pick up dropped if available
            this.collectEnergy(creep);
        }
    }

    collectEnergy(creep) {
        // Priority 1: Dropped energy (bonus if available from stationary harvesters)
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

        // Priority 2: Containers/Storage (if available)
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

        // Priority 3: Mine energy yourself (DEFAULT BEHAVIOR)
        // Upgraders are self-sufficient - they mine their own energy
        // This allows harvesters to focus on feeding the spawn for more creep production
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
 * Idle behavior: Upgrades controller
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
            const result = creep.pickup(droppedEnergy);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(droppedEnergy, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            } else if (result === OK && creep.store.getFreeCapacity() === 0) {
                // Successfully picked up energy and is full
                creep.memory.building = true;
                creep.say('🔨 build');
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
            const result = creep.withdraw(storage, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage);
            } else if (result === OK && creep.store.getFreeCapacity() === 0) {
                creep.memory.building = true;
                creep.say('🔨 build');
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
            } else if (creep.store.getFreeCapacity() === 0) {
                creep.memory.building = true;
                creep.say('🔨 build');
            }
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
            // No construction sites - repair roads or containers
            const didRepair = this.repair(creep);
            
            // If nothing to repair either, upgrade controller as idle behavior
            if (!didRepair) {
                this.upgradeController(creep);
            }
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
            return true; // Found something to repair
        }
        
        return false; // Nothing to repair
    }

    upgradeController(creep) {
        // When idle (no construction sites or repairs needed), upgrade controller
        const controller = creep.room.controller;
        if (!controller) return false;

        const result = creep.upgradeController(controller);

        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller, {
                visualizePathStyle: { stroke: '#ffffff' }
            });
        } else if (result === OK) {
            if (Game.time % 10 === 0) {
                creep.say('⚡ ' + creep.store[RESOURCE_ENERGY]);
            }
        }
        
        return true;
    }
}

// --- Repairer.js ---
/**
 * Repairer - Repairs structures (roads, containers, ramparts, walls)
 * Priority: Dropped energy > Containers/Storage > Self-mining
 * Idle behavior: Upgrades controller
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
            const result = creep.pickup(droppedEnergy);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(droppedEnergy);
            } else if (result === OK && creep.store.getFreeCapacity() === 0) {
                creep.memory.repairing = true;
                creep.say('🔧 repair');
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
            const result = creep.withdraw(storage, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage);
            } else if (result === OK && creep.store.getFreeCapacity() === 0) {
                creep.memory.repairing = true;
                creep.say('🔧 repair');
            }
            return;
        }

        // Priority 3: Mine energy yourself (if stationary harvesters not available)
        // Repairers should NOT take from spawn - only from ground or containers
        const source = creep.pos.findClosestByPath(FIND_SOURCES);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source);
            } else if (creep.store.getFreeCapacity() === 0) {
                creep.memory.repairing = true;
                creep.say('🔧 repair');
            }
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

        // Nothing to repair - upgrade controller as idle behavior
        this.upgradeController(creep);
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
            if (Game.time % 10 === 0) {
                creep.say('⚡ ' + creep.store[RESOURCE_ENERGY]);
            }
        }
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
        
        // Initialize room memory structures
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (room.controller && room.controller.my) {
                if (!room.memory.spawnPriority) {
                    room.memory.spawnPriority = [];
                }
            }
        }
        
        // Cleanup old memory
        for (const roomName in Memory.rooms) {
            if (!Game.rooms[roomName]) {
                // Keep intel but remove runtime data
                delete Memory.rooms[roomName].spawnPriority;
            }
        }
    }
}

// --- ConstructionManager.js ---
/**
 * ConstructionManager - Plans and initiates construction of room structures
 * Priorities: Roads for efficiency, Extensions for bigger creeps, Towers/Storage
 */
class ConstructionManager {
    run(room) {
        const rcl = room.controller.level;
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        
        if (!spawn) return;
        
        // Get existing construction sites count
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length >= 5) return; // Don't overwhelm with construction
        
        // Initialize room construction memory
        if (!Memory.rooms[room.name].construction) {
            Memory.rooms[room.name].construction = {
                roadsPlanned: false,
                lastRoadBuild: 0
            };
        }
        
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
        const sources = room.find(FIND_SOURCES);
        
        // Priority 1: Roads from spawn to sources (for harvesters)
        for (const source of sources) {
            this.buildRoad(room, spawn.pos, source.pos);
        }
        
        // Priority 2: Road from spawn to controller (for upgraders)
        if (room.controller) {
            this.buildRoad(room, spawn.pos, room.controller.pos);
        }
        
        // Priority 3: Roads between sources (for efficiency)
        if (sources.length > 1) {
            for (let i = 0; i < sources.length - 1; i++) {
                this.buildRoad(room, sources[i].pos, sources[i + 1].pos);
            }
        }
        
        // Priority 4: Roads from sources to controller
        if (room.controller) {
            for (const source of sources) {
                this.buildRoad(room, source.pos, room.controller.pos);
            }
        }
    }
    
    buildExtensions(room) {
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn) return;
        
        // Get current extension count
        const extensions = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_EXTENSION }
        });
        
        const maxExtensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
        
        if (extensions.length < maxExtensions) {
            // Place extensions in a pattern around spawn (better than random placement)
            this.placeExtensionPattern(room, spawn.pos, extensions.length, maxExtensions);
        }
    }
    
    /**
     * Place extensions in a diamond pattern around spawn for optimal pathing
     */
    placeExtensionPattern(room, spawnPos, currentCount, maxCount) {
        // Diamond pattern offsets (prioritize closer to spawn)
        const pattern = [
            {x: 0, y: -2}, {x: 1, y: -1}, {x: 2, y: 0}, {x: 1, y: 1},
            {x: 0, y: 2}, {x: -1, y: 1}, {x: -2, y: 0}, {x: -1, y: -1},
            // Second ring
            {x: 0, y: -3}, {x: 1, y: -2}, {x: 2, y: -2}, {x: 3, y: -1},
            {x: 3, y: 0}, {x: 3, y: 1}, {x: 2, y: 2}, {x: 1, y: 3},
            {x: 0, y: 3}, {x: -1, y: 3}, {x: -2, y: 2}, {x: -3, y: 1},
            {x: -3, y: 0}, {x: -3, y: -1}, {x: -2, y: -2}, {x: -1, y: -3},
            // Third ring
            {x: 0, y: -4}, {x: 1, y: -3}, {x: 2, y: -3}, {x: 3, y: -2},
            {x: 4, y: -1}, {x: 4, y: 0}, {x: 4, y: 1}, {x: 3, y: 2},
            {x: 3, y: 3}, {x: 2, y: 3}, {x: 1, y: 4}, {x: 0, y: 4},
            {x: -1, y: 4}, {x: -2, y: 3}, {x: -3, y: 2}, {x: -4, y: 1},
            {x: -4, y: 0}, {x: -4, y: -1}, {x: -3, y: -2}, {x: -2, y: -3},
            {x: -1, y: -4}
        ];
        
        // Skip already placed extensions
        const startIndex = currentCount;
        
        for (let i = startIndex; i < pattern.length && i < maxCount; i++) {
            const offset = pattern[i];
            const x = spawnPos.x + offset.x;
            const y = spawnPos.y + offset.y;
            
            if (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
                const pos = new RoomPosition(x, y, room.name);
                const terrain = pos.lookFor(LOOK_TERRAIN);
                
                if (terrain.length > 0 && terrain[0] !== 'wall') {
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                    
                    if (structures.length === 0 && sites.length === 0) {
                        pos.createConstructionSite(STRUCTURE_EXTENSION);
                        return; // Place one at a time
                    }
                }
            }
        }
    }
    
    buildTower(room) {
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_TOWER }
        });
        
        const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0;
        
        if (towers.length < maxTowers) {
            const spawn = room.find(FIND_MY_SPAWNS)[0];
            // Place tower near spawn but closer to edges for defense
            this.placeTowerNear(room, spawn.pos);
        }
    }
    
    placeTowerNear(room, spawnPos) {
        // Place tower 3-4 tiles from spawn in various directions
        const offsets = [
            {x: 3, y: 0}, {x: -3, y: 0}, {x: 0, y: 3}, {x: 0, y: -3},
            {x: 3, y: 3}, {x: 3, y: -3}, {x: -3, y: 3}, {x: -3, y: -3}
        ];
        
        for (const offset of offsets) {
            const x = spawnPos.x + offset.x;
            const y = spawnPos.y + offset.y;
            
            if (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
                const pos = new RoomPosition(x, y, room.name);
                const terrain = pos.lookFor(LOOK_TERRAIN);
                
                if (terrain.length > 0 && terrain[0] !== 'wall') {
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                    
                    if (structures.length === 0 && sites.length === 0) {
                        pos.createConstructionSite(STRUCTURE_TOWER);
                        return;
                    }
                }
            }
        }
    }
    
    buildStorage(room) {
        const storages = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_STORAGE }
        });
        
        if (storages.length === 0) {
            const spawn = room.find(FIND_MY_SPAWNS)[0];
            // Place storage 2 tiles from spawn
            this.placeStorageNear(room, spawn.pos);
        }
    }
    
    placeStorageNear(room, spawnPos) {
        // Place storage adjacent to spawn
        const offsets = [
            {x: 2, y: 0}, {x: -2, y: 0}, {x: 0, y: 2}, {x: 0, y: -2},
            {x: 2, y: 1}, {x: 2, y: -1}, {x: -2, y: 1}, {x: -2, y: -1}
        ];
        
        for (const offset of offsets) {
            const x = spawnPos.x + offset.x;
            const y = spawnPos.y + offset.y;
            
            if (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
                const pos = new RoomPosition(x, y, room.name);
                const terrain = pos.lookFor(LOOK_TERRAIN);
                
                if (terrain.length > 0 && terrain[0] !== 'wall') {
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                    
                    if (structures.length === 0 && sites.length === 0) {
                        pos.createConstructionSite(STRUCTURE_STORAGE);
                        return;
                    }
                }
            }
        }
    }
    
    buildRoad(room, fromPos, toPos) {
        const path = fromPos.findPathTo(toPos, {
            ignoreCreeps: true,
            ignoreRoads: false // Respect existing roads
        });
        
        let placed = 0;
        for (const step of path) {
            const pos = new RoomPosition(step.x, step.y, room.name);
            
            // Skip positions with structures
            const structures = pos.lookFor(LOOK_STRUCTURES);
            const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
            const hasConstruction = pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0;
            
            // Don't build roads on top of structures or exits
            if (!hasRoad && !hasConstruction && 
                step.x > 0 && step.x < 49 && 
                step.y > 0 && step.y < 49) {
                pos.createConstructionSite(STRUCTURE_ROAD);
                placed++;
                if (placed >= 3) break; // Limit to 3 roads per tick
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
 * Phase 1 (Early Game): 
 *   - Spawn 2 harvesters (deliver to spawn)
 *   - Then spawn 1 upgrader (self-mines)
 * Phase 2 (Filling Harvesters):
 *   - Continue spawning harvesters until all source positions filled
 * Phase 3 (Stationary Mode):
 *   - Once harvesters >= source positions, switch to stationary mode
 *   - Spawn Runners to move energy from drops to spawn (1 runner per 2 harvesters)
 *   - Then spawn Upgraders (1:1 ratio with harvesters)
 * Phase 4 (Builders/Repairers):
 *   - Only after harvesters, runners, and upgraders are complete
 *   - Ratio: 1 builder : 2 repairers
 *   - Max: 3 builders, 4 repairers
 * Emergency: 
 *   - If harvesters drop below 2, revert to Phase 1
 *   - Pause other spawning until harvesters rebuilt
 */
class SpawnManager {
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
        const runners = creeps.filter(c => c.memory.role === 'runner');

        // Calculate needed harvesters (open positions around sources)
        const sources = room.find(FIND_SOURCES);
        let totalSourcePositions = 0;
        for (const source of sources) {
            totalSourcePositions += this.countOpenPositions(source);
        }
        
        // Update spawn priority info in room memory for heartbeat display
        const nextSpawns = this.getNextSpawnPriority(room);
        room.memory.spawnPriority = nextSpawns;
        
        // EMERGENCY MODE: Less than 2 harvesters
        // This is critical - we need energy production immediately
        if (harvesters.length < 2) {
            // Force traditional mode for all harvesters
            room.memory.stationaryMode = false;
            
            if (energyAvailable >= 200) {
                // Spawn basic harvester that will deliver to spawn
                const body = [WORK, CARRY, MOVE]; // Minimum viable body
                const name = 'Harvester' + Game.time;
                const source = sources[0];
                if (source) {
                    spawn.spawnCreep(body, name, {
                        memory: { 
                            role: 'harvester', 
                            sourceId: source.id,
                            delivering: false
                        }
                    });
                    console.log('🚨 EMERGENCY: Spawning harvester ' + name);
                }
            }
            return;
        }

        // PHASE 1: Initial startup - exactly 2 harvesters, then 1 upgrader
        if (harvesters.length === 2 && upgraders.length < 1) {
            if (energyAvailable >= 200) {
                this.spawnUpgrader(spawn, energyCapacity);
            }
            return;
        }

        // PHASE 2: Fill all harvester positions
        // Keep spawning harvesters until all source positions are filled
        if (harvesters.length < totalSourcePositions) {
            if (energyAvailable >= this.getHarvesterCost(energyCapacity)) {
                // Assign to source with fewest harvesters
                let bestSource = sources[0];
                let minHarvesters = Infinity;
                
                for (const source of sources) {
                    const harvestersAtSource = harvesters.filter(h => h.memory.sourceId === source.id).length;
                    if (harvestersAtSource < minHarvesters) {
                        minHarvesters = harvestersAtSource;
                        bestSource = source;
                    }
                }
                
                this.spawnHarvester(spawn, bestSource, energyCapacity);
            }
            return;
        }

        // Check if we should switch to stationary mode
        // This happens when we have enough harvesters to cover all source positions
        if (harvesters.length >= totalSourcePositions) {
            if (!room.memory.stationaryMode) {
                console.log('🔄 Switching to stationary harvesting mode');
                room.memory.stationaryMode = true;
            }
        }

        // PHASE 3 (Stationary Mode): Spawn Runners first
        // Runners move energy from dropped locations to spawn/extensions
        // Ratio: 1 runner per 2 harvesters
        const desiredRunners = Math.ceil(harvesters.length / 2);
        if (runners.length < desiredRunners) {
            const bodyCost = this.getRunnerCost(energyCapacity);
            if (energyAvailable >= bodyCost) {
                this.spawnRunner(spawn, energyCapacity);
            }
            return;
        }

        // PHASE 3 (Stationary Mode): Spawn Upgraders after Runners
        // Calculate desired upgraders: 1 per 1 harvester (1:1 ratio), minimum 1
        const desiredUpgraders = Math.max(1, harvesters.length);
        if (upgraders.length < desiredUpgraders) {
            const bodyCost = this.getUpgraderCost(energyCapacity);
            if (energyAvailable >= bodyCost) {
                this.spawnUpgrader(spawn, energyCapacity);
            }
            return;
        }

        // PHASE 4: Builders and Repairers
        // Only spawn after harvesters, runners, and upgraders are complete
        // New ratios: Builders:Upgraders = 1:1, Repairers = (Builders+Upgraders)/2
        const maxBuilders = 3;
        const maxUpgraders = harvesters.length; // 1:1 with harvesters
        
        // Check for construction sites
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        
        // Calculate desired builders (1:1 with upgraders, up to max)
        const desiredBuilders = Math.min(upgraders.length, maxBuilders);
        
        // Spawn builder first (priority before repairers)
        // Maintain 1:1 ratio with upgraders
        if (builders.length < desiredBuilders && sites.length > 0) {
            const bodyCost = this.getBuilderCost(energyCapacity);
            if (energyAvailable >= bodyCost) {
                this.spawnBuilder(spawn, energyCapacity);
                return;
            }
        }
        
        // Spawn repairers based on (builders + upgraders) / 2 formula
        // This ensures repairers scale with our building/upgrading workforce
        const desiredRepairers = Math.ceil((builders.length + upgraders.length) / 2);
        const maxRepairers = 4;
        
        if (repairers.length < desiredRepairers && repairers.length < maxRepairers) {
            const needsRepair = this.needsRepair(room);
            if (needsRepair || repairers.length === 0) {
                const bodyCost = this.getRepairerCost(energyCapacity);
                if (energyAvailable >= bodyCost) {
                    this.spawnRepairer(spawn, energyCapacity);
                }
            }
        }
    }
    
    /**
     * Count open positions around a source (where a creep can stand to harvest)
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
     * Check if any structures need repair
     */
    needsRepair(room) {
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

    /**
     * Get harvester body and calculate cost
     */
    getHarvesterCost(energyCapacity) {
        // Traditional harvesters need CARRY to deliver to spawn
        // Body: WORK(n), CARRY(1), MOVE(1)
        const workParts = Math.min(Math.floor((energyCapacity - 100) / 100), 5);
        return 100 * workParts + 100; // WORK parts + CARRY + MOVE
    }

    getHarvesterBody(energyCapacity) {
        const body = [];
        let remaining = energyCapacity - 100; // Reserve for CARRY + MOVE
        const maxWork = Math.min(Math.floor(remaining / 100), 5);
        
        for (let i = 0; i < maxWork; i++) {
            body.push(WORK);
        }
        body.push(CARRY);
        body.push(MOVE);
        return body;
    }

    getRunnerCost(energyCapacity) {
        // Runner body: prioritize CARRY and MOVE for transport efficiency
        // WORK is optional for self-sufficiency if needed
        const maxSets = Math.min(Math.floor(energyCapacity / 150), 16); // CARRY, MOVE, CARRY = 150
        return maxSets > 0 ? maxSets * 150 : 150;
    }

    getRunnerBody(energyCapacity) {
        const body = [];
        // Runners need lots of CARRY and MOVE for efficient transport
        // Maximize carry capacity while maintaining move speed
        let remaining = energyCapacity;
        
        // Add CARRY, MOVE pairs
        while (remaining >= 100 && body.length < 50 - 2) {
            body.push(CARRY);
            body.push(MOVE);
            remaining -= 100;
        }
        
        // If we have leftover, add more CARRY
        if (remaining >= 50 && body.length < 50) {
            body.push(CARRY);
        }
        
        return body.length > 0 ? body : [CARRY, MOVE];
    }

    getUpgraderCost(energyCapacity) {
        // Upgrader body: WORK, CARRY, MOVE repeating
        const maxSets = Math.min(Math.floor(energyCapacity / 200), 16);
        return maxSets > 0 ? maxSets * 200 : 200;
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

    getBuilderCost(energyCapacity) {
        const maxSets = Math.min(Math.floor(energyCapacity / 200), 16);
        return maxSets > 0 ? maxSets * 200 : 200;
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

    getRepairerCost(energyCapacity) {
        const maxSets = Math.min(Math.floor(energyCapacity / 200), 16);
        return maxSets > 0 ? maxSets * 200 : 200;
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

    spawnHarvester(spawn, source, energyCapacity) {
        if (!source) return ERR_INVALID_ARGS;
        
        const body = this.getHarvesterBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Harvester' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { 
                role: 'harvester', 
                sourceId: source.id,
                delivering: false,
                harvestPos: null
            }
        });

        if (result === OK) {
            console.log('🌱 Spawning harvester: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnRunner(spawn, energyCapacity) {
        const body = this.getRunnerBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Runner' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'runner' }
        });

        if (result === OK) {
            console.log('🏃 Spawning runner: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnUpgrader(spawn, energyCapacity) {
        const body = this.getUpgraderBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Upgrader' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'upgrader' }
        });

        if (result === OK) {
            console.log('⚡ Spawning upgrader: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnBuilder(spawn, energyCapacity) {
        const body = this.getBuilderBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Builder' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'builder' }
        });

        if (result === OK) {
            console.log('🔨 Spawning builder: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnRepairer(spawn, energyCapacity) {
        const body = this.getRepairerBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Repairer' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'repairer' }
        });

        if (result === OK) {
            console.log('🔧 Spawning repairer: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    /**
     * Get the next creep(s) that should be spawned based on current room state
     * Returns an array of up to 2 next priority spawns
     */
    getNextSpawnPriority(room) {
        const creeps = room.find(FIND_MY_CREEPS);
        const harvesters = creeps.filter(c => c.memory.role === 'harvester');
        const upgraders = creeps.filter(c => c.memory.role === 'upgrader');
        const builders = creeps.filter(c => c.memory.role === 'builder');
        const repairers = creeps.filter(c => c.memory.role === 'repairer');
        const runners = creeps.filter(c => c.memory.role === 'runner');

        const sources = room.find(FIND_SOURCES);
        let totalSourcePositions = 0;
        for (const source of sources) {
            totalSourcePositions += this.countOpenPositions(source);
        }

        const priorities = [];

        // EMERGENCY: Need harvesters immediately
        if (harvesters.length < 2) {
            priorities.push({
                role: 'harvester',
                emoji: '🌱',
                reason: 'EMERGENCY: Only ' + harvesters.length + ' harvester(s)',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
            
            if (harvesters.length < 2) {
                priorities.push({
                    role: 'harvester',
                    emoji: '🌱',
                    reason: 'Emergency backup',
                    priority: 2
                });
                return priorities;
            }
        }

        // PHASE 1: Initial startup - need 2 harvesters then 1 upgrader
        if (harvesters.length < 2) {
            priorities.push({
                role: 'harvester',
                emoji: '🌱',
                reason: 'Need ' + (2 - harvesters.length) + ' more to reach 2',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
        } else if (harvesters.length === 2 && upgraders.length < 1) {
            priorities.push({
                role: 'upgrader',
                emoji: '⚡',
                reason: 'First upgrader needed',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
        }

        // PHASE 2: Fill harvester positions
        if (harvesters.length < totalSourcePositions) {
            priorities.push({
                role: 'harvester',
                emoji: '🌱',
                reason: harvesters.length + '/' + totalSourcePositions + ' positions filled',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
            
            // Second harvester if still needed
            if (harvesters.length + 1 < totalSourcePositions) {
                priorities.push({
                    role: 'harvester',
                    emoji: '🌱',
                    reason: 'Filling source positions',
                    priority: 2
                });
                return priorities;
            }
        }

        // PHASE 3 (Stationary Mode): Spawn Runners
        if (harvesters.length >= totalSourcePositions) {
            const desiredRunners = Math.ceil(harvesters.length / 2);
            if (runners.length < desiredRunners) {
                priorities.push({
                    role: 'runner',
                    emoji: '🏃',
                    reason: runners.length + '/' + desiredRunners + ' runners needed',
                    priority: 1
                });
                if (priorities.length >= 2) return priorities;
                
                if (runners.length + 1 < desiredRunners) {
                    priorities.push({
                        role: 'runner',
                        emoji: '🏃',
                        reason: 'Moving dropped energy',
                        priority: 2
                    });
                    return priorities;
                }
            }

            // PHASE 3: Spawn Upgraders
            const desiredUpgraders = Math.max(1, harvesters.length);
            if (upgraders.length < desiredUpgraders) {
                priorities.push({
                    role: 'upgrader',
                    emoji: '⚡',
                    reason: upgraders.length + '/' + desiredUpgraders + ' (1:1 ratio)',
                    priority: 1
                });
                if (priorities.length >= 2) return priorities;
                
                if (upgraders.length + 1 < desiredUpgraders) {
                    priorities.push({
                        role: 'upgrader',
                        emoji: '⚡',
                        reason: 'Upgrading controller',
                        priority: 2
                    });
                    return priorities;
                }
            }
        }

        // PHASE 4: Builders and Repairers
        // New ratios: Builders:Upgraders = 1:1, Repairers = (Builders+Upgraders)/2
        const maxBuilders = 3;
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        
        // Calculate desired builders (1:1 with upgraders)
        const desiredBuilders = Math.min(upgraders.length, maxBuilders);
        
        // Check if builder needed (builders come before repairers)
        if (builders.length < desiredBuilders && sites.length > 0) {
            priorities.push({
                role: 'builder',
                emoji: '🔨',
                reason: builders.length + '/' + desiredBuilders + ' builders (1:1 with upgraders), ' + sites.length + ' sites',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
        }
        
        // Check if repairer needed (repairers = (builders + upgraders) / 2)
        const needsRepair = this.needsRepair(room);
        const desiredRepairers = Math.ceil((builders.length + upgraders.length) / 2);
        const maxRepairers = 4;
        
        if (repairers.length < desiredRepairers && repairers.length < maxRepairers) {
            if (needsRepair || repairers.length === 0) {
                priorities.push({
                    role: 'repairer',
                    emoji: '🔧',
                    reason: repairers.length + '/' + desiredRepairers + ' repairers ((B+U)/2)',
                    priority: priorities.length === 0 ? 1 : 2
                });
                if (priorities.length >= 2) return priorities;
            }
        }
        
        // If no specific needs, show what's at capacity
        if (priorities.length === 0) {
            if (room.memory.stationaryMode) {
                priorities.push({
                    role: 'upgrader',
                    emoji: '⚡',
                    reason: 'All creeps at capacity - spawning for upgrades',
                    priority: 1
                });
            } else {
                priorities.push({
                    role: 'harvester',
                    emoji: '🌱',
                    reason: 'All positions filled - maintaining count',
                    priority: 1
                });
            }
        }

        return priorities;
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
            repairer: new Repairer(),
            runner: new Runner()
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
                const repairers = creeps.filter(c => c.memory.role === 'repairer').length;
                const runners = creeps.filter(c => c.memory.role === 'runner').length;
                const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
                    filter: r => r.resourceType === RESOURCE_ENERGY
                }).reduce((sum, r) => sum + r.amount, 0);
                
                // Get spawn priority info from room memory
                let upNext = '';
                const nextSpawns = room.memory.spawnPriority || [];
                if (nextSpawns.length > 0) {
                    upNext = ' | Next: ' + nextSpawns[0].emoji + ' ' + nextSpawns[0].role + ' (' + nextSpawns[0].reason + ')';
                    if (nextSpawns.length > 1) {
                        upNext += ' → ' + nextSpawns[1].emoji + ' ' + nextSpawns[1].role;
                    }
                }
                
                console.log('💓 Mokito | Creeps: H:' + harvesters + ' R:' + runners + ' U:' + upgraders + ' B:' + builders + ' Rp:' + repairers + 
                          ' | GCL:' + Game.gcl.level + 
                          ' | RCL:' + room.controller.level + 
                          ' | Energy:' + droppedEnergy + upNext);
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
