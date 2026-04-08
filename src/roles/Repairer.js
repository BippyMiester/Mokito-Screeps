'use strict';

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

module.exports = Repairer;
