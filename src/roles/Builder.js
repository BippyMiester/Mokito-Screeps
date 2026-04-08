'use strict';

/**
 * Builder - Picks up dropped energy and builds construction sites
 * Does NOT mine - only collects dropped energy
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

        // Priority 3: Spawn (emergency only)
        const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS, {
            filter: (s) => s.store[RESOURCE_ENERGY] > 200
        });

        if (spawn) {
            if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(spawn);
            }
            return;
        }

        // If no energy available, wait near sources
        const sources = creep.room.find(FIND_SOURCES);
        if (sources.length > 0) {
            creep.moveTo(sources[0], {
                range: 3,
                visualizePathStyle: { stroke: '#ffaa00' }
            });
            creep.say('⏳ waiting');
        }
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

module.exports = Builder;
