'use strict';

/**
 * Builder - Builds construction sites
 * Priority: Dropped energy > Containers/Storage > Self-mining
 * Idle behavior: Upgrades controller
 * NEVER takes from spawn - keeps spawn energy for creep spawning
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
            // No construction sites - repair roads or containers
            const didRepair = this.repair(creep);
            
            // If nothing to repair either, upgrade controller as idle behavior
            if (!didRepair) {
                this.upgradeController(creep);
            }
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
