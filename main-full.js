'use strict';


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
                // Silently switch back to traditional mode
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
        
        // Switch to stationary when we have harvesters >= positions AND RCL >= 2 (Phase 4)
        if (harvesters.length >= totalPositions && room.controller.level >= 2) {
            if (Memory.rooms[room.name].harvesterMode !== 'stationary') {
                // Silently switch to stationary mode
                Memory.rooms[room.name].harvesterMode = 'stationary';
            }
            return 'stationary';
        }
        
        // Otherwise stay in/return to traditional mode
        if (Memory.rooms[room.name].harvesterMode === 'stationary') {
            // Silently revert to traditional mode
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
            
            // If not at position, move there with obstacle avoidance
            if (!creep.pos.isEqualTo(targetPos)) {
                this.moveToHarvestPosition(creep, targetPos);
                return;
            }
            
            // We're at our position - harvest and drop
            this.harvestAndDrop(creep);
        } else {
            // Couldn't find a position, fall back to traditional
            this.runTraditional(creep);
        }
    }
    
    /**
     * Move to harvest position with obstacle avoidance
     * If path is blocked, request other creeps to move
     */
    moveToHarvestPosition(creep, targetPos) {
        // First try normal move
        const moveResult = creep.moveTo(targetPos, {
            visualizePathStyle: { stroke: '#ffaa00' },
            range: 0,
            reusePath: 5
        });
        
        if (moveResult === ERR_NO_PATH || moveResult === ERR_INVALID_TARGET) {
            // Path is blocked - check what's blocking
            const blockingCreep = this.getBlockingCreep(creep, targetPos);
            
            if (blockingCreep) {
                // Ask blocking creep to move
                this.requestCreepToMove(blockingCreep, creep);
                
                // Try alternative path
                creep.moveTo(targetPos, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                    range: 0,
                    ignoreCreeps: true,
                    reusePath: 0
                });
            }
        }
        
        // If we're still not there after multiple ticks, force path clear
        if (!creep.pos.isEqualTo(targetPos)) {
            if (!creep.memory.stuckTicks) {
                creep.memory.stuckTicks = 0;
            }
            creep.memory.stuckTicks++;
            
            // If stuck for too long, try to swap positions with blocking creep
            if (creep.memory.stuckTicks > 3) {
                const blockingCreep = this.getBlockingCreep(creep, targetPos);
                if (blockingCreep && blockingCreep.memory.role !== 'harvester') {
                    // Non-harvesters should move away immediately
                    this.pushCreep(blockingCreep, creep);
                    creep.say('🚶 move!');
                }
                creep.memory.stuckTicks = 0;
            }
        } else {
            creep.memory.stuckTicks = 0;
        }
    }
    
    /**
     * Get the creep that is blocking our path to target
     */
    getBlockingCreep(creep, targetPos) {
        // Look for creeps on our target position
        const creepsAtTarget = targetPos.lookFor(LOOK_CREEPS);
        if (creepsAtTarget.length > 0) {
            return creepsAtTarget[0];
        }
        
        // Look for creeps in the way
        const path = creep.pos.findPathTo(targetPos, {
            ignoreCreeps: false,
            range: 0
        });
        
        if (path.length > 0) {
            const nextPos = new RoomPosition(path[0].x, path[0].y, creep.room.name);
            const creepsAtNext = nextPos.lookFor(LOOK_CREEPS);
            if (creepsAtNext.length > 0) {
                return creepsAtNext[0];
            }
        }
        
        return null;
    }
    
    /**
     * Request a creep to move out of the way
     */
    requestCreepToMove(blockingCreep, requestingCreep) {
        // Only non-harvesters should be asked to move
        if (blockingCreep.memory.role === 'harvester') {
            return; // Another harvester, both should find different positions
        }
        
        // Set memory flag for blocking creep to move
        if (!blockingCreep.memory.moveRequest) {
            blockingCreep.memory.moveRequest = {
                fromX: requestingCreep.pos.x,
                fromY: requestingCreep.pos.y,
                time: Game.time
            };
            blockingCreep.say('🚶 ok!');
        }
    }
    
    /**
     * Push a creep out of the way (more forceful)
     */
    pushCreep(blockingCreep, pushingCreep) {
        // Calculate direction away from pushing creep
        const dx = blockingCreep.pos.x - pushingCreep.pos.x;
        const dy = blockingCreep.pos.y - pushingCreep.pos.y;
        
        // Normalize to -1, 0, or 1
        const dirX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
        const dirY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
        
        // Try to move in the opposite direction
        const targetX = blockingCreep.pos.x + dirX;
        const targetY = blockingCreep.pos.y + dirY;
        
        if (targetX >= 0 && targetX <= 49 && targetY >= 0 && targetY <= 49) {
            const pos = new RoomPosition(targetX, targetY, blockingCreep.room.name);
            const terrain = pos.lookFor(LOOK_TERRAIN);
            
            if (terrain[0] !== 'wall') {
                const structures = pos.lookFor(LOOK_STRUCTURES);
                const creeps = pos.lookFor(LOOK_CREEPS);
                
                if (structures.length === 0 && creeps.length === 0) {
                    blockingCreep.moveTo(pos);
                    blockingCreep.say('😓 moved');
                }
            }
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

/**
 * Runner - Transports energy from dropped locations to spawn/extensions
 * Used in stationary harvesting mode to move energy from harvester drops to storage
 */
class Runner {
    run(creep) {
        // Check if a harvester requested us to move
        if (creep.memory.moveRequest) {
            const timeSinceRequest = Game.time - creep.memory.moveRequest.time;
            if (timeSinceRequest < 5) {
                // Move away from the harvester
                this.moveAway(creep, creep.memory.moveRequest.fromX, creep.memory.moveRequest.fromY);
                creep.say('🚶 moving');
                return;
            } else {
                // Request expired
                delete creep.memory.moveRequest;
            }
        }
        
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
    
    /**
     * Move away from a position (called when harvester needs the spot)
     */
    moveAway(creep, fromX, fromY) {
        // Calculate direction away from the position
        const dx = creep.pos.x - fromX;
        const dy = creep.pos.y - fromY;
        
        // Normalize to -1, 0, or 1
        const dirX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
        const dirY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
        
        // Try to move in the opposite direction
        const targetX = creep.pos.x + dirX;
        const targetY = creep.pos.y + dirY;
        
        if (targetX >= 0 && targetX <= 49 && targetY >= 0 && targetY <= 49) {
            const pos = new RoomPosition(targetX, targetY, creep.room.name);
            const terrain = pos.lookFor(LOOK_TERRAIN);
            
            if (terrain[0] !== 'wall') {
                const structures = pos.lookFor(LOOK_STRUCTURES);
                const creeps = pos.lookFor(LOOK_CREEPS);
                
                if (structures.length === 0 && creeps.length === 0) {
                    creep.moveTo(pos);
                    return;
                }
            }
        }
        
        // If can't move away directly, try random adjacent position
        const directions = [
            {x: 0, y: -1}, {x: 1, y: -1}, {x: 1, y: 0}, {x: 1, y: 1},
            {x: 0, y: 1}, {x: -1, y: 1}, {x: -1, y: 0}, {x: -1, y: -1}
        ];
        
        for (const dir of directions) {
            const newX = creep.pos.x + dir.x;
            const newY = creep.pos.y + dir.y;
            
            if (newX >= 0 && newX <= 49 && newY >= 0 && newY <= 49) {
                const pos = new RoomPosition(newX, newY, creep.room.name);
                const terrain = pos.lookFor(LOOK_TERRAIN);
                
                if (terrain[0] !== 'wall') {
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const creeps = pos.lookFor(LOOK_CREEPS);
                    
                    if (structures.length === 0 && creeps.length === 0) {
                        creep.moveTo(pos);
                        return;
                    }
                }
            }
        }
    }

    collectEnergy(creep) {
        // Priority 1: Containers at sources (Phase 4+)
        const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
        });
        
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            }
            return;
        }
        
        // Priority 2: Dropped energy near sources (from stationary harvesters)
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

/**
 * Upgrader - Mines energy and upgrades controller
 * Priority: Self-mining (always) > Dropped energy (if available) > Containers/Storage
 * NEVER takes from spawn - upgraders are self-sufficient
 */
class Upgrader {
    run(creep) {
        // Check if a harvester requested us to move
        if (creep.memory.moveRequest) {
            const timeSinceRequest = Game.time - creep.memory.moveRequest.time;
            if (timeSinceRequest < 5) {
                // Move away from the harvester
                this.moveAway(creep, creep.memory.moveRequest.fromX, creep.memory.moveRequest.fromY);
                creep.say('🚶 moving');
                return;
            } else {
                // Request expired
                delete creep.memory.moveRequest;
            }
        }

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

    /**
     * Move away from a position (called when harvester needs the spot)
     */
    moveAway(creep, fromX, fromY) {
        // Calculate direction away from the position
        const dx = creep.pos.x - fromX;
        const dy = creep.pos.y - fromY;

        // Normalize to -1, 0, or 1
        const dirX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
        const dirY = dy > 0 ? 1 : dy < 0 ? -1 : 0;

        // Try to move in the opposite direction
        const targetX = creep.pos.x + dirX;
        const targetY = creep.pos.y + dirY;

        if (targetX >= 0 && targetX <= 49 && targetY >= 0 && targetY <= 49) {
            const pos = new RoomPosition(targetX, targetY, creep.room.name);
            const terrain = pos.lookFor(LOOK_TERRAIN);

            if (terrain[0] !== 'wall') {
                const structures = pos.lookFor(LOOK_STRUCTURES);
                const creeps = pos.lookFor(LOOK_CREEPS);

                if (structures.length === 0 && creeps.length === 0) {
                    creep.moveTo(pos);
                    return;
                }
            }
        }

        // If can't move away directly, try random adjacent position
        const directions = [
            {x: 0, y: -1}, {x: 1, y: -1}, {x: 1, y: 0}, {x: 1, y: 1},
            {x: 0, y: 1}, {x: -1, y: 1}, {x: -1, y: 0}, {x: -1, y: -1}
        ];

        for (const dir of directions) {
            const newX = creep.pos.x + dir.x;
            const newY = creep.pos.y + dir.y;

            if (newX >= 0 && newX <= 49 && newY >= 0 && newY <= 49) {
                const pos = new RoomPosition(newX, newY, creep.room.name);
                const terrain = pos.lookFor(LOOK_TERRAIN);

                if (terrain[0] !== 'wall') {
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const creeps = pos.lookFor(LOOK_CREEPS);

                    if (structures.length === 0 && creeps.length === 0) {
                        creep.moveTo(pos);
                        return;
                    }
                }
            }
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

/**
 * Builder - Builds construction sites
 * Priority: Dropped energy > Containers/Storage > Self-mining
 * Idle behavior: Upgrades controller
 * NEVER takes from spawn - keeps spawn energy for creep spawning
 */
class Builder {
    run(creep) {
        // Check if a harvester requested us to move
        if (creep.memory.moveRequest) {
            const timeSinceRequest = Game.time - creep.memory.moveRequest.time;
            if (timeSinceRequest < 5) {
                // Move away from the harvester
                this.moveAway(creep, creep.memory.moveRequest.fromX, creep.memory.moveRequest.fromY);
                creep.say('🚶 moving');
                return;
            } else {
                // Request expired
                delete creep.memory.moveRequest;
            }
        }
        
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
    
    /**
     * Move away from a position (called when harvester needs the spot)
     */
    moveAway(creep, fromX, fromY) {
        // Calculate direction away from the position
        const dx = creep.pos.x - fromX;
        const dy = creep.pos.y - fromY;
        
        // Normalize to -1, 0, or 1
        const dirX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
        const dirY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
        
        // Try to move in the opposite direction
        const targetX = creep.pos.x + dirX;
        const targetY = creep.pos.y + dirY;
        
        if (targetX >= 0 && targetX <= 49 && targetY >= 0 && targetY <= 49) {
            const pos = new RoomPosition(targetX, targetY, creep.room.name);
            const terrain = pos.lookFor(LOOK_TERRAIN);
            
            if (terrain[0] !== 'wall') {
                const structures = pos.lookFor(LOOK_STRUCTURES);
                const creeps = pos.lookFor(LOOK_CREEPS);
                
                if (structures.length === 0 && creeps.length === 0) {
                    creep.moveTo(pos);
                    return;
                }
            }
        }
        
        // If can't move away directly, try random adjacent position
        const directions = [
            {x: 0, y: -1}, {x: 1, y: -1}, {x: 1, y: 0}, {x: 1, y: 1},
            {x: 0, y: 1}, {x: -1, y: 1}, {x: -1, y: 0}, {x: -1, y: -1}
        ];
        
        for (const dir of directions) {
            const newX = creep.pos.x + dir.x;
            const newY = creep.pos.y + dir.y;
            
            if (newX >= 0 && newX <= 49 && newY >= 0 && newY <= 49) {
                const pos = new RoomPosition(newX, newY, creep.room.name);
                const terrain = pos.lookFor(LOOK_TERRAIN);
                
                if (terrain[0] !== 'wall') {
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const creeps = pos.lookFor(LOOK_CREEPS);
                    
                    if (structures.length === 0 && creeps.length === 0) {
                        creep.moveTo(pos);
                        return;
                    }
                }
            }
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
        // Find construction sites - prioritize defensive structures
        const sites = creep.room.find(FIND_CONSTRUCTION_SITES);
        
        if (sites.length > 0) {
            // Sort by priority: towers, ramparts, walls, then extensions/storage
            const target = this.findPrioritySite(creep, sites);
            
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
                return;
            }
        }
        
        // No construction sites - repair roads, containers, or defense structures
        const didRepair = this.repair(creep);
        
        // If nothing to repair either, upgrade controller as idle behavior
        if (!didRepair) {
            this.upgradeController(creep);
        }
    }

    findPrioritySite(creep, sites) {
        // Priority order for construction:
        // 1. Towers (defense)
        // 2. Ramparts (defense)
        // 3. Walls (defense)
        // 4. Extensions (capacity)
        // 5. Storage (logistics)
        // 6. Other
        
        const priorityOrder = [
            STRUCTURE_TOWER,
            STRUCTURE_RAMPART,
            STRUCTURE_WALL,
            STRUCTURE_EXTENSION,
            STRUCTURE_STORAGE,
            STRUCTURE_LINK,
            STRUCTURE_CONTAINER,
            STRUCTURE_ROAD
        ];
        
        // Group sites by structure type
        const grouped = {};
        for (const site of sites) {
            if (!grouped[site.structureType]) {
                grouped[site.structureType] = [];
            }
            grouped[site.structureType].push(site);
        }
        
        // Check in priority order
        for (const structureType of priorityOrder) {
            if (grouped[structureType] && grouped[structureType].length > 0) {
                // Find closest of this type
                return creep.pos.findClosestByPath(grouped[structureType]);
            }
        }
        
        // Default to closest
        return creep.pos.findClosestByPath(sites);
    }

    repair(creep) {
        // Priority 1: Repair defense structures (ramparts, walls)
        const defense = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: (s) => (s.structureType === STRUCTURE_RAMPART ||
                          s.structureType === STRUCTURE_WALL) &&
                          s.hits < s.hitsMax
        });

        if (defense) {
            if (creep.repair(defense) === ERR_NOT_IN_RANGE) {
                creep.moveTo(defense);
            }
            return true; // Found something to repair
        }
        
        // Priority 2: Repair roads and containers
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

/**
 * Repairer - Repairs structures (roads, containers, ramparts, walls)
 * Priority: Dropped energy > Containers/Storage > Self-mining
 * Idle behavior: Upgrades controller
 * NEVER takes from spawn - keeps spawn energy for creep spawning
 */
class Repairer {
    run(creep) {
        // Check if a harvester requested us to move
        if (creep.memory.moveRequest) {
            const timeSinceRequest = Game.time - creep.memory.moveRequest.time;
            if (timeSinceRequest < 5) {
                // Move away from the harvester
                this.moveAway(creep, creep.memory.moveRequest.fromX, creep.memory.moveRequest.fromY);
                creep.say('🚶 moving');
                return;
            } else {
                // Request expired
                delete creep.memory.moveRequest;
            }
        }
        
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
    
    /**
     * Move away from a position (called when harvester needs the spot)
     */
    moveAway(creep, fromX, fromY) {
        // Calculate direction away from the position
        const dx = creep.pos.x - fromX;
        const dy = creep.pos.y - fromY;
        
        // Normalize to -1, 0, or 1
        const dirX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
        const dirY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
        
        // Try to move in the opposite direction
        const targetX = creep.pos.x + dirX;
        const targetY = creep.pos.y + dirY;
        
        if (targetX >= 0 && targetX <= 49 && targetY >= 0 && targetY <= 49) {
            const pos = new RoomPosition(targetX, targetY, creep.room.name);
            const terrain = pos.lookFor(LOOK_TERRAIN);
            
            if (terrain[0] !== 'wall') {
                const structures = pos.lookFor(LOOK_STRUCTURES);
                const creeps = pos.lookFor(LOOK_CREEPS);
                
                if (structures.length === 0 && creeps.length === 0) {
                    creep.moveTo(pos);
                    return;
                }
            }
        }
        
        // If can't move away directly, try random adjacent position
        const directions = [
            {x: 0, y: -1}, {x: 1, y: -1}, {x: 1, y: 0}, {x: 1, y: 1},
            {x: 0, y: 1}, {x: -1, y: 1}, {x: -1, y: 0}, {x: -1, y: -1}
        ];
        
        for (const dir of directions) {
            const newX = creep.pos.x + dir.x;
            const newY = creep.pos.y + dir.y;
            
            if (newX >= 0 && newX <= 49 && newY >= 0 && newY <= 49) {
                const pos = new RoomPosition(newX, newY, creep.room.name);
                const terrain = pos.lookFor(LOOK_TERRAIN);
                
                if (terrain[0] !== 'wall') {
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const creeps = pos.lookFor(LOOK_CREEPS);
                    
                    if (structures.length === 0 && creeps.length === 0) {
                        creep.moveTo(pos);
                        return;
                    }
                }
            }
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

/**
 * RemoteHarvester - Mines energy from sources in remote rooms
 * Travels to target room, builds a container near source, and mines
 * Places energy in container for haulers to collect
 */
class RemoteHarvester {
    run(creep) {
        // Initialize if needed
        if (!creep.memory.remoteRoom) {
            this.assignRemoteRoom(creep);
        }
        
        // State management
        if (creep.memory.buildingContainer && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.buildingContainer = false;
        }
        if (!creep.memory.buildingContainer && creep.store.getFreeCapacity() === 0) {
            // Check if we need to build container first
            if (!creep.memory.containerBuilt) {
                creep.memory.buildingContainer = true;
            }
        }
        
        // If in home room, travel to remote room
        if (creep.room.name !== creep.memory.remoteRoom) {
            this.travelToRemoteRoom(creep);
            return;
        }
        
        // In remote room
        if (creep.memory.buildingContainer && !creep.memory.containerBuilt) {
            this.buildContainer(creep);
        } else {
            this.harvestAndStore(creep);
        }
    }
    
    assignRemoteRoom(creep) {
        // Get remote mining assignments from room memory
        const homeRoom = Game.rooms[creep.memory.homeRoom];
        if (!homeRoom) return;
        
        const remoteAssignments = homeRoom.memory.remoteAssignments || {};
        
        // Find an unassigned source
        for (const roomName in remoteAssignments) {
            const sources = remoteAssignments[roomName];
            for (const sourceId in sources) {
                if (!sources[sourceId].harvester) {
                    creep.memory.remoteRoom = roomName;
                    creep.memory.sourceId = sourceId;
                    sources[sourceId].harvester = creep.name;
                    return;
                }
            }
        }
        
        // No assignment found
        creep.say('❌ no assign');
    }
    
    travelToRemoteRoom(creep) {
        const remoteRoom = creep.memory.remoteRoom;
        if (!remoteRoom) return;
        
        // Move to exit
        const exitDir = Game.map.findExit(creep.room, remoteRoom);
        if (exitDir === ERR_NO_PATH) {
            creep.say('❌ no path');
            return;
        }
        
        const exit = creep.pos.findClosestByPath(exitDir);
        if (exit) {
            creep.moveTo(exit, {
                visualizePathStyle: { stroke: '#ffaa00' }
            });
        }
    }
    
    buildContainer(creep) {
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) {
            // Try to find source in room
            const sources = creep.room.find(FIND_SOURCES);
            if (sources.length > 0) {
                // Find closest to memory position
                const targetSource = sources.find(s => s.id === creep.memory.sourceId);
                if (targetSource) {
                    this.constructContainer(creep, targetSource);
                }
            }
            return;
        }
        
        this.constructContainer(creep, source);
    }
    
    constructContainer(creep, source) {
        // Check if container already exists near source
        const containers = source.pos.findInRange(FIND_STRUCTURES, 2, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        
        if (containers.length > 0) {
            creep.memory.containerBuilt = true;
            creep.memory.containerId = containers[0].id;
            return;
        }
        
        // Check for construction site
        const sites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        
        if (sites.length > 0) {
            // Build existing site
            if (creep.store[RESOURCE_ENERGY] > 0) {
                if (creep.build(sites[0]) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(sites[0]);
                }
            } else {
                // Need energy - harvest from source
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source);
                }
            }
        } else {
            // Create construction site
            // Find best position near source
            const pos = this.findContainerPosition(source);
            if (pos) {
                const result = pos.createConstructionSite(STRUCTURE_CONTAINER);
                if (result === OK) {
                    creep.say('📦 container');
                }
            }
        }
    }
    
    findContainerPosition(source) {
        const room = source.room;
        const terrain = room.getTerrain();
        
        // Find position adjacent to source with no walls
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                
                const x = source.pos.x + dx;
                const y = source.pos.y + dy;
                
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    const pos = new RoomPosition(x, y, room.name);
                    // Check for existing structures
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    if (structures.length === 0) {
                        return pos;
                    }
                }
            }
        }
        
        return null;
    }
    
    harvestAndStore(creep) {
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) {
            creep.say('❌ no source');
            return;
        }
        
        // Get container
        let container = Game.getObjectById(creep.memory.containerId);
        
        // If container doesn't exist, try to find it
        if (!container) {
            const containers = source.pos.findInRange(FIND_STRUCTURES, 2, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            });
            if (containers.length > 0) {
                container = containers[0];
                creep.memory.containerId = container.id;
            } else {
                // Need to build container
                creep.memory.buildingContainer = true;
                creep.memory.containerBuilt = false;
                return;
            }
        }
        
        // If full, repair container if needed
        if (creep.store.getFreeCapacity() === 0) {
            if (container.hits < container.hitsMax * 0.8) {
                if (creep.repair(container) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(container);
                }
            }
            return;
        }
        
        // Harvest
        const result = creep.harvest(source);
        
        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(source);
        } else if (result === OK) {
            // Drop energy into container
            if (creep.store.getFreeCapacity() === 0) {
                const energy = creep.store[RESOURCE_ENERGY];
                creep.drop(RESOURCE_ENERGY);
                creep.say('💧 ' + energy);
            }
        } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
            // Source empty, wait
            creep.say('⏳ wait');
        }
    }
}

/**
 * Hauler - Transports energy from remote rooms to home room
 * Collects from containers built by RemoteHarvesters
 * Delivers to home room storage or spawn
 */
class Hauler {
    run(creep) {
        // Initialize if needed
        if (!creep.memory.remoteRoom) {
            this.assignRemoteRoom(creep);
        }
        
        // State management
        if (creep.memory.collecting && creep.store.getFreeCapacity() === 0) {
            creep.memory.collecting = false;
            creep.say('🏠 deliver');
        }
        if (!creep.memory.collecting && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.collecting = true;
            creep.say('📦 collect');
        }
        
        if (creep.memory.collecting) {
            this.collectEnergy(creep);
        } else {
            this.deliverEnergy(creep);
        }
    }
    
    assignRemoteRoom(creep) {
        const homeRoom = Game.rooms[creep.memory.homeRoom];
        if (!homeRoom) return;
        
        const remoteAssignments = homeRoom.memory.remoteAssignments || {};
        
        // Find a remote room that needs a hauler
        for (const roomName in remoteAssignments) {
            const sources = remoteAssignments[roomName];
            let needsHauler = false;
            
            for (const sourceId in sources) {
                if (sources[sourceId].harvester && !sources[sourceId].hauler) {
                    needsHauler = true;
                    break;
                }
            }
            
            if (needsHauler) {
                creep.memory.remoteRoom = roomName;
                // Assign to first source that needs a hauler
                for (const sourceId in sources) {
                    if (sources[sourceId].harvester && !sources[sourceId].hauler) {
                        creep.memory.sourceId = sourceId;
                        creep.memory.containerId = sources[sourceId].containerId;
                        sources[sourceId].hauler = creep.name;
                        return;
                    }
                }
            }
        }
        
        creep.say('❌ no assign');
    }
    
    collectEnergy(creep) {
        // If in home room, travel to remote room
        if (creep.room.name !== creep.memory.remoteRoom) {
            this.travelToRoom(creep, creep.memory.remoteRoom);
            return;
        }
        
        // In remote room - collect from container
        const container = Game.getObjectById(creep.memory.containerId);
        
        if (!container) {
            // Try to find container
            const source = Game.getObjectById(creep.memory.sourceId);
            if (source) {
                const containers = source.pos.findInRange(FIND_STRUCTURES, 2, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER
                });
                if (containers.length > 0) {
                    creep.memory.containerId = containers[0].id;
                    this.withdrawFromContainer(creep, containers[0]);
                } else {
                    creep.say('❌ no container');
                }
            }
            return;
        }
        
        this.withdrawFromContainer(creep, container);
    }
    
    withdrawFromContainer(creep, container) {
        // Check if container has energy
        if (container.store[RESOURCE_ENERGY] <= 0) {
            // Wait for energy
            creep.say('⏳ wait');
            return;
        }
        
        // Withdraw energy
        const result = creep.withdraw(container, RESOURCE_ENERGY);
        
        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(container, {
                visualizePathStyle: { stroke: '#ffaa00' }
            });
        } else if (result === OK) {
            // Continue withdrawing until full
            if (creep.store.getFreeCapacity() > 0 && container.store[RESOURCE_ENERGY] > 0) {
                // Will continue next tick
            } else {
                creep.memory.collecting = false;
                creep.say('🏠 deliver');
            }
        }
    }
    
    deliverEnergy(creep) {
        // If in remote room, travel home
        if (creep.room.name === creep.memory.remoteRoom) {
            this.travelToRoom(creep, creep.memory.homeRoom);
            return;
        }
        
        // In home room - deliver energy
        const homeRoom = Game.rooms[creep.memory.homeRoom];
        if (!homeRoom) {
            // Wait until we get to home room
            return;
        }
        
        // Find delivery target
        const target = this.findDeliveryTarget(homeRoom, creep);
        
        if (target) {
            const result = creep.transfer(target, RESOURCE_ENERGY);
            
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: '#ffffff' }
                });
            } else if (result === OK) {
                if (creep.store[RESOURCE_ENERGY] === 0) {
                    creep.memory.collecting = true;
                    creep.say('📦 collect');
                }
            }
        } else {
            // No target - wait near spawn
            const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
            if (spawn) {
                creep.moveTo(spawn, { range: 3 });
            }
        }
    }
    
    findDeliveryTarget(room, creep) {
        // Priority: Storage > Extensions > Spawn > Container
        
        const storage = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_STORAGE &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        })[0];
        if (storage) return storage;
        
        const extensions = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (extensions.length > 0) {
            return creep.pos.findClosestByPath(extensions);
        }
        
        const spawn = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_SPAWN &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        })[0];
        if (spawn) return spawn;
        
        const containers = room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (containers.length > 0) {
            return creep.pos.findClosestByPath(containers);
        }
        
        return null;
    }
    
    travelToRoom(creep, roomName) {
        const exitDir = Game.map.findExit(creep.room, roomName);
        if (exitDir === ERR_NO_PATH) {
            creep.say('❌ no path');
            return;
        }
        
        // Use RoomPosition to find path to target room
        const route = Game.map.findRoute(creep.room.name, roomName);
        if (route !== ERR_NO_PATH && route.length > 0) {
            const exit = creep.pos.findClosestByPath(route[0].exit);
            if (exit) {
                creep.moveTo(exit, {
                    visualizePathStyle: { stroke: '#00ff00' }
                });
            }
        }
    }
}

