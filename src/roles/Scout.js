'use strict';

/**
 * Scout - Reconnaissance creep that explores rooms
 * Moves room to room, gathering intelligence
 * Saves room data to memory for attack planning
 */
class Scout {
    run(creep) {
        // Initialize scouting memory
        if (!creep.memory.scouting) {
            creep.memory.scouting = {
                visitedRooms: [],
                currentTarget: null,
                path: [],
                pathIndex: 0
            };
        }

        // Scan current room and save data
        this.scanRoom(creep);

        // Get next target room to explore
        if (!creep.memory.scouting.currentTarget || 
            creep.room.name === creep.memory.scouting.currentTarget) {
            this.selectNextTarget(creep);
        }

        // Move to target room
        this.moveToTarget(creep);
    }

    /**
     * Scan the current room and save intelligence
     */
    scanRoom(creep) {
        const room = creep.room;
        const roomName = room.name;

        // Initialize room intel in memory if needed
        if (!Memory.roomIntel) {
            Memory.roomIntel = {};
        }
        if (!Memory.roomIntel[roomName]) {
            Memory.roomIntel[roomName] = {};
        }

        const intel = {
            lastScan: Game.time,
            hasController: !!room.controller,
            owner: null,
            level: null,
            safeMode: null,
            structures: {},
            creeps: {
                hostile: 0,
                friendly: 0
            },
            resources: {},
            exits: {}
        };

        // Controller info
        if (room.controller) {
            intel.level = room.controller.level;
            intel.owner = room.controller.owner ? room.controller.owner.username : null;
            intel.reservation = room.controller.reservation ? {
                username: room.controller.reservation.username,
                ticksToEnd: room.controller.reservation.ticksToEnd
            } : null;
            intel.safeMode = room.controller.safeMode || null;
        }

        // Scan structures
        const structures = room.find(FIND_STRUCTURES);
        for (const structure of structures) {
            const type = structure.structureType;
            if (!intel.structures[type]) {
                intel.structures[type] = [];
            }
            
            intel.structures[type].push({
                id: structure.id,
                pos: { x: structure.pos.x, y: structure.pos.y },
                hits: structure.hits,
                hitsMax: structure.hitsMax,
                my: structure.my || false
            });
        }

        // Scan hostile creeps
        const hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        intel.creeps.hostile = hostileCreeps.length;
        intel.creeps.hostileDetails = hostileCreeps.map(c => ({
            id: c.id,
            owner: c.owner.username,
            bodyParts: c.body.length,
            hits: c.hits,
            hitsMax: c.hitsMax
        }));

        // Scan friendly creeps
        const friendlyCreeps = room.find(FIND_MY_CREEPS);
        intel.creeps.friendly = friendlyCreeps.length;

        // Scan resources
        const sources = room.find(FIND_SOURCES);
        intel.resources.sources = sources.map(s => ({
            id: s.id,
            pos: { x: s.pos.x, y: s.pos.y },
            energy: s.energy,
            energyCapacity: s.energyCapacity
        }));

        const minerals = room.find(FIND_MINERALS);
        intel.resources.minerals = minerals.map(m => ({
            id: m.id,
            pos: { x: m.pos.x, y: m.pos.y },
            mineralType: m.mineralType,
            density: m.density
        }));

        // Get exits
        const exits = Game.map.describeExits(roomName);
        intel.exits = exits;

        // Save to memory
        Memory.roomIntel[roomName] = intel;

        // Visual feedback
        creep.say(`👁️ ${roomName}`);
    }

