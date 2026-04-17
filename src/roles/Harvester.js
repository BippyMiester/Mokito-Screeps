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

        // Check for runners - if no runners, MUST use traditional mode
        // Otherwise energy sits at sources and spawn can't get it
        const runners = room.find(FIND_MY_CREEPS, {
            filter: c => c.memory.role === 'runner'
        });

        // Emergency: If less than 2 harvesters OR no runners, force traditional mode
        if (harvesters.length < 2 || runners.length < 1) {
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

        // Switch to stationary when we have harvesters >= positions AND RCL >= 2 AND we have runners
        if (harvesters.length >= totalPositions && room.controller.level >= 2 && runners.length >= 1) {
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

module.exports = Harvester;