/**
 * Claimer - Reserves controller in remote rooms to prevent decay
 * Travels to target room and reserves controller
 * Returns home when TTL is low to be recycled
 */
class Claimer {
    run(creep) {
        // Initialize if needed
        if (!creep.memory.targetRoom) {
            this.assignTargetRoom(creep);
        }
        
        // Check TTL - return home if low
        if (creep.ticksToLive <= 100 && creep.room.name !== creep.memory.homeRoom) {
            this.travelHome(creep);
            return;
        }
        
        // Check if we need to travel to target room
        if (creep.room.name !== creep.memory.targetRoom) {
            this.travelToRoom(creep, creep.memory.targetRoom);
            return;
        }
        
        // In target room - reserve controller
        const controller = creep.room.controller;
        
        if (!controller) {
            creep.say('❌ no ctrl');
            return;
        }
        
        // Reserve controller
        const result = creep.reserveController(controller);
        
        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller, {
                visualizePathStyle: { stroke: '#ffaa00' }
            });
        } else if (result === OK) {
            creep.say('🔒 reserved');
        } else if (result === ERR_INVALID_TARGET) {
            // Controller might be owned by someone else
            creep.say('❌ owned');
        } else if (result === ERR_NO_BODYPART) {
            // No claim parts
            creep.say('❌ no parts');
        }
    }
    
    assignTargetRoom(creep) {
        const homeRoom = Game.rooms[creep.memory.homeRoom];
        if (!homeRoom) return;
        
        const remoteRooms = homeRoom.memory.remoteRooms || [];
        const assignments = homeRoom.memory.claimerAssignments || {};
        
        // Find unclaimed room
        for (const roomName of remoteRooms) {
            if (!assignments[roomName]) {
                creep.memory.targetRoom = roomName;
                assignments[roomName] = creep.name;
                homeRoom.memory.claimerAssignments = assignments;
                
                // Update status
                if (!homeRoom.memory.remoteAssignments) {
                    homeRoom.memory.remoteAssignments = {};
                }
                if (!homeRoom.memory.remoteAssignments[roomName]) {
                    homeRoom.memory.remoteAssignments[roomName] = {};
                }
                homeRoom.memory.remoteAssignments[roomName].claimer = creep.name;
                return;
            }
        }
        
        // Check if existing claimer needs replacement
        for (const roomName in assignments) {
            const claimerName = assignments[roomName];
            const claimer = Game.creeps[claimerName];
            if (!claimer || claimer.ticksToLive < 100) {
                // Replace this claimer
                creep.memory.targetRoom = roomName;
                assignments[roomName] = creep.name;
                homeRoom.memory.claimerAssignments = assignments;
                
                if (homeRoom.memory.remoteAssignments[roomName]) {
                    homeRoom.memory.remoteAssignments[roomName].claimer = creep.name;
                }
                return;
            }
        }
        
        creep.say('❌ no assign');
    }
    
    travelToRoom(creep, roomName) {
        const route = Game.map.findRoute(creep.room.name, roomName);
        
        if (route === ERR_NO_PATH) {
            creep.say('❌ no path');
            return;
        }
        
        if (route.length > 0) {
            const exit = creep.pos.findClosestByPath(route[0].exit);
            if (exit) {
                creep.moveTo(exit, {
                    visualizePathStyle: { stroke: '#ff00ff' }
                });
            }
        }
    }
    
    travelHome(creep) {
        if (creep.room.name === creep.memory.homeRoom) {
            // Suicide to recycle
            const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
            if (spawn) {
                if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(spawn);
                }
            }
            return;
        }
        
        this.travelToRoom(creep, creep.memory.homeRoom);
        creep.say('🏠 home');
    }
}