    /**
     * Select the next room to explore
     */
    selectNextTarget(creep) {
        const currentRoom = creep.room.name;
        const visited = creep.memory.scouting.visitedRooms;

        // Add current room to visited
        if (!visited.includes(currentRoom)) {
            visited.push(currentRoom);
        }

        // Get all adjacent rooms
        const exits = Game.map.describeExits(currentRoom);
        const candidates = [];

        for (const direction in exits) {
            const roomName = exits[direction];
            
            // Skip if we've visited recently
            if (visited.includes(roomName)) {
                // Check if it's been a while since we visited
                const intel = Memory.roomIntel[roomName];
                if (intel && Game.time - intel.lastScan < 1000) {
                    continue; // Visited recently
                }
            }

            // Skip if room is not accessible (novice zone walls, etc.)
            const status = Game.map.getRoomStatus(roomName);
            if (status.status !== 'normal') {
                continue;
            }

            candidates.push({
                roomName: roomName,
                direction: parseInt(direction),
                lastScan: Memory.roomIntel[roomName]?.lastScan || 0
            });
        }

        if (candidates.length === 0) {
            // All adjacent rooms visited recently - reset and pick random
            creep.memory.scouting.visitedRooms = [];
            const exitDirections = Object.keys(exits);
            if (exitDirections.length > 0) {
                const randomDir = exitDirections[Math.floor(Math.random() * exitDirections.length)];
                creep.memory.scouting.currentTarget = exits[randomDir];
            }
            return;
        }

        // Sort by last scan time (oldest first)
        candidates.sort((a, b) => a.lastScan - b.lastScan);

        // Pick the room least recently visited
        creep.memory.scouting.currentTarget = candidates[0].roomName;
        
        // Reset path
        creep.memory.scouting.path = [];
        creep.memory.scouting.pathIndex = 0;
    }

    /**
     * Move toward the target room
     */
    moveToTarget(creep) {
        const targetRoom = creep.memory.scouting.currentTarget;
        if (!targetRoom) return;

        // Already there
        if (creep.room.name === targetRoom) {
            return;
        }

        // Find path to target room
        const route = Game.map.findRoute(creep.room.name, targetRoom);
        
        if (route === ERR_NO_PATH) {
            // Can't reach - mark as visited to skip
            creep.memory.scouting.visitedRooms.push(targetRoom);
            creep.memory.scouting.currentTarget = null;
            creep.say('❌ blocked');
            return;
        }

        if (route.length > 0) {
            const exitDir = route[0].exit;
            const exit = creep.pos.findClosestByPath(exitDir);
            
            if (exit) {
                // Move toward exit
                const result = creep.moveTo(exit, {
                    visualizePathStyle: { stroke: '#ffffff' }
                });

                // If we have a path in memory, try to use it
                if (creep.memory.scouting.path.length > 0) {
                    const pathIndex = creep.memory.scouting.pathIndex;
                    if (pathIndex < creep.memory.scouting.path.length) {
                        const nextPos = creep.memory.scouting.path[pathIndex];
                        const moveResult = creep.moveByPath(creep.memory.scouting.path);
                        
                        if (moveResult === OK) {
                            creep.memory.scouting.pathIndex++;
                        } else {
                            // Path failed, clear it
                            creep.memory.scouting.path = [];
                            creep.memory.scouting.pathIndex = 0;
                        }
                    }
                } else {
                    // No path - search for one
                    const search = PathFinder.search(
                        creep.pos,
                        { pos: exit, range: 0 },
                        {
                            roomCallback: (roomName) => {
                                // Allow pathing through all rooms
                                return new PathFinder.CostMatrix();
                            }
                        }
                    );

                    if (!search.incomplete && search.path.length > 0) {
                        creep.memory.scouting.path = search.path;
                        creep.memory.scouting.pathIndex = 0;
                    }
                }
            }
        }
    }

    /**
     * Get intelligence summary for a room
     * Used by other systems (attack planner, etc.)
     */
    static getRoomIntel(roomName) {
        if (!Memory.roomIntel || !Memory.roomIntel[roomName]) {
            return null;
        }
        return Memory.roomIntel[roomName];
    }

    /**
     * Check if a room is owned by hostiles
     */
    static isHostileRoom(roomName) {
        const intel = this.getRoomIntel(roomName);
        if (!intel) return false;
        
        // Has controller with owner that's not us
        if (intel.owner && intel.owner !== Game.spawns[Object.keys(Game.spawns)[0]].owner.username) {
            return true;
        }
        
        // Has hostile creeps
        if (intel.creeps && intel.creeps.hostile > 0) {
            return true;
        }
        
        return false;
    }

    /**
     * Get list of hostile rooms
     */
    static getHostileRooms() {
        const hostile = [];
        if (!Memory.roomIntel) return hostile;
        
        for (const roomName in Memory.roomIntel) {
            if (this.isHostileRoom(roomName)) {
                hostile.push(roomName);
            }
        }
        
        return hostile;
    }
}

module.exports = Scout;
