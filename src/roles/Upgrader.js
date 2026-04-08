'use strict';

/**
 * Upgrader - Mines energy and upgrades controller
 * Priority: Self-mining (always) > Dropped energy (if available) > Containers/Storage
 * NEVER takes from spawn - upgraders are self-sufficient
 */
class Upgrader {
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
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.upgrading = false;
            creep.say('⛏️ collect');
        }
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() === 0) {
            creep.memory.upgrading = true;
            creep.say('⚡ upgrade');
        }

        if (creep.memory.upgrading) {
            // Upgrade controller
            this.upgradeController(creep);
        } else {
            // Collect energy - self-mine by default, but pick up dropped if available
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
        // Priority 1: Dropped energy (bonus if available from stationary harvesters)
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

        // Priority 2: Containers/Storage (if available)
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

        // Priority 3: Mine energy yourself (DEFAULT BEHAVIOR)
        // Upgraders are self-sufficient - they mine their own energy
        // This allows harvesters to focus on feeding the spawn for more creep production
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