/**
 * Defender - Protects room from hostile creeps
 * Automatically spawned when enemies are detected in the room
 * Targets hostile creeps, prioritizing healers and dangerous units
 */
class Defender {
    run(creep) {
        // Check if we're under attack
        if (!this.isRoomUnderAttack(creep.room)) {
            // No enemies - move to rally point near spawn or recycle
            this.moveToRallyPoint(creep);
            return;
        }

        // Find and attack hostile creeps
        const target = this.findPriorityTarget(creep);
        
        if (target) {
            this.engageTarget(creep, target);
        } else {
            // No visible hostiles but attack timer active - patrol
            this.patrolRoom(creep);
        }
    }

    /**
     * Check if room is currently under attack
     */
    isRoomUnderAttack(room) {
        // Check memory for attack timer
        if (room.memory.attackTimer > 0) {
            return true;
        }
        
        // Check for hostile creeps
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            // Set attack timer (decrements in RoomManager)
            room.memory.attackTimer = 20; // 20 ticks of alert after last seen
            return true;
        }
        
        return false;
    }

    /**
     * Find priority target for attack
     * Priority: Healers > Ranged attackers > Melee attackers > Workers
     */
    findPriorityTarget(creep) {
        const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        
        if (hostiles.length === 0) {
            return null;
        }

        // Score each hostile by threat level
        const scored = hostiles.map(hostile => {
            let score = 0;
            
            // Check body parts
            const body = hostile.body;
            const healParts = body.filter(p => p.type === HEAL).length;
            const rangedParts = body.filter(p => p.type === RANGED_ATTACK).length;
            const attackParts = body.filter(p => p.type === ATTACK).length;
            const workParts = body.filter(p => p.type === WORK).length;
            
            // Prioritize by threat (higher score = higher priority)
            if (healParts > 0) score += 100 + healParts * 10; // Healers are top priority
            if (rangedParts > 0) score += 50 + rangedParts * 5; // Ranged attackers
            if (attackParts > 0) score += 30 + attackParts * 3; // Melee attackers
            if (workParts > 0) score += 10; // Workers/collectors
            
            // Prefer closer targets slightly
            const range = creep.pos.getRangeTo(hostile);
            score -= range * 0.5;
            
            return { hostile, score };
        });
        
        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);
        
        return scored[0].hostile;
    }

    /**
     * Engage a target in combat
     */
    engageTarget(creep, target) {
        const range = creep.pos.getRangeTo(target);
        
        // If we're damaged and not at full health, check if we should retreat
        if (creep.hits < creep.hitsMax * 0.5) {
            // Retreat to heal if possible
            this.retreatIfPossible(creep, target);
            return;
        }
        
        if (range <= 1) {
            // Adjacent - attack
            creep.attack(target);
            creep.say('⚔️ attack');
        } else {
            // Move closer
            const result = creep.moveTo(target, {
                visualizePathStyle: { stroke: '#ff0000' },
                reusePath: 3
            });
            
            // Try to attack if in range (might have moved)
            if (creep.pos.getRangeTo(target) <= 1) {
                creep.attack(target);
            }
        }
    }

    /**
     * Retreat to a safer position if possible
     */
    retreatIfPossible(creep, threat) {
        // Find direction away from threat
        const dx = creep.pos.x - threat.pos.x;
        const dy = creep.pos.y - threat.pos.y;
        
        // Calculate retreat position
        let retreatX = creep.pos.x + Math.sign(dx) * 2;
        let retreatY = creep.pos.y + Math.sign(dy) * 2;
        
        // Clamp to room bounds
        retreatX = Math.max(1, Math.min(48, retreatX));
        retreatY = Math.max(1, Math.min(48, retreatY));
        
        const retreatPos = new RoomPosition(retreatX, retreatY, creep.room.name);
        
        // Check if retreat position is safe (no hostiles adjacent)
        const hostilesAtRetreat = retreatPos.findInRange(FIND_HOSTILE_CREEPS, 1);
        
        if (hostilesAtRetreat.length === 0) {
            // Safe to retreat
            creep.moveTo(retreatPos, {
                visualizePathStyle: { stroke: '#ffff00' }
            });
            creep.say('🏃 retreat');
            
            // Self-heal if we have heal parts
            if (creep.body.some(p => p.type === HEAL && p.hits > 0)) {
                creep.heal(creep);
            }
        } else {
            // Can't retreat safely, fight on
            if (creep.pos.getRangeTo(threat) <= 1) {
                creep.attack(threat);
            }
        }
    }

    /**
     * Move to rally point when no enemies present
     */
    moveToRallyPoint(creep) {
        const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
        if (spawn) {
            // Stay near spawn but not on top of it
            if (!creep.pos.inRangeTo(spawn, 3)) {
                creep.moveTo(spawn, {
                    range: 3,
                    visualizePathStyle: { stroke: '#00ff00' }
                });
            } else {
                // At rally point - heal up if damaged
                if (creep.hits < creep.hitsMax && 
                    creep.body.some(p => p.type === HEAL && p.hits > 0)) {
                    creep.heal(creep);
                }
            }
        }
    }

    /**
     * Patrol room when attack timer active but no visible enemies
     */
    patrolRoom(creep) {
        const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
        if (spawn) {
            // Move between spawn and controller
            const controller = creep.room.controller;
            if (controller) {
                const target = creep.pos.getRangeTo(spawn) > creep.pos.getRangeTo(controller) 
                    ? spawn 
                    : controller;
                
                creep.moveTo(target, {
                    range: 5,
                    visualizePathStyle: { stroke: '#00ff00' }
                });
            }
        }
    }
}

