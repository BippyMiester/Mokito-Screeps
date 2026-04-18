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
     * RULE: If runners exist, ALWAYS stationary harvest (runners will collect)
     * RULE: Only go traditional if NO RUNNERS exist (emergency Phase 1)
     */
    getRoomMode(room) {
        // Check for runners
        const runners = room.find(FIND_MY_CREEPS, {
            filter: c => c.memory.role === 'runner'
        });

        // If runners exist, ALWAYS use stationary mode (runners will pick up energy)
        if (runners.length >= 1) {
            if (Memory.rooms[room.name].harvesterMode !== 'stationary') {
                Memory.rooms[room.name].harvesterMode = 'stationary';
            }
            return 'stationary';
        }

        // NO RUNNERS: Must use traditional mode (harvesters deliver to spawn)
        if (Memory.rooms[room.name].harvesterMode === 'stationary') {
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
            // Source regenerating - move to position anyway
            creep.moveTo(source);
            creep.say('⏳ regen');
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

        // Priority 4: No energy available - mine it ourselves
        // Runners have WORK parts, so they can mine as backup
        const source = creep.pos.findClosestByPath(FIND_SOURCES);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
            } else {
                creep.say('⛏️ mine');
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
        
        // No energy to collect and no energy stored - help with construction or upgrading
        // Don't just wait idle, find something useful to do
        
        // Try to find construction sites to help build
        const constructionSite = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        if (constructionSite && creep.store[RESOURCE_ENERGY] > 0) {
            if (creep.build(constructionSite) === ERR_NOT_IN_RANGE) {
                creep.moveTo(constructionSite, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            creep.say('🔨 help');
            return;
        }
        
        // Help repair roads if damaged
        const damagedRoad = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.5
        });
        if (damagedRoad && creep.store[RESOURCE_ENERGY] > 0) {
            if (creep.repair(damagedRoad) === ERR_NOT_IN_RANGE) {
                creep.moveTo(damagedRoad, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            creep.say('🔧 repair');
            return;
        }
        
        // Return to spawn area but don't get stuck
        const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
        if (spawn && !creep.pos.inRangeTo(spawn, 5)) {
            creep.moveTo(spawn, {
                range: 3,
                visualizePathStyle: { stroke: '#ffaa00' }
            });
            creep.say('🏠 return');
        } else if (spawn) {
            // Near spawn, help upgrade controller
            this.upgradeController(creep);
        } else {
            // No spawn? Help upgrade anyway
            this.upgradeController(creep);
        }
    }

    deliverEnergy(creep) {
        // Get all possible delivery targets and sort by priority
        // Priority: Spawn -> Extensions -> Storage (NO towers in runner priority)
        const targets = [];
        
        // Priority 1: Spawn (always fill first for spawning)
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
        
        // Priority 3: Storage - if spawn and extensions are all full
        if (targets.length === 0 || (targets.length === 1 && targets[0].type === 'spawn')) {
            const storage = creep.room.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType === STRUCTURE_STORAGE &&
                            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            })[0];
            if (storage) {
                targets.push({ type: 'storage', obj: storage });
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
        // Priority 1: Build construction sites
        const constructionSite = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        if (constructionSite) {
            if (creep.build(constructionSite) === ERR_NOT_IN_RANGE) {
                creep.moveTo(constructionSite, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            creep.say('🔨 help');
            return;
        }

        // Priority 2: Ramparts (highest priority for defense)
        const rampart = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_RAMPART &&
                        s.hits < s.hitsMax * 0.8 // Repair when below 80%
        });

        if (rampart) {
            if (creep.repair(rampart) === ERR_NOT_IN_RANGE) {
                creep.moveTo(rampart);
            }
            creep.say('🛡️ rampart');
            return;
        }

        // Priority 3: Containers (critical for energy flow)
        const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER &&
                        s.hits < s.hitsMax * 0.8
        });

        if (container) {
            if (creep.repair(container) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container);
            }
            creep.say('🔧 repair');
            return;
        }

        // Priority 4: Roads
        const road = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_ROAD &&
                        s.hits < s.hitsMax * 0.5
        });

        if (road) {
            if (creep.repair(road) === ERR_NOT_IN_RANGE) {
                creep.moveTo(road);
            }
            creep.say('🔧 repair');
            return;
        }

        // Priority 5: Walls (lowest priority)
        const wall = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_WALL &&
                        s.hits < s.hitsMax * 0.5
        });

        if (wall) {
            if (creep.repair(wall) === ERR_NOT_IN_RANGE) {
                creep.moveTo(wall);
            }
            creep.say('🔧 wall');
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
            const assignment = remoteAssignments[roomName];
            if (!assignment || !assignment.sources) continue;
            
            for (const sourceId in assignment.sources) {
                const sourceData = assignment.sources[sourceId];
                // Ensure sourceData is an object, not a boolean or primitive
                if (typeof sourceData !== 'object' || sourceData === null) {
                    // Fix corrupted data structure
                    assignment.sources[sourceId] = {
                        harvester: null,
                        hauler: null,
                        containerBuilt: false,
                        containerId: null
                    };
                    continue;
                }
                
                if (!sourceData.harvester) {
                    creep.memory.remoteRoom = roomName;
                    creep.memory.sourceId = sourceId;
                    sourceData.harvester = creep.name;
                    return;
                }
            }
        }
        
        // No assignment found - go to any remote room
        for (const roomName in remoteAssignments) {
            creep.memory.remoteRoom = roomName;
            creep.say('🌍 ' + roomName);
            return;
        }
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
                    const sourceData = sources[sourceId];
                    // Ensure sourceData is an object
                    if (typeof sourceData !== 'object' || sourceData === null) {
                        continue;
                    }
                    if (sourceData.harvester && !sourceData.hauler) {
                        creep.memory.sourceId = sourceId;
                        creep.memory.containerId = sourceData.containerId;
                        sourceData.hauler = creep.name;
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
            // Container empty - go back to home room
            if (creep.room.name !== creep.memory.homeRoom) {
                this.travelToHomeRoom(creep);
                creep.say('🏠 home');
            } else {
                // Already home - look for other sources
                creep.say('❌ empty');
                const storage = creep.room.find(FIND_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0
                })[0];
                if (storage) {
                    creep.moveTo(storage);
                    creep.say('📦 storage');
                }
            }
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
        
        // Initialize Memory.rooms if not exists
        if (!Memory.rooms) {
            Memory.rooms = {};
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
        // Allow up to 8 construction sites, but prioritize extensions
        if (sites.length >= 8) return;
        
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
            this.buildDefensiveWalls(room); // Phase 6: Walls with 1 rampart per exit
        }
        
        if (rcl >= 3) {
            this.buildContainers(room); // Phase 4: Containers at sources (RCL 3 unlocks containers)
            this.buildTower(room); // Phase 7: Towers (RCL 3 unlocks 1 tower)
        }
        
        if (rcl >= 4) {
            this.buildStorage(room); // Phase 8: Storage (RCL 4 unlocks storage)
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
        
        // Get current extension count (built + construction sites)
        const extensions = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_EXTENSION }
        });
        const extensionSites = room.find(FIND_CONSTRUCTION_SITES, {
            filter: { structureType: STRUCTURE_EXTENSION }
        });
        
        const totalCount = extensions.length + extensionSites.length;
        const maxExtensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
        
        // Build up to 5 extensions or max allowed, whichever is less
        const targetExtensions = Math.min(5, maxExtensions);
        
        if (totalCount < targetExtensions) {
            const needed = targetExtensions - totalCount;
            // Try to place ALL remaining extensions at once
            let placed = 0;
            for (let attempt = 0; attempt < needed * 50 && placed < needed; attempt++) {
                const result = this.placeExtensionPattern(room, spawn.pos, totalCount + placed, targetExtensions);
                if (result) {
                    placed++;
                } else {
                    break;
                }
            }
        }
    }
    
    /**
     * Place extensions in a diamond pattern around spawn for optimal pathing
     * Avoids roads, existing structures, and sources
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
        
        // Get sources to avoid building too close
        const sources = room.find(FIND_SOURCES);
        
        // Try each position in pattern
        for (let i = 0; i < pattern.length; i++) {
            const offset = pattern[i];
            const x = spawnPos.x + offset.x;
            const y = spawnPos.y + offset.y;
            
            if (x >= 2 && x <= 47 && y >= 2 && y <= 47) {
                const pos = new RoomPosition(x, y, room.name);
                
                // Check if this position is valid
                if (this.isValidExtensionPosition(room, pos, sources)) {
                    const result = pos.createConstructionSite(STRUCTURE_EXTENSION);
                    if (result === OK) {
                        return true; // Success
                    }
                }
            }
        }
        
        // If pattern didn't work, try random positions near spawn
        return this.placeExtensionRandom(room, spawnPos, currentCount, maxCount, sources);
    }
    
    /**
     * Check if a position is valid for placing an extension
     */
    isValidExtensionPosition(room, pos, sources) {
        const terrain = pos.lookFor(LOOK_TERRAIN);
        
        // Check for walls
        if (terrain.length > 0 && terrain[0] === 'wall') {
            return false;
        }
        
        // Check for existing structures
        const structures = pos.lookFor(LOOK_STRUCTURES);
        if (structures.length > 0) {
            return false; // Blocked by structure
        }
        
        // Check for construction sites
        const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
        if (sites.length > 0) {
            return false; // Already has construction site
        }
        
        // Check for roads (don't build over roads)
        const roads = pos.lookFor(LOOK_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_ROAD
        });
        if (roads.length > 0) {
            return false;
        }
        
        // Check for road construction sites
        const roadSites = pos.lookFor(LOOK_CONSTRUCTION_SITES, {
            filter: s => s.structureType === STRUCTURE_ROAD
        });
        if (roadSites.length > 0) {
            return false;
        }
        
        // Check distance from sources (must be at least 2 tiles away)
        for (const source of sources) {
            if (pos.getRangeTo(source) < 2) {
                return false; // Too close to source
            }
        }
        
        return true;
    }
    
    /**
     * Place extension at random valid position near spawn
     */
    placeExtensionRandom(room, spawnPos, currentCount, maxCount, sources) {
        // Try positions in increasing distance from spawn
        for (let range = 2; range <= 10; range++) {
            for (let dx = -range; dx <= range; dx++) {
                for (let dy = -range; dy <= range; dy++) {
                    // Only check positions at this exact range
                    if (Math.abs(dx) + Math.abs(dy) !== range) continue;
                    
                    const x = spawnPos.x + dx;
                    const y = spawnPos.y + dy;
                    
                    if (x >= 2 && x <= 47 && y >= 2 && y <= 47) {
                        const pos = new RoomPosition(x, y, room.name);
                        
                        if (this.isValidExtensionPosition(room, pos, sources)) {
                            const result = pos.createConstructionSite(STRUCTURE_EXTENSION);
                            if (result === OK) {
                                return;
                            }
                        }
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
    
    buildDefensiveWalls(room) {
        // Phase 6: Build walls at room entrances with 1 rampart per exit
        // Strategy: Build walls along exit line, place 1 rampart in center for clear path
        // Rampart allows walking through, creating a chokepoint
        
        const exitDirections = [FIND_EXIT_TOP, FIND_EXIT_RIGHT, FIND_EXIT_BOTTOM, FIND_EXIT_LEFT];
        
        for (const exitDir of exitDirections) {
            const exitPositions = room.find(exitDir);
            if (exitPositions.length === 0) continue;
            
            // Find positions 2 tiles from the exit
            const defensivePositions = this.getDefensiveLine(room, exitDir, exitPositions);
            
            if (defensivePositions.length === 0) continue;
            
            // Find center position for rampart - this creates the clear path
            const centerIndex = Math.floor(defensivePositions.length / 2);
            
            // Build walls at all positions except center (rampart)
            for (let i = 0; i < defensivePositions.length; i++) {
                const pos = defensivePositions[i];
                const isCenter = (i === centerIndex);
                
                // Skip if there's already a structure or construction site
                const structures = pos.lookFor(LOOK_STRUCTURES);
                const hasWall = structures.some(s => s.structureType === STRUCTURE_WALL);
                const hasRampart = structures.some(s => s.structureType === STRUCTURE_RAMPART);
                
                if (hasWall || hasRampart) continue;
                
                const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                const hasWallSite = sites.some(s => s.structureType === STRUCTURE_WALL);
                const hasRampartSite = sites.some(s => s.structureType === STRUCTURE_RAMPART);
                
                if (hasWallSite || hasRampartSite) continue;
                
                // Place rampart at center (creates clear path), walls elsewhere (blocks path)
                if (isCenter) {
                    pos.createConstructionSite(STRUCTURE_RAMPART);
                } else {
                    pos.createConstructionSite(STRUCTURE_WALL);
                }
                return; // Build one per tick
            }
        }
    }
    
    /**
     * Get defensive line positions 2 tiles from an exit
     * Creates a line of positions until hitting a wall or connecting to walls
     */
    getDefensiveLine(room, exitDir, exitPositions) {
        const defensivePositions = [];
        const terrain = room.getTerrain();
        
        // Determine direction offset based on exit direction
        let dx = 0, dy = 0;
        switch (exitDir) {
            case FIND_EXIT_TOP: dy = 2; break;      // Move down 2 from top
            case FIND_EXIT_RIGHT: dx = -2; break;   // Move left 2 from right
            case FIND_EXIT_BOTTOM: dy = -2; break;  // Move up 2 from bottom
            case FIND_EXIT_LEFT: dx = 2; break;     // Move right 2 from left
        }
        
        // Get the line of positions 2 tiles from exit
        for (const exitPos of exitPositions) {
            const x = exitPos.x + dx;
            const y = exitPos.y + dy;
            
            if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
                // Check if this position is valid (not a wall)
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    const pos = new RoomPosition(x, y, room.name);
                    
                    // Check if position is on a path (road or frequently used)
                    // Also extend the line to create a barrier
                    const extendedPositions = this.extendDefensiveLine(room, pos, exitDir, terrain);
                    defensivePositions.push(...extendedPositions);
                }
            }
        }
        
        // Remove duplicates
        const uniquePositions = [];
        const seen = new Set();
        for (const pos of defensivePositions) {
            const key = `${pos.x},${pos.y}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniquePositions.push(pos);
            }
        }
        
        return uniquePositions;
    }
    
    /**
     * Extend defensive line horizontally/vertically to create a barrier
     */
    extendDefensiveLine(room, startPos, exitDir, terrain) {
        const positions = [startPos];
        
        // Determine extension direction (perpendicular to exit)
        let extendX = 0, extendY = 0;
        if (exitDir === FIND_EXIT_TOP || exitDir === FIND_EXIT_BOTTOM) {
            extendX = 1; // Extend horizontally
        } else {
            extendY = 1; // Extend vertically
        }
        
        // Extend in both directions until hitting walls
        const directions = [1, -1];
        for (const dir of directions) {
            let x = startPos.x + extendX * dir;
            let y = startPos.y + extendY * dir;
            
            while (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
                // Stop if we hit a wall
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) break;
                
                // Stop if we hit an existing wall or rampart
                const pos = new RoomPosition(x, y, room.name);
                const structures = pos.lookFor(LOOK_STRUCTURES);
                const hasBarrier = structures.some(s => 
                    s.structureType === STRUCTURE_WALL || 
                    s.structureType === STRUCTURE_RAMPART
                );
                
                if (hasBarrier) break;
                
                positions.push(pos);
                
                // Continue extending
                x += extendX * dir;
                y += extendY * dir;
                
                // Limit extension to reasonable length
                if (positions.length > 10) break;
            }
        }
        
        return positions;
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
 * SpawnManager - Manages creep spawning with NEW phase-based priority system
 *
 * NEW PHASE STRUCTURE (2026-04-18):
 * Phase 1: Harvesters = open_spaces / 2
 * Phase 2: Upgraders = 3
 * Phase 3: Builders = 3 + Extensions
 * Phase 4: Runners = 3, Repairers = 2 (first runner triggers stationary)
 * Phase 5: Roads (10+)
 * Phase 6: Ramparts at exits
 *
 * ENERGY RESERVE: Always maintain 35% energy reserve
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

        // Calculate source positions
        const sources = room.find(FIND_SOURCES);
        let totalSourcePositions = 0;
        for (const source of sources) {
            totalSourcePositions += this.countOpenPositions(source);
        }

        // Update spawn priority info
        const nextSpawns = this.getNextSpawnPriority(room, harvesters.length, upgraders.length, builders.length, repairers.length, runners.length, totalSourcePositions);
        room.memory.spawnPriority = nextSpawns;

        // Energy budget logic
        // Phase 1 (no creeps): Use full energy to bootstrap
        // Later phases: Maintain 35% reserve for emergencies
        const minReserve = creeps.length < 3 ? 0 : Math.floor(energyCapacity * 0.35);
        const usableEnergy = energyAvailable - minReserve;

        // Minimum 200 energy needed for basic creep [WORK, CARRY, MOVE]
        if (energyAvailable < 200) {
            room.memory.waitingForEnergy = true;
            return;
        }
        room.memory.waitingForEnergy = false;

        // === PHASE 1: HARVESTERS ===
        // Required: open_spaces / 2 (rounded down)
        const requiredHarvesters = Math.ceil(totalSourcePositions / 2);
        if (harvesters.length < requiredHarvesters) {
            this.spawnHarvester(spawn, sources, room, creeps);
            return;
        }

        // === PHASE 2: UPGRADERS ===
        // Required: 3 upgraders
        if (upgraders.length < 3) {
            this.spawnUpgrader(spawn, energyCapacity, room, creeps);
            return;
        }

        // === PHASE 3: BUILDERS ===
        // Required: 3 builders
        if (builders.length < 3) {
            this.spawnBuilder(spawn, energyCapacity, room, creeps);
            return;
        }

        // === PHASE 4: RUNNERS + REPAIRERS ===
        // Required: 3 runners, 2 repairers
        // First runner triggers stationary mode

        if (runners.length < 3) {
            // First runner triggers stationary harvesting
            if (runners.length === 0 && !room.memory.stationaryMode) {
                room.memory.stationaryMode = true;
                room.memory.harvesterMode = 'stationary';
            }
            this.spawnRunner(spawn, energyCapacity, room, creeps);
            return;
        }

        if (repairers.length < 2) {
            this.spawnRepairer(spawn, energyCapacity, room, creeps);
            return;
        }

        // Phases 5-6 are handled by ConstructionManager (roads, ramparts)
        // No additional creeps needed beyond Phase 4
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
                if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
                    if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                        count++;
                    }
                }
            }
        }
        return count;
    }

    /**
     * Get spawn priority for heartbeat display
     */
    getNextSpawnPriority(room, harvesterCount, upgraderCount, builderCount, repairerCount, runnerCount, totalSourcePositions) {
        const requiredHarvesters = Math.ceil(totalSourcePositions / 2);
        const priorities = [];

        // Phase 1: Harvesters
        if (harvesterCount < requiredHarvesters) {
            priorities.push({
                role: 'harvester',
                emoji: '🌱',
                reason: `${harvesterCount}/${requiredHarvesters} harvesters (Phase 1)`,
                priority: 1
            });
        }

        // Phase 2: Upgraders
        if (upgraderCount < 3) {
            priorities.push({
                role: 'upgrader',
                emoji: '⚡',
                reason: `${upgraderCount}/3 upgraders (Phase 2)`,
                priority: 1
            });
        }

        // Phase 3: Builders
        if (builderCount < 3) {
            priorities.push({
                role: 'builder',
                emoji: '🔨',
                reason: `${builderCount}/3 builders (Phase 3)`,
                priority: 1
            });
        }

        // Phase 4: Runners
        if (runnerCount < 3) {
            priorities.push({
                role: 'runner',
                emoji: '🏃',
                reason: `${runnerCount}/3 runners (Phase 4)`,
                priority: 1
            });
        }

        // Phase 4: Repairers
        if (repairerCount < 2) {
            priorities.push({
                role: 'repairer',
                emoji: '🔧',
                reason: `${repairerCount}/2 repairers (Phase 4)`,
                priority: 1
            });
        }

        // All phases complete
        if (priorities.length === 0) {
            priorities.push({
                role: 'upgrader',
                emoji: '⚡',
                reason: 'All creeps spawned - maintaining',
                priority: 1
            });
        }

        return priorities;
    }

    // ==================== SPAWN METHODS ====================

    spawnHarvester(spawn, sources, room, creeps) {
        // Find source with fewest harvesters
        let bestSource = sources[0];
        let minHarvesters = Infinity;

        for (const source of sources) {
            const harvestersAtSource = creeps.filter(c =>
                c.memory.role === 'harvester' && c.memory.sourceId === source.id
            ).length;
            if (harvestersAtSource < minHarvesters) {
                minHarvesters = harvestersAtSource;
                bestSource = source;
            }
        }

        const name = 'Harvester' + Game.time;
        const result = spawn.spawnCreep([WORK, CARRY, MOVE], name, {
            memory: {
                role: 'harvester',
                sourceId: bestSource.id,
                delivering: false
            }
        });

        if (result === OK) {
            console.log(`🌱 Spawning harvester for source ${bestSource.id}`);
        }
    }

    spawnUpgrader(spawn, energyCapacity, room, creeps) {
        const name = 'Upgrader' + Game.time;
        const result = spawn.spawnCreep([WORK, CARRY, MOVE], name, {
            memory: { role: 'upgrader' }
        });

        if (result === OK) {
            console.log('⚡ Spawning upgrader');
        }
    }

    spawnBuilder(spawn, energyCapacity, room, creeps) {
        const name = 'Builder' + Game.time;
        const result = spawn.spawnCreep([WORK, CARRY, MOVE], name, {
            memory: { role: 'builder' }
        });

        if (result === OK) {
            console.log('🔨 Spawning builder');
        }
    }

    spawnRunner(spawn, energyCapacity, room, creeps) {
        const name = 'Runner' + Game.time;
        // Add WORK part so runners can mine as backup when no energy is available
        const result = spawn.spawnCreep([WORK, CARRY, CARRY, MOVE, MOVE], name, {
            memory: { role: 'runner' }
        });

        if (result === OK) {
            console.log('🏃 Spawning runner');
        }
    }

    spawnRepairer(spawn, energyCapacity, room, creeps) {
        const name = 'Repairer' + Game.time;
        const result = spawn.spawnCreep([WORK, CARRY, MOVE], name, {
            memory: { role: 'repairer' }
        });

        if (result === OK) {
            console.log('🔧 Spawning repairer');
        }
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
                    // Towers repair as long as they have ANY energy
                    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                        tower.repair(damagedStructures[0]);
                    }
                }
            }
            
            // Repair walls/ramparts if enough energy
            const defenseStructures = room.find(FIND_MY_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && s.hits < 100000
            });
            
            if (defenseStructures.length > 0) {
                defenseStructures.sort((a, b) => a.hits - b.hits);
                for (const tower of towers) {
                    // Repair as long as tower has energy (removed 80% threshold)
                    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
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
        
        // Scout for new rooms - do immediately if no remote rooms known, then every 100 ticks
        if (room.memory.remoteRooms.length === 0 || Game.time % 100 === 0) {
            this.scoutRemoteRooms(room);
        }
        
        // Update assignments for existing remote rooms
        this.updateRemoteAssignments(room);
        
        // Spawn remote workers if needed
        this.spawnRemoteWorkers(room);
        
        // Debug logging - remove after fixing
        if (Game.time % 60 === 0) {
            console.log(`Remote: ${room.memory.remoteRooms.length} rooms, need: RH:${room.memory.neededRemoteHarvesters} H:${room.memory.neededHaulers} C:${room.memory.neededClaimers}`);
        }
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
                if (!sourceAssignment.hauler && sourceAssignment.harvester && neededHaulers < 3) {
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
        const requiredHarvesters = Math.ceil(metrics.totalSourcePositions / 2);

        switch (phase) {
            case 1: // Phase 1: Harvesters
                return metrics.harvesters >= requiredHarvesters;

            case 2: // Phase 2: Upgraders
                return metrics.harvesters >= requiredHarvesters &&
                       metrics.upgraders >= 3;

            case 3: // Phase 3: Builders + Extensions
                // Must have 5 extensions FULLY BUILT (not just construction sites)
                return metrics.harvesters >= requiredHarvesters &&
                       metrics.upgraders >= 3 &&
                       metrics.builders >= 3 &&
                       metrics.extensions >= 5;

            case 4: // Phase 4: Runners + Repairers (Stationary)
                // Must STILL have 5 extensions built from Phase 3
                return metrics.harvesters >= requiredHarvesters &&
                       metrics.upgraders >= 3 &&
                       metrics.builders >= 3 &&
                       metrics.extensions >= 5 &&
                       metrics.runners >= 3 &&
                       metrics.repairers >= 2;

            case 5: // Phase 5: Road Network
                // Must STILL have 5 extensions built
                if (!this.checkPhaseCriteria(4, metrics)) return false;
                return metrics.extensions >= 5 && metrics.roads >= 10;

            case 6: // Phase 6: Ramparts
                // Must STILL have 5 extensions built
                if (!this.checkPhaseCriteria(5, metrics)) return false;
                return metrics.extensions >= 5 && metrics.ramparts >= 3;

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
     * Returns what's needed to ADVANCE to the next phase
     */
    getNextPhaseRequirements(currentPhase, metrics) {
        const requiredHarvesters = Math.ceil(metrics.totalSourcePositions / 2);

        switch (currentPhase) {
            case 1:
                return ['3+ upgraders (for Phase 2)'];
            case 2:
                return ['3+ builders', '5+ extensions BUILT (for Phase 3)'];
            case 3:
                return ['3+ runners', '2+ repairers (for Phase 4)'];
            case 4:
                return ['10+ roads (for Phase 5)'];
            case 5:
                return ['Ramparts at exits (for Phase 6)'];
            case 6:
                return ['Phase 6 complete!'];
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

module.exports.loop = function() {
    if (!global.MokitoInstance) {
        global.MokitoInstance = new Mokito();
        console.log('*** Greetings from Mokito! ***');
        console.log('Current Game Tick:', Game.time);
    }
    global.MokitoInstance.run();
};
