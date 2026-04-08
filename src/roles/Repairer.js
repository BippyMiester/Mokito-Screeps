'use strict';

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

module.exports = Repairer;