/**
 * Attacker - Part of attack squads (3 attackers + 1 healer)
 * Travels to enemy rooms and destroys structures/spawn
 * Coordinates with squad members - waits until full group before attacking
 */
class Attacker {
    run(creep) {
        // Check if we're part of a squad
        if (!creep.memory.squadId) {
            creep.say('❌ no squad');
            return;
        }

        // Get squad info
        const squad = Memory.attackSquads[creep.memory.squadId];
        if (!squad) {
            // Squad doesn't exist, try to find a new one
            this.findNewSquad(creep);
            return;
        }

        // Check if squad is ready (all 4 members spawned)
        if (!squad.ready) {
            this.waitForSquad(creep, squad);
            return;
        }

        // Squad is ready - proceed with attack
        this.executeAttack(creep, squad);
    }

    /**
     * Find a new squad to join
     */
    findNewSquad(creep) {
        // Look for squads needing attackers
        for (const squadId in Memory.attackSquads) {
            const squad = Memory.attackSquads[squadId];
            if (squad.members.attackers.length < 3) {
                // Join this squad
                creep.memory.squadId = squadId;
                squad.members.attackers.push(creep.name);
                creep.say('🎖️ joined');
                return;
            }
        }

        // No squad found - wait
        creep.say('⏳ waiting');
    }

    /**
     * Wait for full squad to form near spawn
     */
    waitForSquad(creep, squad) {
        // Move to spawn
        const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
        if (!spawn) return;

        // Stay near spawn
        if (!creep.pos.inRangeTo(spawn, 3)) {
            creep.moveTo(spawn, { range: 3 });
            return;
        }

        // Count current squad members present
        const presentAttackers = squad.members.attackers.filter(name => {
            const otherCreep = Game.creeps[name];
            return otherCreep && otherCreep.room.name === creep.room.name;
        });

        const presentHealers = squad.members.healers.filter(name => {
            const otherCreep = Game.creeps[name];
            return otherCreep && otherCreep.room.name === creep.room.name;
        });

        // Check if full squad is ready
        if (presentAttackers.length >= 3 && presentHealers.length >= 1) {
            squad.ready = true;
            console.log(`🎖️ Squad ${creep.memory.squadId} is ready to attack ${squad.targetRoom}!`);
            
            // Notify all squad members
            for (const name of [...squad.members.attackers, ...squad.members.healers]) {
                const otherCreep = Game.creeps[name];
                if (otherCreep) {
                    otherCreep.say('⚔️ CHARGE!');
                }
            }
        } else {
            // Show waiting status
            creep.say(`⏳ ${presentAttackers.length}/3A ${presentHealers.length}/1H`);
        }
    }

    /**
     * Execute attack on target room
     */
    executeAttack(creep, squad) {
        // Check if we need to retreat
        if (this.shouldRetreat(creep)) {
            this.retreat(creep, squad);
            return;
        }

        // Travel to target room
        if (creep.room.name !== squad.targetRoom) {
            this.travelToTarget(creep, squad.targetRoom);
            return;
        }

        // In target room - find something to attack
        const target = this.findAttackTarget(creep, squad);
        
        if (target) {
            this.attackTarget(creep, target);
        } else {
            // Nothing to attack - maybe room is cleared
            this.handleRoomCleared(creep, squad);
        }
    }

    /**
     * Determine if creep should retreat
     */
    shouldRetreat(creep) {
        // Retreat if heavily damaged
        if (creep.hits < creep.hitsMax * 0.3) {
            return true;
        }

        // Retreat if no healer nearby and damaged
        if (creep.hits < creep.hitsMax * 0.6) {
            const healerNearby = this.findNearbyHealer(creep);
            if (!healerNearby) {
                return true;
            }
        }

        // Retreat if surrounded by enemies
        const nearbyHostiles = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 2);
        if (nearbyHostiles.length >= 3) {
            return true;
        }

        return false;
    }

    /**
     * Find a nearby healer from our squad
     */
    findNearbyHealer(creep) {
        const squad = Memory.attackSquads[creep.memory.squadId];
        if (!squad) return null;

        for (const healerName of squad.members.healers) {
            const healer = Game.creeps[healerName];
            if (healer && healer.room.name === creep.room.name) {
                const range = creep.pos.getRangeTo(healer);
                if (range <= 3) {
                    return healer;
                }
            }
        }

        return null;
    }

    /**
     * Retreat to safer position
     */
    retreat(creep, squad) {
        // Try to move toward a healer or exit
        const healer = this.findNearbyHealer(creep);
        
        if (healer) {
            creep.moveTo(healer, {
                visualizePathStyle: { stroke: '#ffff00' }
            });
            creep.say('🏃 to healer');
        } else {
            // Retreat toward exit
            const exit = creep.pos.findClosestByRange(FIND_EXIT);
            if (exit) {
                creep.moveTo(exit, {
                    visualizePathStyle: { stroke: '#ffff00' }
                });
                creep.say('🏃 retreat');
            }
        }

        // Self-heal if we have heal parts
        if (creep.body.some(p => p.type === HEAL && p.hits > 0)) {
            creep.heal(creep);
        }
    }

    /**
     * Travel to target room
     */
    travelToTarget(creep, targetRoom) {
        const route = Game.map.findRoute(creep.room.name, targetRoom);
        
        if (route === ERR_NO_PATH) {
            creep.say('❌ no path');
            return;
        }

        if (route.length > 0) {
            const exitDir = route[0].exit;
            const exit = creep.pos.findClosestByPath(exitDir);
            
            if (exit) {
                creep.moveTo(exit, {
                    visualizePathStyle: { stroke: '#ff0000' }
                });
            }
        }
    }

    /**
     * Find priority target to attack
     * Priority: Spawn > Towers > Extensions > Controller > Other structures
     */
    findAttackTarget(creep, squad) {
        // Priority 1: Enemy spawn
        const spawn = creep.pos.findClosestByPath(FIND_HOSTILE_SPAWNS);
        if (spawn) {
            return { target: spawn, priority: 'spawn' };
        }

        // Priority 2: Towers
        const tower = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER
        });
        if (tower) {
            return { target: tower, priority: 'tower' };
        }

        // Priority 3: Extensions
        const extension = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION
        });
        if (extension) {
            return { target: extension, priority: 'extension' };
        }

        // Priority 4: Controller
        if (creep.room.controller) {
            return { target: creep.room.controller, priority: 'controller' };
        }

        // Priority 5: Any hostile structure
        const structure = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES);
        if (structure) {
            return { target: structure, priority: 'structure' };
        }

        // Priority 6: Hostile creeps
        const hostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS);
        if (hostile) {
            return { target: hostile, priority: 'creep' };
        }

        // Priority 7: Construction sites
        const site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        if (site) {
            return { target: site, priority: 'construction' };
        }

        return null;
    }

    /**
     * Attack a target
     */
    attackTarget(creep, targetInfo) {
        const target = targetInfo.target;
        const range = creep.pos.getRangeTo(target);

        if (range <= 1) {
            // Adjacent - attack
            creep.attack(target);
            creep.say(`⚔️ ${targetInfo.priority}`);
        } else {
            // Move closer
            creep.moveTo(target, {
                visualizePathStyle: { stroke: '#ff0000' },
                maxRooms: 1
            });
            
            // Try attacking anyway (might be in range)
            if (creep.pos.getRangeTo(target) <= 1) {
                creep.attack(target);
            }
        }
    }

    /**
     * Handle when room appears to be cleared
     */
    handleRoomCleared(creep, squad) {
        // Check if controller is safe mode
        if (creep.room.controller && creep.room.controller.safeMode) {
            // Wait for safe mode to expire
            creep.say('⏳ safe mode');
            
            // Attack construction sites if any
            const sites = creep.room.find(FIND_CONSTRUCTION_SITES);
            if (sites.length > 0) {
                creep.moveTo(sites[0]);
                creep.attack(sites[0]);
            }
            return;
        }

        // Room seems cleared - report success
        console.log(`✅ Squad ${creep.memory.squadId} has cleared ${creep.room.name}`);
        
        // Mark squad as successful
        squad.status = 'success';
        
        // Move to a rally point or return home
        const homeRoom = Game.rooms[squad.homeRoom];
        if (homeRoom) {
            const spawn = homeRoom.find(FIND_MY_SPAWNS)[0];
            if (spawn) {
                creep.moveTo(spawn);
            }
        }
    }
}

