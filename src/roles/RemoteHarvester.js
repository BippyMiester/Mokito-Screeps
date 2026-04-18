'use strict';

/**
 * RemoteHarvester - Mines energy from sources in remote rooms
 * Travels to target room, builds a container near source, and mines
 * Places energy in container for haulers to collect
 */
class RemoteHarvester {
    run(creep) {
        // Initialize if needed
        if (!creep.memory.remoteRoom) {
            this.assignRemoteRoom(creep);
        }
        
        // State management
        if (creep.memory.buildingContainer && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.buildingContainer = false;
        }
        if (!creep.memory.buildingContainer && creep.store.getFreeCapacity() === 0) {
            // Check if we need to build container first
            if (!creep.memory.containerBuilt) {
                creep.memory.buildingContainer = true;
            }
        }
        
        // If in home room, travel to remote room
        if (creep.room.name !== creep.memory.remoteRoom) {
            this.travelToRemoteRoom(creep);
            return;
        }
        
        // In remote room
        if (creep.memory.buildingContainer && !creep.memory.containerBuilt) {
            this.buildContainer(creep);
        } else {
            this.harvestAndStore(creep);
        }
    }
    
    assignRemoteRoom(creep) {
        // Get remote mining assignments from room memory
        const homeRoom = Game.rooms[creep.memory.homeRoom];
        if (!homeRoom) return;
        
        const remoteAssignments = homeRoom.memory.remoteAssignments || {};
        
        // Find an unassigned source
        for (const roomName in remoteAssignments) {
            const assignment = remoteAssignments[roomName];
            if (!assignment || !assignment.sources) continue;
            
            for (const sourceId in assignment.sources) {
                const sourceData = assignment.sources[sourceId];
                // Ensure sourceData is an object, not a boolean or primitive
                if (typeof sourceData !== 'object' || sourceData === null) {
                    // Fix corrupted data structure
                    assignment.sources[sourceId] = {
                        harvester: null,
                        hauler: null,
                        containerBuilt: false,
                        containerId: null
                    };
                    continue;
                }
                
                if (!sourceData.harvester) {
                    creep.memory.remoteRoom = roomName;
                    creep.memory.sourceId = sourceId;
                    sourceData.harvester = creep.name;
                    return;
                }
            }
        }
        
        // No assignment found - go to any remote room
        for (const roomName in remoteAssignments) {
            creep.memory.remoteRoom = roomName;
            creep.say('🌍 ' + roomName);
            return;
        }
    }
    
    travelToRemoteRoom(creep) {
        const remoteRoom = creep.memory.remoteRoom;
        if (!remoteRoom) return;
        
        // Move to exit
        const exitDir = Game.map.findExit(creep.room, remoteRoom);
        if (exitDir === ERR_NO_PATH) {
            creep.say('❌ no path');
            return;
        }
        
        const exit = creep.pos.findClosestByPath(exitDir);
        if (exit) {
            creep.moveTo(exit, {
                visualizePathStyle: { stroke: '#ffaa00' }
            });
        }
    }
    
    buildContainer(creep) {
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) {
            // Try to find source in room
            const sources = creep.room.find(FIND_SOURCES);
            if (sources.length > 0) {
                // Find closest to memory position
                const targetSource = sources.find(s => s.id === creep.memory.sourceId);
                if (targetSource) {
                    this.constructContainer(creep, targetSource);
                }
            }
            return;
        }
        
        this.constructContainer(creep, source);
    }
    
    constructContainer(creep, source) {
        // Check if container already exists near source
        const containers = source.pos.findInRange(FIND_STRUCTURES, 2, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        
        if (containers.length > 0) {
            creep.memory.containerBuilt = true;
            creep.memory.containerId = containers[0].id;
            return;
        }
        
        // Check for construction site
        const sites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        
        if (sites.length > 0) {
            // Build existing site
            if (creep.store[RESOURCE_ENERGY] > 0) {
                if (creep.build(sites[0]) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(sites[0]);
                }
            } else {
                // Need energy - harvest from source
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source);
                }
            }
        } else {
            // Create construction site
            // Find best position near source
            const pos = this.findContainerPosition(source);
            if (pos) {
                const result = pos.createConstructionSite(STRUCTURE_CONTAINER);
                if (result === OK) {
                    creep.say('📦 container');
                }
            }
        }
    }
    
    findContainerPosition(source) {
        const room = source.room;
        const terrain = room.getTerrain();
        
        // Find position adjacent to source with no walls
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                
                const x = source.pos.x + dx;
                const y = source.pos.y + dy;
                
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    const pos = new RoomPosition(x, y, room.name);
                    // Check for existing structures
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    if (structures.length === 0) {
                        return pos;
                    }
                }
            }
        }
        
        return null;
    }
    
    harvestAndStore(creep) {
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) {
            creep.say('❌ no source');
            return;
        }
        
        // Get container
        let container = Game.getObjectById(creep.memory.containerId);
        
        // If container doesn't exist, try to find it
        if (!container) {
            const containers = source.pos.findInRange(FIND_STRUCTURES, 2, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            });
            if (containers.length > 0) {
                container = containers[0];
                creep.memory.containerId = container.id;
            } else {
                // Need to build container
                creep.memory.buildingContainer = true;
                creep.memory.containerBuilt = false;
                return;
            }
        }
        
        // If full, repair container if needed
        if (creep.store.getFreeCapacity() === 0) {
            if (container.hits < container.hitsMax * 0.8) {
                if (creep.repair(container) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(container);
                }
            }
            return;
        }
        
        // Harvest
        const result = creep.harvest(source);
        
        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(source);
        } else if (result === OK) {
            // Drop energy into container
            if (creep.store.getFreeCapacity() === 0) {
                const energy = creep.store[RESOURCE_ENERGY];
                creep.drop(RESOURCE_ENERGY);
                creep.say('💧 ' + energy);
            }
        } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
            // Source empty, wait
            creep.say('⏳ wait');
        }
    }
}

module.exports = RemoteHarvester;
