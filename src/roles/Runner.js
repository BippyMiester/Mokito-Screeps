'use strict';

/**
 * Runner - Transports energy from dropped locations to spawn/extensions
 * Used in stationary harvesting mode to move energy from harvester drops to storage
 */
class Runner {
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
        // Priority 1: Containers at sources (Phase 4+)
        const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
        });
        
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            }
            return;
        }
        
        // Priority 2: Dropped energy near sources (from stationary harvesters)
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
        
        // No energy to collect and no energy stored - return to spawn area
        // Don't wait idle in the middle of nowhere
        const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
        if (spawn) {
            creep.moveTo(spawn, {
                range: 3,
                visualizePathStyle: { stroke: '#ffaa00' }
            });
            creep.say('🏠 return');
        }
    }

    deliverEnergy(creep) {
        // Get all possible delivery targets and sort by priority
        // Priority: Spawn -> Towers (to 50%) -> Extensions
        const targets = [];
        
        // Priority 1: Spawn (always fill first for spawning)
        const spawn = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_SPAWN &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (spawn) targets.push({ type: 'spawn', obj: spawn });
        
        // Priority 2: Towers - fill to at least 50% before filling extensions
        // This ensures we have energy for defense
        const towers = creep.room.find(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_TOWER &&
                        s.store.getUsedCapacity(RESOURCE_ENERGY) < s.store.getCapacity(RESOURCE_ENERGY) * 0.5
        });
        if (towers.length > 0) {
            // Sort by lowest energy percentage (fill emptiest first)
            towers.sort((a, b) => {
                const pctA = a.store.getUsedCapacity(RESOURCE_ENERGY) / a.store.getCapacity(RESOURCE_ENERGY);
                const pctB = b.store.getUsedCapacity(RESOURCE_ENERGY) / b.store.getCapacity(RESOURCE_ENERGY);
                return pctA - pctB;
            });
            const neediestTower = towers[0];
            targets.push({ type: 'tower', obj: neediestTower });
        }
        
        // Priority 3: Extensions (only fill if towers are above 50%)
        const towersLow = creep.room.find(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_TOWER &&
                        s.store.getUsedCapacity(RESOURCE_ENERGY) < s.store.getCapacity(RESOURCE_ENERGY) * 0.5
        });
        
        if (towersLow.length === 0) {
            // All towers are above 50%, can fill extensions now
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
        }
        
        // Priority 4: Storage - if spawn, towers, and extensions are all full
        if (targets.length === 1) { // Only spawn in targets, everything else full
            const storage = creep.room.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType === STRUCTURE_STORAGE &&
                            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            })[0];
            if (storage) {
                targets.push({ type: 'storage', obj: storage });
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