/**
 * Healer - Part of attack squads (1 healer per squad of 4)
 * Heals attackers and keeps the squad alive
 * Follows attackers and maintains formation
 */
class Healer {
    run(creep) {
        // Check if we're part of a squad
        if (!creep.memory.squadId) {
            creep.say('❌ no squad');
            return;
        }

        const squad = Memory.attackSquads[creep.memory.squadId];
        if (!squad) {
            creep.say('❌ squad gone');
            return;
        }

        // Check if we need to retreat
        if (this.shouldRetreat(creep)) {
            this.retreat(creep);
            return;
        }

        // Self-heal if damaged
        if (creep.hits < creep.hitsMax && 
            creep.body.some(p => p.type === HEAL && p.hits > 0)) {
            creep.heal(creep);
        }

        // Squad not ready yet - wait at spawn
        if (!squad.ready) {
            this.waitForSquad(creep, squad);
            return;
        }

        // Squad is ready - follow and heal attackers
        this.supportSquad(creep, squad);
    }

    /**
     * Wait for full squad formation near spawn
     */
    waitForSquad(creep, squad) {
        const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
        if (!spawn) return;

        // Stay near spawn
        if (!creep.pos.inRangeTo(spawn, 3)) {
            creep.moveTo(spawn, { range: 3 });
        } else {
            // Check squad status
            const presentAttackers = squad.members.attackers.filter(name => {
                const other = Game.creeps[name];
                return other && other.room.name === creep.room.name;
            }).length;

            const presentHealers = squad.members.healers.filter(name => {
                const other = Game.creeps[name];
                return other && other.room.name === creep.room.name;
            }).length;

            creep.say(`⏳ ${presentAttackers}/3A`);

            // Heal any damaged squad members nearby
            const damagedSquadMate = this.findDamagedSquadMate(creep, squad);
            if (damagedSquadMate) {
                this.healTarget(creep, damagedSquadMate);
            }
        }
    }

    /**
     * Support the squad by healing and following attackers
     */
    supportSquad(creep, squad) {
        // Travel to target room if needed
        if (creep.room.name !== squad.targetRoom) {
            this.travelToTarget(creep, squad.targetRoom);
            return;
        }

        // In target room - find someone to heal
        const healTarget = this.findBestHealTarget(creep, squad);
        
        if (healTarget) {
            this.healTarget(creep, healTarget);
        } else {
            // No one to heal - follow the closest attacker
            this.followAttacker(creep, squad);
        }
    }

    /**
     * Find the best target to heal
     * Priority: Dying squad members > Damaged squad members > Damaged self
     */
    findBestHealTarget(creep, squad) {
        const allSquadMembers = [...squad.members.attackers, ...squad.members.healers];
        let bestTarget = null;
        let bestPriority = -1;

        for (const name of allSquadMembers) {
            const targetCreep = Game.creeps[name];
            if (!targetCreep || targetCreep.name === creep.name) continue;
            if (targetCreep.room.name !== creep.room.name) continue;

            const healthPercent = targetCreep.hits / targetCreep.hitsMax;
            const range = creep.pos.getRangeTo(targetCreep);

            // Calculate priority (higher = more urgent)
            let priority = 0;
            
            // Critical health = very high priority
            if (healthPercent < 0.3) priority += 100;
            else if (healthPercent < 0.5) priority += 50;
            else if (healthPercent < 0.8) priority += 20;

            // Attacking creeps get priority over healers
            if (squad.members.attackers.includes(name)) priority += 10;

            // Closer targets get slight priority
            priority -= range * 2;

            if (priority > bestPriority) {
                bestPriority = priority;
                bestTarget = targetCreep;
            }
        }

        return bestTarget;
    }

    /**
     * Find damaged squad members near spawn while waiting
     */
    findDamagedSquadMate(creep, squad) {
        const allMembers = [...squad.members.attackers, ...squad.members.healers];
        
        for (const name of allMembers) {
            if (name === creep.name) continue;
            
            const other = Game.creeps[name];
            if (!other || other.room.name !== creep.room.name) continue;
            if (other.hits >= other.hitsMax) continue;

            const range = creep.pos.getRangeTo(other);
            if (range <= 3) {
                return other;
            }
        }

        return null;
    }

    /**
     * Heal a target (ranged or adjacent)
     */
    healTarget(creep, target) {
        const range = creep.pos.getRangeTo(target);

        if (range <= 1) {
            // Adjacent - heal directly
            creep.heal(target);
            creep.say('💚 heal');
        } else if (range <= 3) {
            // In range - ranged heal
            creep.rangedHeal(target);
            creep.say('💚 ranged');
        } else {
            // Move closer
            creep.moveTo(target, {
                visualizePathStyle: { stroke: '#00ff00' },
                range: 1
            });
        }
    }

    /**
     * Follow the closest attacker when no healing needed
     */
    followAttacker(creep, squad) {
        // Find closest attacker in the room
        let closestAttacker = null;
        let closestRange = Infinity;

        for (const name of squad.members.attackers) {
            const attacker = Game.creeps[name];
            if (!attacker || attacker.room.name !== creep.room.name) continue;

            const range = creep.pos.getRangeTo(attacker);
            if (range < closestRange) {
                closestRange = range;
                closestAttacker = attacker;
            }
        }

        if (closestAttacker) {
            // Stay 2 tiles behind the attacker
            if (closestRange > 2) {
                creep.moveTo(closestAttacker, {
                    visualizePathStyle: { stroke: '#00ff00' },
                    range: 2
                });
            }
        } else {
            // No attackers visible - move toward center of room
            creep.moveTo(25, 25);
        }
    }

    /**
     * Travel to target room
     */
    travelToTarget(creep, targetRoom) {
        const route = Game.map.findRoute(creep.room.name, targetRoom);
        
        if (route === ERR_NO_PATH) {
            creep.say('❌ no path');
            return;
        }

        if (route.length > 0) {
            const exitDir = route[0].exit;
            const exit = creep.pos.findClosestByPath(exitDir);
            
            if (exit) {
                creep.moveTo(exit, {
                    visualizePathStyle: { stroke: '#00ff00' }
                });
            }
        }
    }

    /**
     * Check if healer should retreat
     */
    shouldRetreat(creep) {
        // Retreat if very low health
        if (creep.hits < creep.hitsMax * 0.25) {
            return true;
        }

        // Retreat if surrounded by enemies
        const nearbyHostiles = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 2);
        if (nearbyHostiles.length >= 2) {
            return true;
        }

