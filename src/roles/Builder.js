'use strict';

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

module.exports = Builder;
