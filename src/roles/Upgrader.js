'use strict';

/**
 * Upgrader - Picks up dropped energy from harvesters and upgrades controller
 * Does NOT mine - only collects dropped energy
 */
class Upgrader {
    run(creep) {
        // State management
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.upgrading = false;
            creep.say('🔍 collect');
        }
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() === 0) {
            creep.memory.upgrading = true;
            creep.say('⚡ upgrade');
        }

        if (creep.memory.upgrading) {
            // Upgrade controller
            this.upgradeController(creep);
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

module.exports = Upgrader;