        // Retreat if taking damage and no attackers nearby
        if (creep.hits < creep.hitsMax * 0.5) {
            const squad = Memory.attackSquads[creep.memory.squadId];
            if (squad) {
                let attackersNearby = 0;
                for (const name of squad.members.attackers) {
                    const attacker = Game.creeps[name];
                    if (attacker && attacker.room.name === creep.room.name) {
                        if (creep.pos.getRangeTo(attacker) <= 3) {
                            attackersNearby++;
                        }
                    }
                }
                
                if (attackersNearby === 0) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Retreat to safety
     */
    retreat(creep) {
        // Try to find exit
        const exit = creep.pos.findClosestByRange(FIND_EXIT);
        
        if (exit) {
            creep.moveTo(exit, {
                visualizePathStyle: { stroke: '#ffff00' }
            });
            creep.say('🏃 retreat');
        }

        // Keep self-healing while retreating
        if (creep.body.some(p => p.type === HEAL && p.hits > 0)) {
            creep.heal(creep);
        }
    }
}

/**
 * Scout - Reconnaissance creep that explores rooms
 * Moves room to room, gathering intelligence
 * Saves room data to memory for attack planning
 */
class Scout {
    run(creep) {
        // Initialize scouting memory
        if (!creep.memory.scouting) {
            creep.memory.scouting = {
                visitedRooms: [],
                currentTarget: null,
                path: [],
                pathIndex: 0
            };
        }

        // Scan current room and save data
        this.scanRoom(creep);

        // Get next target room to explore
        if (!creep.memory.scouting.currentTarget || 
            creep.room.name === creep.memory.scouting.currentTarget) {
            this.selectNextTarget(creep);
        }

        // Move to target room
        this.moveToTarget(creep);
    }

    /**
     * Scan the current room and save intelligence
     */
    scanRoom(creep) {
        const room = creep.room;
        const roomName = room.name;

        // Initialize room intel in memory if needed
        if (!Memory.roomIntel) {
            Memory.roomIntel = {};
        }
        if (!Memory.roomIntel[roomName]) {
            Memory.roomIntel[roomName] = {};
        }

        const intel = {
            lastScan: Game.time,
            hasController: !!room.controller,
            owner: null,
            level: null,
            safeMode: null,
            structures: {},
            creeps: {
                hostile: 0,
                friendly: 0
            },
            resources: {},
            exits: {}
        };

        // Controller info
        if (room.controller) {
            intel.level = room.controller.level;
            intel.owner = room.controller.owner ? room.controller.owner.username : null;
            intel.reservation = room.controller.reservation ? {
                username: room.controller.reservation.username,
                ticksToEnd: room.controller.reservation.ticksToEnd
            } : null;
            intel.safeMode = room.controller.safeMode || null;
        }

        // Scan structures
        const structures = room.find(FIND_STRUCTURES);
        for (const structure of structures) {
            const type = structure.structureType;
            if (!intel.structures[type]) {
                intel.structures[type] = [];
            }
            
            intel.structures[type].push({
                id: structure.id,
                pos: { x: structure.pos.x, y: structure.pos.y },
                hits: structure.hits,
                hitsMax: structure.hitsMax,
                my: structure.my || false
            });
        }

        // Scan hostile creeps
        const hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        intel.creeps.hostile = hostileCreeps.length;
        intel.creeps.hostileDetails = hostileCreeps.map(c => ({
            id: c.id,
            owner: c.owner.username,
            bodyParts: c.body.length,
            hits: c.hits,
            hitsMax: c.hitsMax
        }));

        // Scan friendly creeps
        const friendlyCreeps = room.find(FIND_MY_CREEPS);
        intel.creeps.friendly = friendlyCreeps.length;

        // Scan resources
        const sources = room.find(FIND_SOURCES);
        intel.resources.sources = sources.map(s => ({
            id: s.id,
            pos: { x: s.pos.x, y: s.pos.y },
            energy: s.energy,
            energyCapacity: s.energyCapacity
        }));

        const minerals = room.find(FIND_MINERALS);
        intel.resources.minerals = minerals.map(m => ({
            id: m.id,
            pos: { x: m.pos.x, y: m.pos.y },
            mineralType: m.mineralType,
            density: m.density
        }));

        // Get exits
        const exits = Game.map.describeExits(roomName);
        intel.exits = exits;

        // Save to memory
        Memory.roomIntel[roomName] = intel;

        // Visual feedback
        creep.say(`👁️ ${roomName}`);
    }

    /**
     * Select the next room to explore
     */
    selectNextTarget(creep) {
        const currentRoom = creep.room.name;
        const visited = creep.memory.scouting.visitedRooms;

        // Add current room to visited
        if (!visited.includes(currentRoom)) {
            visited.push(currentRoom);
        }

        // Get all adjacent rooms
        const exits = Game.map.describeExits(currentRoom);
        const candidates = [];

        for (const direction in exits) {
            const roomName = exits[direction];
            
            // Skip if we've visited recently
            if (visited.includes(roomName)) {
                // Check if it's been a while since we visited
                const intel = Memory.roomIntel[roomName];
                if (intel && Game.time - intel.lastScan < 1000) {
                    continue; // Visited recently
                }
            }

            // Skip if room is not accessible (novice zone walls, etc.)
            const status = Game.map.getRoomStatus(roomName);
            if (status.status !== 'normal') {
                continue;
            }

            candidates.push({
                roomName: roomName,
                direction: parseInt(direction),
                lastScan: Memory.roomIntel[roomName]?.lastScan || 0
            });
        }

        if (candidates.length === 0) {
            // All adjacent rooms visited recently - reset and pick random
            creep.memory.scouting.visitedRooms = [];
            const exitDirections = Object.keys(exits);
            if (exitDirections.length > 0) {
                const randomDir = exitDirections[Math.floor(Math.random() * exitDirections.length)];
                creep.memory.scouting.currentTarget = exits[randomDir];
            }
            return;
        }

        // Sort by last scan time (oldest first)
        candidates.sort((a, b) => a.lastScan - b.lastScan);

        // Pick the room least recently visited
        creep.memory.scouting.currentTarget = candidates[0].roomName;
        
        // Reset path
        creep.memory.scouting.path = [];
        creep.memory.scouting.pathIndex = 0;
    }

    /**
     * Move toward the target room
     */
    moveToTarget(creep) {
        const targetRoom = creep.memory.scouting.currentTarget;
        if (!targetRoom) return;

        // Already there
        if (creep.room.name === targetRoom) {
            return;
        }

        // Find path to target room
        const route = Game.map.findRoute(creep.room.name, targetRoom);
        
        if (route === ERR_NO_PATH) {
            // Can't reach - mark as visited to skip
            creep.memory.scouting.visitedRooms.push(targetRoom);
            creep.memory.scouting.currentTarget = null;
            creep.say('❌ blocked');
            return;
        }

        if (route.length > 0) {
            const exitDir = route[0].exit;
            const exit = creep.pos.findClosestByPath(exitDir);
            
            if (exit) {
                // Move toward exit
                const result = creep.moveTo(exit, {
                    visualizePathStyle: { stroke: '#ffffff' }
                });

                // If we have a path in memory, try to use it
                if (creep.memory.scouting.path.length > 0) {
                    const pathIndex = creep.memory.scouting.pathIndex;
                    if (pathIndex < creep.memory.scouting.path.length) {
                        const nextPos = creep.memory.scouting.path[pathIndex];
                        const moveResult = creep.moveByPath(creep.memory.scouting.path);
                        
                        if (moveResult === OK) {
                            creep.memory.scouting.pathIndex++;
                        } else {
                            // Path failed, clear it
                            creep.memory.scouting.path = [];
                            creep.memory.scouting.pathIndex = 0;
                        }
                    }
                } else {
                    // No path - search for one
                    const search = PathFinder.search(
                        creep.pos,
                        { pos: exit, range: 0 },
                        {
                            roomCallback: (roomName) => {
                                // Allow pathing through all rooms
                                return new PathFinder.CostMatrix();
                            }
                        }
                    );

                    if (!search.incomplete && search.path.length > 0) {
                        creep.memory.scouting.path = search.path;
                        creep.memory.scouting.pathIndex = 0;
                    }
                }
            }
        }
    }

    /**
     * Get intelligence summary for a room
     * Used by other systems (attack planner, etc.)
     */
    static getRoomIntel(roomName) {
        if (!Memory.roomIntel || !Memory.roomIntel[roomName]) {
            return null;
        }
        return Memory.roomIntel[roomName];
    }

    /**
     * Check if a room is owned by hostiles
     */
    static isHostileRoom(roomName) {
        const intel = this.getRoomIntel(roomName);
        if (!intel) return false;
        
        // Has controller with owner that's not us
        if (intel.owner && intel.owner !== Game.spawns[Object.keys(Game.spawns)[0]].owner.username) {
            return true;
        }
        
        // Has hostile creeps
        if (intel.creeps && intel.creeps.hostile > 0) {
            return true;
        }
        
        return false;
    }

    /**
     * Get list of hostile rooms
     */
    static getHostileRooms() {
        const hostile = [];
        if (!Memory.roomIntel) return hostile;
        
        for (const roomName in Memory.roomIntel) {
            if (this.isHostileRoom(roomName)) {
                hostile.push(roomName);
            }
        }
        
        return hostile;
    }
}

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
                // Initialize room memory if not exists
                if (!Memory.rooms[roomName]) {
                    Memory.rooms[roomName] = {};
                }
                
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

/**
 * ConstructionManager - Plans and initiates construction of room structures
 * Priorities:
 * 1. Roads for efficiency
 * 2. Extensions for bigger creeps
 * 3. Towers for defense
 * 4. Ramparts/Walls for base defense
 * 5. Storage
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
                lastRoadBuild: 0,
                defensePlanned: false
            };
        }
        
        // Build based on RCL
        this.buildEssentials(room, spawn);
        
        if (rcl >= 2) {
            this.buildExtensions(room);
        }
        
        if (rcl >= 3) {
            this.buildContainers(room); // Phase 4: Containers at sources (RCL 3 unlocks containers)
            this.buildTower(room); // Phase 7: Towers (RCL 3 unlocks 1 tower)
        }
        
        if (rcl >= 4) {
            this.buildStorage(room); // Phase 8: Storage (RCL 4 unlocks storage)
            this.buildRamparts(room); // Phase 6: Ramparts (RCL 4 unlocks ramparts)
        }
        
        if (rcl >= 5) {
            this.buildWalls(room); // Phase 6+: Walls at exits (RCL 5+)
        }
    }
    
    /**
     * Phase 4: Build containers at sources for stationary harvesting
     */
    buildContainers(room) {
        const sources = room.find(FIND_SOURCES);
        const containers = room.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_CONTAINER }
        });
        const sites = room.find(FIND_CONSTRUCTION_SITES, {
            filter: { structureType: STRUCTURE_CONTAINER }
        });
        
        const totalNeeded = sources.length;
        const currentCount = containers.length + sites.length;
        
        if (currentCount >= totalNeeded) return;
        
        // Build containers at sources
        for (const source of sources) {
            // Check if source already has a container nearby
            const nearbyContainers = source.pos.findInRange(FIND_STRUCTURES, 2, {
                filter: { structureType: STRUCTURE_CONTAINER }
            });
            const nearbySites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, {
                filter: { structureType: STRUCTURE_CONTAINER }
            });
            
            if (nearbyContainers.length === 0 && nearbySites.length === 0) {
                // Find a good position for the container
                const pos = this.findContainerPosition(source);
                if (pos) {
                    pos.createConstructionSite(STRUCTURE_CONTAINER);
                    console.log('📦 Building container at source ' + source.id);
                    return;
                }
            }
        }
    }
    
    /**
     * Find best position for a container near a source
     * Prioritizes positions close to the source and with road access
     */
    findContainerPosition(source) {
        const room = source.room;
        const terrain = room.getTerrain();
        let bestPos = null;
        let bestScore = -Infinity;
        
        // Check all positions within 1 tile of source
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                
                const x = source.pos.x + dx;
                const y = source.pos.y + dy;
                
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                
                const pos = new RoomPosition(x, y, room.name);
                
                // Check if position is blocked
                const structures = pos.lookFor(LOOK_STRUCTURES);
                if (structures.length > 0) continue;
                
                const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                if (sites.length > 0) continue;
                
                // Calculate score (closer to spawn is better)
                const spawn = room.find(FIND_MY_SPAWNS)[0];
                let score = 0;
                
                // Distance from source (prefer 1 tile away)
                const distToSource = Math.abs(dx) + Math.abs(dy);
                score += (3 - distToSource) * 10;
                
                // Distance to spawn (closer is better)
                if (spawn) {
                    const distToSpawn = pos.getRangeTo(spawn);
                    score -= distToSpawn * 2;
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestPos = pos;
                }
            }
        }
        
        return bestPos;
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
        
        // Priority 5: Roads around important structures for defense mobility
        this.buildRoadsAroundStructures(room, spawn.pos);
    }
    
    buildRoadsAroundStructures(room, spawnPos) {
        // Build roads in a defensive grid around spawn
        const offsets = [
            {x: -2, y: -2}, {x: 0, y: -2}, {x: 2, y: -2},
            {x: -2, y: 0},                 {x: 2, y: 0},
            {x: -2, y: 2},  {x: 0, y: 2},  {x: 2, y: 2}
        ];
        
        for (const offset of offsets) {
            const x = spawnPos.x + offset.x;
            const y = spawnPos.y + offset.y;
            
            if (x > 0 && x < 49 && y > 0 && y < 49) {
                const pos = new RoomPosition(x, y, room.name);
                const terrain = pos.lookFor(LOOK_TERRAIN);
                
                if (terrain[0] !== 'wall') {
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
                    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                    
                    if (!hasRoad && sites.length === 0) {
                        pos.createConstructionSite(STRUCTURE_ROAD);
                        return;
                    }
                }
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
        // Place tower 3-4 tiles from spawn in various directions (for defense)
        const offsets = [
            {x: 4, y: 0}, {x: -4, y: 0}, {x: 0, y: 4}, {x: 0, y: -4},
            {x: 4, y: 4}, {x: 4, y: -4}, {x: -4, y: 4}, {x: -4, y: -4}
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
    
    buildRamparts(room) {
        // Build ramparts around important structures (spawn, controller, towers)
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn) return;
        
        // Get positions to protect
        const protectPositions = [spawn.pos];
        
        // Add controller position
        if (room.controller) {
            protectPositions.push(room.controller.pos);
        }
        
        // Add tower positions
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_TOWER }
        });
        towers.forEach(tower => protectPositions.push(tower.pos));
        
        // Build ramparts around each protected position
        for (const pos of protectPositions) {
            // Build a 3x3 area of ramparts around important structures
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    // Skip the center position (structure is there)
                    if (dx === 0 && dy === 0) continue;
                    
                    const x = pos.x + dx;
                    const y = pos.y + dy;
                    
                    if (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
                        const rampartPos = new RoomPosition(x, y, room.name);
                        const terrain = rampartPos.lookFor(LOOK_TERRAIN);
                        
                        if (terrain[0] !== 'wall') {
                            const structures = rampartPos.lookFor(LOOK_STRUCTURES);
                            const hasRampart = structures.some(s => 
                                s.structureType === STRUCTURE_RAMPART
                            );
                            const sites = rampartPos.lookFor(LOOK_CONSTRUCTION_SITES);
                            const hasConstruction = sites.some(s => 
                                s.structureType === STRUCTURE_RAMPART
                            );
                            
                            if (!hasRampart && !hasConstruction) {
                                rampartPos.createConstructionSite(STRUCTURE_RAMPART);
                                return;
                            }
                        }
                    }
                }
            }
        }
    }
    
    buildWalls(room) {
        // Build walls at room exits to create chokepoints
        const exits = [
            FIND_EXIT_TOP,
            FIND_EXIT_RIGHT,
            FIND_EXIT_BOTTOM,
            FIND_EXIT_LEFT
        ];
        
        for (const exitDir of exits) {
            const exitPositions = room.find(exitDir);
            if (exitPositions.length === 0) continue;
            
            // Build walls at the first few positions of each exit
            // This creates natural chokepoints while allowing controlled entry
            const positionsToBlock = exitPositions.slice(0, Math.min(3, exitPositions.length));
            
            for (const pos of positionsToBlock) {
                // Check if position is near any important structure
                const nearImportant = this.isNearImportantStructure(room, pos);
                
                if (!nearImportant) {
                    const terrain = pos.lookFor(LOOK_TERRAIN);
                    if (terrain[0] !== 'wall') {
                        const structures = pos.lookFor(LOOK_STRUCTURES);
                        const hasWall = structures.some(s => 
                            s.structureType === STRUCTURE_WALL
                        );
                        const hasRampart = structures.some(s => 
                            s.structureType === STRUCTURE_RAMPART
                        );
                        const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                        const hasConstruction = sites.length > 0;
                        
                        if (!hasWall && !hasRampart && !hasConstruction) {
                            pos.createConstructionSite(STRUCTURE_WALL);
                            return;
                        }
                    }
                }
            }
        }
    }
    
    isNearImportantStructure(room, pos) {
        // Check if position is near spawn, controller, or storage
        const importantStructures = room.find(FIND_MY_STRUCTURES, {
            filter: s => [STRUCTURE_SPAWN, STRUCTURE_CONTROLLER, STRUCTURE_STORAGE].includes(s.structureType)
        });
        
        for (const structure of importantStructures) {
            if (pos.getRangeTo(structure) <= 5) {
                return true;
            }
        }
        return false;
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
            
            // Skip the target position (controller, spawn, etc.)
            if (step.x === toPos.x && step.y === toPos.y) continue;
            
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
        const energyFull = energyAvailable >= energyCapacity;

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
        
        // Store energy status for other logic
        room.memory.energyFull = energyFull;
        
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
                    // Emergency harvester spawned silently
                }
            }
            return;
        }

        // Check if we should wait for full energy to maximize body parts
        // Only skip if we're not at full energy and have enough creeps to sustain
        if (!energyFull && harvesters.length >= 2 && room.controller.level >= 2) {
            // Wait for full energy unless it's early game
            // Status will be shown in heartbeat
            room.memory.waitingForEnergy = true;
            return;
        }
        
        room.memory.waitingForEnergy = false;

        // PHASE 1: Initial startup - exactly 2 harvesters, then 1 upgrader
        if (harvesters.length === 2 && upgraders.length < 1) {
            // For early game, don't wait for full energy
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
                // Room switching to stationary mode (logged in heartbeat)
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
        
        // PHASE 5: Remote Workers (Multi-Room Harvesting)
        // Spawn remote harvesters for adjacent rooms
        const neededRemoteHarvesters = room.memory.neededRemoteHarvesters || 0;
        const neededHaulers = room.memory.neededHaulers || 0;
        const neededClaimers = room.memory.neededClaimers || 0;
        
        if (neededRemoteHarvesters > 0) {
            const bodyCost = this.getRemoteHarvesterCost(energyCapacity);
            if (energyAvailable >= bodyCost) {
                this.spawnRemoteHarvester(spawn, energyCapacity, room.name);
                return;
            }
        }
        
        if (neededHaulers > 0) {
            const bodyCost = this.getHaulerCost(energyCapacity);
            if (energyAvailable >= bodyCost) {
                this.spawnHauler(spawn, energyCapacity, room.name);
                return;
            }
        }
        
        if (neededClaimers > 0) {
            const bodyCost = this.getClaimerCost(energyCapacity);
            if (energyAvailable >= bodyCost) {
                this.spawnClaimer(spawn, room.name);
                return;
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
        
        // PHASE 5: Remote Workers
        const neededRemoteHarvesters = room.memory.neededRemoteHarvesters || 0;
        const neededHaulers = room.memory.neededHaulers || 0;
        const neededClaimers = room.memory.neededClaimers || 0;
        
        if (neededRemoteHarvesters > 0) {
            priorities.push({
                role: 'remoteharvester',
                emoji: '🌍',
                reason: neededRemoteHarvesters + ' remote harvesters needed',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
        }
        
        if (neededHaulers > 0) {
            priorities.push({
                role: 'hauler',
                emoji: '🚚',
                reason: neededHaulers + ' haulers needed',
                priority: priorities.length === 0 ? 1 : 2
            });
            if (priorities.length >= 2) return priorities;
        }
        
        if (neededClaimers > 0) {
            priorities.push({
                role: 'claimer',
                emoji: '🏳️',
                reason: neededClaimers + ' claimers needed',
                priority: priorities.length === 0 ? 1 : 2
            });
            if (priorities.length >= 2) return priorities;
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
    
    // Remote worker body and spawn methods
    getRemoteHarvesterCost(energyCapacity) {
        // Remote harvester: WORK, WORK, CARRY, MOVE
        // Needs to build container and harvest
        const maxSets = Math.min(Math.floor(energyCapacity / 350), 5);
        return maxSets > 0 ? maxSets * 350 : 350;
    }
    
    getRemoteHarvesterBody(energyCapacity) {
        const body = [];
        // Maximize work parts for remote harvesting
        let remaining = energyCapacity;
        
        while (remaining >= 350 && body.length < 50 - 4) {
            body.push(WORK);
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
            remaining -= 350;
        }
        
        return body.length > 0 ? body : [WORK, WORK, CARRY, MOVE];
    }
    
    getHaulerCost(energyCapacity) {
        // Hauler: CARRY, CARRY, MOVE - efficient transport
        const maxSets = Math.min(Math.floor(energyCapacity / 150), 16);
        return maxSets > 0 ? maxSets * 150 : 150;
    }
    
    getHaulerBody(energyCapacity) {
        const body = [];
        // Maximize carry capacity
        let remaining = energyCapacity;
        
        while (remaining >= 100 && body.length < 50 - 2) {
            body.push(CARRY);
            body.push(CARRY);
            body.push(MOVE);
            remaining -= 150;
        }
        
        return body.length > 0 ? body : [CARRY, CARRY, MOVE];
    }
    
    getClaimerCost(energyCapacity) {
        // Claimer needs CLAIM part
        return 650; // CLAIM + MOVE
    }
    
    getClaimerBody(energyCapacity) {
        return [CLAIM, MOVE];
    }
    
    spawnRemoteHarvester(spawn, energyCapacity, homeRoomName) {
        const body = this.getRemoteHarvesterBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;
        
        const name = 'RemoteHarvester' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: {
                role: 'remoteharvester',
                homeRoom: homeRoomName
            }
        });
        
        if (result === OK) {
            console.log('🌍 Spawning remote harvester: ' + name);
        }
        return result;
    }
    
    spawnHauler(spawn, energyCapacity, homeRoomName) {
        const body = this.getHaulerBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;
        
        const name = 'Hauler' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: {
                role: 'hauler',
                homeRoom: homeRoomName
            }
        });
        
        if (result === OK) {
            console.log('🚚 Spawning hauler: ' + name);
        }
        return result;
    }
    
    spawnClaimer(spawn, homeRoomName) {
        const body = [CLAIM, MOVE];
        const name = 'Claimer' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: {
                role: 'claimer',
                homeRoom: homeRoomName
            }
        });
        
        if (result === OK) {
            console.log('🏳️ Spawning claimer: ' + name);
        }
        return result;
    }
}

