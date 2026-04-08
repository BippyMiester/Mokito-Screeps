'use strict';

/**
 * Upgrader - Upgrades room controller
 * Priority: Dropped energy > Containers/Storage > Self-mining
 * NEVER takes from spawn - keeps spawn energy for creep spawning
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

        // Priority 3: Mine energy yourself (if stationary harvesters not available)
        // Upgraders should NOT take from spawn - only from ground or containers
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

module.exports = Upgrader;
