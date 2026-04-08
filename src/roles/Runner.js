'use strict';

/**
 * Runner - Transports energy from dropped locations to spawn/extensions
 * Used in stationary harvesting mode to move energy from harvester drops to storage
 */
class Runner {
    run(creep) {
        // State: collecting or delivering
        if (creep.memory.delivering && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.delivering = false;
            creep.say('🔍 collect');
        }
        if (!creep.memory.delivering && creep.store.getFreeCapacity() === 0) {
            creep.memory.delivering = true;
            creep.say('📦 deliver');
        }

        if (creep.memory.delivering) {
            this.deliverEnergy(creep);
        } else {
            this.collectEnergy(creep);
        }
    }

    collectEnergy(creep) {
        // Priority 1: Dropped energy near sources (from stationary harvesters)
        const droppedEnergy = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount >= 50
        });

        if (droppedEnergy) {
            if (creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
                creep.moveTo(droppedEnergy, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            } else {
                // Successfully picked up, check if full
                if (creep.store.getFreeCapacity() === 0) {
                    creep.memory.delivering = true;
                    creep.say('📦 deliver');
                }
            }
            return;
        }

        // Priority 2: Any dropped energy (even small amounts)
        const anyDroppedEnergy = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY && resource.amount >= 20
        });

        if (anyDroppedEnergy) {
            if (creep.pickup(anyDroppedEnergy) === ERR_NOT_IN_RANGE) {
                creep.moveTo(anyDroppedEnergy, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            } else {
                if (creep.store.getFreeCapacity() === 0) {
                    creep.memory.delivering = true;
                    creep.say('📦 deliver');
                }
            }
            return;
        }

        // Priority 3: Containers/Storage
        const storage = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: (s) => (s.structureType === STRUCTURE_CONTAINER ||
                           s.structureType === STRUCTURE_STORAGE) &&
                           s.store[RESOURCE_ENERGY] > 0
        });

        if (storage) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage);
            } else {
                if (creep.store.getFreeCapacity() === 0) {
                    creep.memory.delivering = true;
                    creep.say('📦 deliver');
                }
            }
            return;
        }

        // If no energy available, check if we have energy to upgrade controller
        if (creep.store[RESOURCE_ENERGY] > 0) {
            // Have energy but nothing to collect - upgrade as idle behavior
            this.upgradeController(creep);
            return;
        }
        
        // No energy to collect and no energy stored - wait near sources
        const sources = creep.room.find(FIND_SOURCES);
        if (sources.length > 0) {
            // Find source with most dropped energy nearby
            let bestSource = sources[0];
            let maxDropped = 0;
            
            for (const source of sources) {
                const dropped = source.pos.findInRange(FIND_DROPPED_RESOURCES, 3, {
                    filter: r => r.resourceType === RESOURCE_ENERGY
                });
                const totalDropped = dropped.reduce((sum, r) => sum + r.amount, 0);
                if (totalDropped > maxDropped) {
                    maxDropped = totalDropped;
                    bestSource = source;
                }
            }
            
            creep.moveTo(bestSource, {
                range: 3,
                visualizePathStyle: { stroke: '#ffaa00' }
            });
            creep.say('⏳ waiting');
        }
    }

    deliverEnergy(creep) {
        // Get all possible delivery targets and sort by priority
        const targets = [];
        
        // Priority 1: Spawn
        const spawn = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_SPAWN &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (spawn) targets.push({ type: 'spawn', obj: spawn });
        
        // Priority 2: Extensions
        const extensions = creep.room.find(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_EXTENSION &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (extensions.length > 0) {
            // Find closest extension
            const closestExtension = creep.pos.findClosestByPath(extensions);
            if (closestExtension) {
                targets.push({ type: 'extension', obj: closestExtension });
            }
        }
        
        // Priority 3: Towers
        const towers = creep.room.find(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_TOWER &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 100
        });
        if (towers.length > 0) {
            const closestTower = creep.pos.findClosestByPath(towers);
            if (closestTower) {
                targets.push({ type: 'tower', obj: closestTower });
            }
        }
        
        // Try to deliver to each target in order
        for (const target of targets) {
            const result = creep.transfer(target.obj, RESOURCE_ENERGY);
            
            if (result === OK) {
                // Successfully transferred
                if (creep.store[RESOURCE_ENERGY] === 0) {
                    creep.memory.delivering = false;
                    creep.say('🔍 collect');
                }
                return;
            } else if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(target.obj, {
                    visualizePathStyle: { stroke: '#ffffff' }
                });
                return;
            } else if (result === ERR_FULL) {
                // Target is full, continue to next target
                continue;
            }
            // Other errors - try next target
        }
        
        // If all targets are full or none available
        // Drop energy so we can collect more, or wait near spawn
        if (creep.store[RESOURCE_ENERGY] > 0) {
            // Find spawn to drop near
            const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
            if (spawn) {
                if (!creep.pos.inRangeTo(spawn, 2)) {
                    creep.moveTo(spawn, { range: 2 });
                } else {
                    // Near spawn - drop energy so we can keep collecting
                    creep.drop(RESOURCE_ENERGY);
                    creep.memory.delivering = false;
                    creep.say('💧 drop');
                }
            } else {
                // No spawn? Just drop here
                creep.drop(RESOURCE_ENERGY);
                creep.memory.delivering = false;
                creep.say('💧 drop');
            }
        } else {
            // No energy to deliver, go collect
            creep.memory.delivering = false;
            creep.say('🔍 collect');
        }
    }

    // Idle behavior: Upgrade controller when nothing to deliver
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

module.exports = Runner;
