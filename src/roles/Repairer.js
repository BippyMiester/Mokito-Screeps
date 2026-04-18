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
        // Priority 1: Critical repairs (below 80% health)
        const criticalStructure = this.findCriticalRepair(creep);
        if (criticalStructure) {
            if (creep.repair(criticalStructure) === ERR_NOT_IN_RANGE) {
                creep.moveTo(criticalStructure);
            }
            creep.say('🔧 repair');
            return;
        }

        // Priority 2: Balanced wall/rampart upgrading (100k increments)
        const wallToUpgrade = this.findWallForBalancedUpgrade(creep);
        if (wallToUpgrade) {
            if (creep.repair(wallToUpgrade) === ERR_NOT_IN_RANGE) {
                creep.moveTo(wallToUpgrade);
            }
            creep.say('🧱 ' + Math.ceil(wallToUpgrade.hits / 100000) + '00k');
            return;
        }

        // Priority 3: Build construction sites
        const constructionSite = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        if (constructionSite) {
            if (creep.build(constructionSite) === ERR_NOT_IN_RANGE) {
                creep.moveTo(constructionSite, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            creep.say('🔨 build');
            return;
        }

        // Nothing to do - upgrade controller
        this.upgradeController(creep);
    }

    /**
     * Find structures needing critical repair (below 80% health)
     * Priority: Ramparts > Containers > Roads
     */
    findCriticalRepair(creep) {
        // Check ramparts first (80% threshold)
        const rampart = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_RAMPART &&
                        s.hits < s.hitsMax * 0.8
        });
        if (rampart) return rampart;

        // Check containers (80% threshold)
        const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER &&
                        s.hits < s.hitsMax * 0.8
        });
        if (container) return container;

        // Check roads (50% threshold)
        const road = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_ROAD &&
                        s.hits < s.hitsMax * 0.5
        });
        if (road) return road;

        return null;
    }

    /**
     * Find walls/ramparts for balanced upgrade in 100k increments
     * Ensures all walls reach each tier before moving to next
     */
    findWallForBalancedUpgrade(creep) {
        // Get all walls and ramparts
        const defenseStructures = creep.room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_WALL || 
                        s.structureType === STRUCTURE_RAMPART
        });

        if (defenseStructures.length === 0) return null;

        // Define upgrade tiers (100k, 200k, 300k, etc. up to 300M)
        const tiers = [100000, 200000, 300000, 400000, 500000, 
                      600000, 700000, 800000, 900000, 1000000,
                      2000000, 3000000, 4000000, 5000000, 
                      10000000, 20000000, 300000000];

        // Find current tier (lowest tier not yet reached by all structures)
        let currentTarget = null;
        for (const tier of tiers) {
            // Check if any structure is below this tier
            const structuresBelowTier = defenseStructures.filter(s => s.hits < tier);
            if (structuresBelowTier.length > 0) {
                // This is our current target tier
                currentTarget = tier;
                break;
            }
        }

        if (!currentTarget) return null; // All structures at max tier

        // Find structure closest to current target tier that needs repair
        // Prioritize those below the current target tier
        let targetStructure = null;
        let lowestHits = Infinity;

        for (const structure of defenseStructures) {
            if (structure.hits < currentTarget && structure.hits < lowestHits) {
                // Check range
                const range = creep.pos.getRangeTo(structure);
                if (range <= 15) { // Within reasonable range
                    lowestHits = structure.hits;
                    targetStructure = structure;
                }
            }
        }

        // If we found a structure below target tier, return it
        if (targetStructure) return targetStructure;

        // Otherwise, find closest structure that could use repair
        return creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_WALL || 
                         s.structureType === STRUCTURE_RAMPART) &&
                         s.hits < s.hitsMax
        });
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
