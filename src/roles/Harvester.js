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

module.exports = Harvester;