/**
 * RoomManager - Manages owned rooms including defense, offense, and economy
 * Handles military operations, room threats, and attack coordination
 */
class RoomManager {
    constructor() {
        this.spawnManager = new SpawnManager();
        this.constructionManager = new ConstructionManager();
    }
    
    run() {
        // Initialize military memory
        if (!Memory.military) {
            Memory.military = {
                squads: {},
                defense: {},
                intel: {}
            };
        }
        
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            
            if (room.controller && room.controller.my) {
                this.runOwnedRoom(room);
            }
        }
        
        // Manage attack squads globally
        this.manageAttackSquads();
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
        
        // Initialize room-specific defense memory
        if (!Memory.military.defense[room.name]) {
            Memory.military.defense[room.name] = {
                underAttack: false,
                attackTimer: 0,
                lastHostileSeen: 0,
                defendersSpawned: 0
            };
        }
        
        // Initialize remote room tracking
        if (!room.memory.remoteRooms) {
            room.memory.remoteRooms = [];
        }
        if (!room.memory.remoteAssignments) {
            room.memory.remoteAssignments = {};
        }
        
        // Check for threats and update defense status
        this.updateDefenseStatus(room);
        
        // Run tower defense
        this.runTowerDefense(room);
        
        // Run spawn logic
        this.spawnManager.run(room);
        
        // Manage construction
        this.constructionManager.run(room);
        
        // Manage remote rooms
        this.manageRemoteRooms(room);
        
