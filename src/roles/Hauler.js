'use strict';

/**
 * Hauler - Transports energy from remote rooms to home room
 * Collects from containers built by RemoteHarvesters
 * Delivers to home room storage or spawn
 */
class Hauler {
    run(creep) {
        // Initialize if needed
        if (!creep.memory.remoteRoom) {
            this.assignRemoteRoom(creep);
        }
        
        // State management
        if (creep.memory.collecting && creep.store.getFreeCapacity() === 0) {
            creep.memory.collecting = false;
            creep.say('🏠 deliver');
        }
        if (!creep.memory.collecting && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.collecting = true;
            creep.say('📦 collect');
        }
        
        if (creep.memory.collecting) {
            this.collectEnergy(creep);
        } else {
            this.deliverEnergy(creep);
        }
    }
    
    assignRemoteRoom(creep) {
        const homeRoom = Game.rooms[creep.memory.homeRoom];
        if (!homeRoom) return;
        
        const remoteAssignments = homeRoom.memory.remoteAssignments || {};
        
        // Find a remote room that needs a hauler
        for (const roomName in remoteAssignments) {
            const sources = remoteAssignments[roomName];
            let needsHauler = false;
            
            for (const sourceId in sources) {
                if (sources[sourceId].harvester && !sources[sourceId].hauler) {
                    needsHauler = true;
                    break;
                }
            }
            
            if (needsHauler) {
                creep.memory.remoteRoom = roomName;
                // Assign to first source that needs a hauler
                for (const sourceId in sources) {
                    const sourceData = sources[sourceId];
                    // Ensure sourceData is an object
                    if (typeof sourceData !== 'object' || sourceData === null) {
                        continue;
                    }
                    if (sourceData.harvester && !sourceData.hauler) {
                        creep.memory.sourceId = sourceId;
                        creep.memory.containerId = sourceData.containerId;
                        sourceData.hauler = creep.name;
                        return;
                    }
                }
            }
        }
        
        creep.say('❌ no assign');
    }
    
    collectEnergy(creep) {
        // If in home room, travel to remote room
        if (creep.room.name !== creep.memory.remoteRoom) {
            this.travelToRoom(creep, creep.memory.remoteRoom);
            return;
        }
        
        // In remote room - collect from container
        const container = Game.getObjectById(creep.memory.containerId);
        
        if (!container) {
            // Try to find container
            const source = Game.getObjectById(creep.memory.sourceId);
            if (source) {
                const containers = source.pos.findInRange(FIND_STRUCTURES, 2, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER
                });
                if (containers.length > 0) {
                    creep.memory.containerId = containers[0].id;
                    this.withdrawFromContainer(creep, containers[0]);
                } else {
                    creep.say('❌ no container');
                }
            }
            return;
        }
        
        this.withdrawFromContainer(creep, container);
    }
    
    withdrawFromContainer(creep, container) {
        // Check if container has energy
        if (container.store[RESOURCE_ENERGY] <= 0) {
            // Container empty - go back to home room
            if (creep.room.name !== creep.memory.homeRoom) {
                this.travelToHomeRoom(creep);
                creep.say('🏠 home');
            } else {
                // Already home - look for other sources
                creep.say('❌ empty');
                const storage = creep.room.find(FIND_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0
                })[0];
                if (storage) {
                    creep.moveTo(storage);
                    creep.say('📦 storage');
                }
            }
            return;
        }
        
        // Withdraw energy
        const result = creep.withdraw(container, RESOURCE_ENERGY);
        
        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(container, {
                visualizePathStyle: { stroke: '#ffaa00' }
            });
        } else if (result === OK) {
            // Continue withdrawing until full
            if (creep.store.getFreeCapacity() > 0 && container.store[RESOURCE_ENERGY] > 0) {
                // Will continue next tick
            } else {
                creep.memory.collecting = false;
                creep.say('🏠 deliver');
            }
        }
    }
    
    deliverEnergy(creep) {
        // If in remote room, travel home
        if (creep.room.name === creep.memory.remoteRoom) {
            this.travelToRoom(creep, creep.memory.homeRoom);
            return;
        }
        
        // In home room - deliver energy
        const homeRoom = Game.rooms[creep.memory.homeRoom];
        if (!homeRoom) {
            // Wait until we get to home room
            return;
        }
        
        // Find delivery target
        const target = this.findDeliveryTarget(homeRoom, creep);
        
        if (target) {
            const result = creep.transfer(target, RESOURCE_ENERGY);
            
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: '#ffffff' }
                });
            } else if (result === OK) {
                if (creep.store[RESOURCE_ENERGY] === 0) {
                    creep.memory.collecting = true;
                    creep.say('📦 collect');
                }
            }
        } else {
            // No target - wait near spawn
            const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
            if (spawn) {
                creep.moveTo(spawn, { range: 3 });
            }
        }
    }
    
    findDeliveryTarget(room, creep) {
        // Priority: Storage > Extensions > Spawn > Container
        
        const storage = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_STORAGE &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        })[0];
        if (storage) return storage;
        
        const extensions = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (extensions.length > 0) {
            return creep.pos.findClosestByPath(extensions);
        }
        
        const spawn = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_SPAWN &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        })[0];
        if (spawn) return spawn;
        
        const containers = room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER &&
                        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (containers.length > 0) {
            return creep.pos.findClosestByPath(containers);
        }
        
        return null;
    }
    
    travelToRoom(creep, roomName) {
        const exitDir = Game.map.findExit(creep.room, roomName);
        if (exitDir === ERR_NO_PATH) {
            creep.say('❌ no path');
            return;
        }
        
        // Use RoomPosition to find path to target room
        const route = Game.map.findRoute(creep.room.name, roomName);
        if (route !== ERR_NO_PATH && route.length > 0) {
            const exit = creep.pos.findClosestByPath(route[0].exit);
            if (exit) {
                creep.moveTo(exit, {
                    visualizePathStyle: { stroke: '#00ff00' }
                });
            }
        }
    }
}

module.exports = Hauler;
