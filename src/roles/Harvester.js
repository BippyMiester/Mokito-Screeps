'use strict';

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
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target);
                }
            }
        } else {
            // Harvest from assigned source
            const source = Game.getObjectById(creep.memory.sourceId);
            if (source) {
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source);
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

module.exports = Harvester;