        // Update room level tracking
        Memory.mokito.rooms[room.name].level = room.controller.level;
    }
    
    /**
     * Update room defense status and threat detection
     */
    updateDefenseStatus(room) {
        const defense = Memory.military.defense[room.name];
        
        // Check for hostile creeps
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        
        if (hostiles.length > 0) {
            // Under attack!
            defense.underAttack = true;
            defense.attackTimer = 20; // Stay alert for 20 ticks after last hostile seen
            defense.lastHostileSeen = Game.time;
            
            // Log first detection
            if (!defense.alertLogged) {
                console.log(`🚨 ROOM ${room.name} UNDER ATTACK! ${hostiles.length} hostiles detected!`);
                defense.alertLogged = true;
            }
        } else {
            // Decrement attack timer
            if (defense.attackTimer > 0) {
                defense.attackTimer--;
            } else {
                defense.underAttack = false;
                defense.alertLogged = false;
            }
        }
        
        // Store needed defenders count
        if (defense.underAttack) {
            const neededDefenders = Math.min(hostiles.length * 2, 4); // 2 defenders per hostile, max 4
            room.memory.neededDefenders = neededDefenders;
        } else {
            room.memory.neededDefenders = 0;
        }
    }
    
    /**
     * Run tower defense logic
     */
    runTowerDefense(room) {
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER
        });
        
        if (towers.length === 0) return;
        
        // Find hostiles
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        
        if (hostiles.length > 0) {
            // Priority target: Healers > Ranged > Melee > Others
            const priorityTargets = hostiles.sort((a, b) => {
                const scoreA = this.getThreatScore(a);
                const scoreB = this.getThreatScore(b);
                return scoreB - scoreA; // Higher score first
            });
            
            const target = priorityTargets[0];
            
            // Attack with all towers
            for (const tower of towers) {
                tower.attack(target);
            }
        } else {
            // No hostiles - repair damaged structures
            const damagedStructures = room.find(FIND_MY_STRUCTURES, {
                filter: s => s.hits < s.hitsMax * 0.75 && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART
            });
            
            if (damagedStructures.length > 0) {
                // Sort by damage percentage
                damagedStructures.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
                
                for (const tower of towers) {
                    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > tower.store.getCapacity(RESOURCE_ENERGY) * 0.5) {
                        tower.repair(damagedStructures[0]);
                    }
                }
            }
            
            // Repair walls/ramparts if enough energy
            const defenseStructures = room.find(FIND_MY_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && s.hits < 100000
            });
            
            if (defenseStructures.length > 0 && towers[0].store.getUsedCapacity(RESOURCE_ENERGY) > towers[0].store.getCapacity(RESOURCE_ENERGY) * 0.8) {
                defenseStructures.sort((a, b) => a.hits - b.hits);
                for (const tower of towers) {
                    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > tower.store.getCapacity(RESOURCE_ENERGY) * 0.8) {
                        tower.repair(defenseStructures[0]);
                    }
                }
            }
        }
    }
    
    /**
     * Calculate threat score for target prioritization
     */
    getThreatScore(creep) {
        let score = 0;
        
        const body = creep.body;
        const healParts = body.filter(p => p.type === HEAL && p.hits > 0).length;
        const rangedParts = body.filter(p => p.type === RANGED_ATTACK && p.hits > 0).length;
        const attackParts = body.filter(p => p.type === ATTACK && p.hits > 0).length;
        const workParts = body.filter(p => p.type === WORK && p.hits > 0).length;
        
        // Healers are highest priority
        score += healParts * 100;
        // Then ranged attackers
        score += rangedParts * 50;
        // Then melee attackers
        score += attackParts * 30;
        // Workers last
        score += workParts * 10;
        
        return score;
    }
    
    /**
     * Manage attack squads globally
     */
    manageAttackSquads() {
        // Clean up dead squads
        for (const squadId in Memory.military.squads) {
            const squad = Memory.military.squads[squadId];
            
            // Check if squad members are alive
            const aliveAttackers = squad.members.attackers.filter(name => Game.creeps[name]).length;
            const aliveHealers = squad.members.healers.filter(name => Game.creeps[name]).length;
            
            // Squad is dead if no one is alive
            if (aliveAttackers === 0 && aliveHealers === 0) {
                console.log(`💀 Squad ${squadId} eliminated`);
                delete Memory.military.squads[squadId];
                continue;
            }
            
            // Check for success
            if (squad.status === 'success') {
                console.log(`✅ Squad ${squadId} completed mission`);
                delete Memory.military.squads[squadId];
            }
        }
        
        // Count active squads
        const activeSquadCount = Object.keys(Memory.military.squads).length;
        
        // Request new squads if under max (3) and we have targets
        if (activeSquadCount < 3) {
            // Find hostile rooms from scout intel
            const hostileRooms = this.getHostileRoomsFromIntel();
            
            for (const roomName of hostileRooms) {
                // Check if already targeted by a squad
                const alreadyTargeted = Object.values(Memory.military.squads).some(
                    squad => squad.targetRoom === roomName
                );
                
                if (!alreadyTargeted) {
                    // Request a new squad
                    this.requestAttackSquad(roomName);
                    break; // Only request one squad per tick
                }
            }
        }
        
        // Update needed squad members for spawning
        this.updateNeededSquadMembers();
    }
    
    /**
     * Get list of hostile rooms from scout intelligence
     */
    getHostileRoomsFromIntel() {
        if (!Memory.roomIntel) return [];
        
        const hostile = [];
        const myUsername = Object.values(Game.spawns)[0]?.owner.username;
        
        for (const roomName in Memory.roomIntel) {
            const intel = Memory.roomIntel[roomName];
            
            // Room has hostile controller owner
            if (intel.owner && intel.owner !== myUsername) {
                hostile.push(roomName);
                continue;
            }
            
            // Room has hostile creeps
            if (intel.creeps && intel.creeps.hostile > 0) {
                hostile.push(roomName);
                continue;
            }
            
            // Room has hostile structures
            if (intel.structures && intel.structures.spawn) {
                const hostileSpawns = intel.structures.spawn.filter(s => !s.my);
                if (hostileSpawns.length > 0) {
                    hostile.push(roomName);
                }
            }
        }
        
        // Sort by last scan (most recent intel first)
        hostile.sort((a, b) => {
            const intelA = Memory.roomIntel[a];
            const intelB = Memory.roomIntel[b];
            return (intelB?.lastScan || 0) - (intelA?.lastScan || 0);
        });
        
        return hostile;
    }
    
    /**
     * Request a new attack squad
     */
    requestAttackSquad(targetRoom) {
        // Find a room to spawn from (closest to target)
        let spawnRoom = null;
        let closestDistance = Infinity;
        
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (room.controller && room.controller.my) {
                const distance = Game.map.getRoomLinearDistance(roomName, targetRoom);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    spawnRoom = roomName;
                }
            }
        }
        
        if (!spawnRoom) return;
        
        const squadId = 'squad_' + Game.time;
        
        Memory.military.squads[squadId] = {
            id: squadId,
            targetRoom: targetRoom,
            homeRoom: spawnRoom,
            status: 'forming', // forming, ready, attacking, success
            ready: false,
            members: {
                attackers: [],
                healers: []
            },
            created: Game.time
        };
        
        // Store in room memory for spawning
        const room = Game.rooms[spawnRoom];
        if (!room.memory.pendingSquads) {
            room.memory.pendingSquads = [];
        }
        room.memory.pendingSquads.push(squadId);
        
        console.log(`🎖️ Attack squad ${squadId} requested for ${targetRoom}`);
    }
    
    /**
     * Update needed squad member counts for spawning
     */
    updateNeededSquadMembers() {
        // Reset needed counts
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (room.controller && room.controller.my) {
                room.memory.neededAttackers = 0;
                room.memory.neededHealers = 0;
            }
        }
        
        // Count needed members for forming squads
        for (const squadId in Memory.military.squads) {
            const squad = Memory.military.squads[squadId];
            if (squad.ready) continue; // Squad is ready, no more needed
            
            const room = Game.rooms[squad.homeRoom];
            if (!room) continue;
            
            const neededAttackers = Math.max(0, 3 - squad.members.attackers.length);
            const neededHealers = Math.max(0, 1 - squad.members.healers.length);
            
            room.memory.neededAttackers += neededAttackers;
            room.memory.neededHealers += neededHealers;
        }
    }
    
    manageRemoteRooms(room) {
        // Only manage remote rooms if we have enough local workers
        const creeps = room.find(FIND_MY_CREEPS);
        const harvesters = creeps.filter(c => c.memory.role === 'harvester').length;
        const upgraders = creeps.filter(c => c.memory.role === 'upgrader').length;
        const runners = creeps.filter(c => c.memory.role === 'runner').length;
        
        // Need at least basic infrastructure before expanding
        if (harvesters < 2 || upgraders < 1 || runners < 1) {
            return;
        }
        
        // Scout for new rooms
        if (Game.time % 100 === 0) {
            this.scoutRemoteRooms(room);
        }
        
        // Update assignments for existing remote rooms
        this.updateRemoteAssignments(room);
        
        // Spawn remote workers if needed
        this.spawnRemoteWorkers(room);
    }
    
    scoutRemoteRooms(room) {
        // Find adjacent rooms
        const exits = Game.map.describeExits(room.name);
        
        for (const direction in exits) {
            const roomName = exits[direction];
            
            // Check if room is already known
            if (room.memory.remoteRooms.includes(roomName)) {
                continue;
            }
            
            // Check room status
            const roomStatus = Game.map.getRoomStatus(roomName);
            if (roomStatus.status !== 'normal') {
                continue;
            }
            
            // Check if room has sources
            // We'll need to scout it first
            if (!room.memory.remoteAssignments[roomName]) {
                room.memory.remoteRooms.push(roomName);
                room.memory.remoteAssignments[roomName] = {
                    scouting: true,
                    sources: {}
                };
            }
        }
    }
    
    updateRemoteAssignments(room) {
        for (const roomName of room.memory.remoteRooms) {
            const assignment = room.memory.remoteAssignments[roomName];
            if (!assignment) continue;
            
            // Check if we have visibility into the room
            const remoteRoom = Game.rooms[roomName];
            if (!remoteRoom) {
                continue;
            }
            
            // Scout the room if needed
            if (assignment.scouting) {
                this.scoutRoom(room, roomName, assignment);
            }
            
            // Update source assignments
            for (const sourceId in assignment.sources) {
                const sourceAssignment = assignment.sources[sourceId];
                
                // Check if harvester is alive
                if (sourceAssignment.harvester) {
                    const harvester = Game.creeps[sourceAssignment.harvester];
                    if (!harvester) {
                        sourceAssignment.harvester = null;
                    }
                }
                
                // Check if hauler is alive
                if (sourceAssignment.hauler) {
                    const hauler = Game.creeps[sourceAssignment.hauler];
                    if (!hauler) {
                        sourceAssignment.hauler = null;
                    }
                }
            }
            
            // Update claimer assignment
            if (assignment.claimer) {
                const claimer = Game.creeps[assignment.claimer];
                if (!claimer) {
                    assignment.claimer = null;
                }
            }
        }
    }
    
    scoutRoom(homeRoom, roomName, assignment) {
        const remoteRoom = Game.rooms[roomName];
        if (!remoteRoom) return;
        
        // Find sources
        const sources = remoteRoom.find(FIND_SOURCES);
        
        // Create assignments for each source
        for (const source of sources) {
            if (!assignment.sources[source.id]) {
                assignment.sources[source.id] = {
                    harvester: null,
                    hauler: null,
                    containerBuilt: false,
                    containerId: null,
                    pos: {
                        x: source.pos.x,
                        y: source.pos.y
                    }
                };
            }
        }
        
        assignment.scouting = false;
        console.log('🔍 Scouted ' + roomName + ': Found ' + sources.length + ' sources');
    }
    
    spawnRemoteWorkers(room) {
        // Count remote workers
        const creeps = room.find(FIND_MY_CREEPS);
        const remoteHarvesters = creeps.filter(c => c.memory.role === 'remoteharvester').length;
        const haulers = creeps.filter(c => c.memory.role === 'hauler').length;
        const claimers = creeps.filter(c => c.memory.role === 'claimer').length;
        const scouts = creeps.filter(c => c.memory.role === 'scout').length;
        
        // Calculate needed remote workers
        let neededRemoteHarvesters = 0;
        let neededHaulers = 0;
        let neededClaimers = 0;
        let neededScouts = 0;
        
        for (const roomName of room.memory.remoteRooms) {
            const assignment = room.memory.remoteAssignments[roomName];
            if (!assignment || assignment.scouting) continue;
            
            for (const sourceId in assignment.sources) {
                const sourceAssignment = assignment.sources[sourceId];
                
                if (!sourceAssignment.harvester) {
                    neededRemoteHarvesters++;
                }
                if (!sourceAssignment.hauler && sourceAssignment.harvester) {
                    neededHaulers++;
                }
            }
            
            // Check if we need a claimer
            const remoteRoom = Game.rooms[roomName];
            if (remoteRoom && remoteRoom.controller) {
                const reservation = remoteRoom.controller.reservation;
                if (!reservation || reservation.ticksToEnd < 1000) {
                    if (!assignment.claimer) {
                        neededClaimers++;
                    }
                }
            }
        }
        
        // Always want at least 1 scout if we don't have one
        if (scouts < 1) {
            neededScouts = 1;
        }
        
        // Store needed counts in memory for SpawnManager to use
        room.memory.neededRemoteHarvesters = neededRemoteHarvesters;
        room.memory.neededHaulers = neededHaulers;
        room.memory.neededClaimers = neededClaimers;
        room.memory.neededScouts = neededScouts;
    }
}

class CreepManager {
    constructor() {
        this.roles = {
            harvester: new Harvester(),
            upgrader: new Upgrader(),
            builder: new Builder(),
            repairer: new Repairer(),
            runner: new Runner(),
            remoteharvester: new RemoteHarvester(),
            hauler: new Hauler(),
            claimer: new Claimer(),
            defender: new Defender(),
            attacker: new Attacker(),
            healer: new Healer(),
            scout: new Scout()
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
        
        // Phase 4+: If we're in stationary mode, continue with Phase 4+ logic
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

module.exports.loop = function() {
    if (!global.MokitoInstance) {
        global.MokitoInstance = new Mokito();
        console.log('*** Greetings from Mokito! ***');
        console.log('Current Game Tick:', Game.time);
    }
    global.MokitoInstance.run();
};
