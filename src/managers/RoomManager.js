'use strict';

const SpawnManager = require('./SpawnManager');
const ConstructionManager = require('./ConstructionManager');

class RoomManager {
    constructor() {
        this.spawnManager = new SpawnManager();
        this.constructionManager = new ConstructionManager();
    }
    
    run() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            
            if (room.controller && room.controller.my) {
                this.runOwnedRoom(room);
            }
        }
    }
    
    runOwnedRoom(room) {
        // Initialize room memory if needed
        if (!Memory.mokito.rooms[room.name]) {
            Memory.mokito.rooms[room.name] = {
                level: room.controller.level,
                spawnQueue: [],
                constructionSites: []
            };
        }
        
        // Initialize remote room tracking
        if (!room.memory.remoteRooms) {
            room.memory.remoteRooms = [];
        }
        if (!room.memory.remoteAssignments) {
            room.memory.remoteAssignments = {};
        }
        
        // Run spawn logic - spawn creeps for GCL and base building
        this.spawnManager.run(room);
        
        // Manage construction - build base structures
        this.constructionManager.run(room);
        
        // Manage remote rooms - scout and assign workers
        this.manageRemoteRooms(room);
        
        // Update room level tracking
        Memory.mokito.rooms[room.name].level = room.controller.level;
    }
    
    manageRemoteRooms(room) {
        // Only manage remote rooms if we have enough local workers
        const creeps = room.find(FIND_MY_CREEPS);
        const harvesters = creeps.filter(c => c.memory.role === 'harvester').length;
        const upgraders = creeps.filter(c => c.memory.role === 'upgrader').length;
        const runners = creeps.filter(c => c.memory.role === 'runner').length;
        
        // Need at least basic infrastructure before expanding
        if (harvesters < 2 || upgraders < 1 || runners < 1) {
            return;
        }
        
        // Scout for new rooms
        if (Game.time % 100 === 0) {
            this.scoutRemoteRooms(room);
        }
        
        // Update assignments for existing remote rooms
        this.updateRemoteAssignments(room);
        
        // Spawn remote workers if needed
        this.spawnRemoteWorkers(room);
    }
    
    scoutRemoteRooms(room) {
        // Find adjacent rooms
        const exits = Game.map.describeExits(room.name);
        
        for (const direction in exits) {
            const roomName = exits[direction];
            
            // Check if room is already known
            if (room.memory.remoteRooms.includes(roomName)) {
                continue;
            }
            
            // Check room status
            const roomStatus = Game.map.getRoomStatus(roomName);
            if (roomStatus.status !== 'normal') {
                continue;
            }
            
            // Check if room has sources
            // We'll need to scout it first
            if (!room.memory.remoteAssignments[roomName]) {
                room.memory.remoteRooms.push(roomName);
                room.memory.remoteAssignments[roomName] = {
                    scouting: true,
                    sources: {}
                };
            }
        }
    }
    
    updateRemoteAssignments(room) {
        for (const roomName of room.memory.remoteRooms) {
            const assignment = room.memory.remoteAssignments[roomName];
            if (!assignment) continue;
            
            // Check if we have visibility into the room
            const remoteRoom = Game.rooms[roomName];
            if (!remoteRoom) {
                continue;
            }
            
            // Scout the room if needed
            if (assignment.scouting) {
                this.scoutRoom(room, roomName, assignment);
            }
            
            // Update source assignments
            for (const sourceId in assignment.sources) {
                const sourceAssignment = assignment.sources[sourceId];
                
                // Check if harvester is alive
                if (sourceAssignment.harvester) {
                    const harvester = Game.creeps[sourceAssignment.harvester];
                    if (!harvester) {
                        sourceAssignment.harvester = null;
                    }
                }
                
                // Check if hauler is alive
                if (sourceAssignment.hauler) {
                    const hauler = Game.creeps[sourceAssignment.hauler];
                    if (!hauler) {
                        sourceAssignment.hauler = null;
                    }
                }
            }
            
            // Update claimer assignment
            if (assignment.claimer) {
                const claimer = Game.creeps[assignment.claimer];
                if (!claimer) {
                    assignment.claimer = null;
                }
            }
        }
    }
    
    scoutRoom(homeRoom, roomName, assignment) {
        const remoteRoom = Game.rooms[roomName];
        if (!remoteRoom) return;
        
        // Find sources
        const sources = remoteRoom.find(FIND_SOURCES);
        
        // Create assignments for each source
        for (const source of sources) {
            if (!assignment.sources[source.id]) {
                assignment.sources[source.id] = {
                    harvester: null,
                    hauler: null,
                    containerBuilt: false,
                    containerId: null,
                    pos: {
                        x: source.pos.x,
                        y: source.pos.y
                    }
                };
            }
        }
        
        assignment.scouting = false;
        console.log('🔍 Scouted ' + roomName + ': Found ' + sources.length + ' sources');
    }
    
    spawnRemoteWorkers(room) {
        // Count remote workers
        const creeps = room.find(FIND_MY_CREEPS);
        const remoteHarvesters = creeps.filter(c => c.memory.role === 'remoteharvester').length;
        const haulers = creeps.filter(c => c.memory.role === 'hauler').length;
        const claimers = creeps.filter(c => c.memory.role === 'claimer').length;
        
        // Calculate needed remote workers
        let neededRemoteHarvesters = 0;
        let neededHaulers = 0;
        let neededClaimers = 0;
        
        for (const roomName of room.memory.remoteRooms) {
            const assignment = room.memory.remoteAssignments[roomName];
            if (!assignment || assignment.scouting) continue;
            
            for (const sourceId in assignment.sources) {
                const sourceAssignment = assignment.sources[sourceId];
                
                if (!sourceAssignment.harvester) {
                    neededRemoteHarvesters++;
                }
                if (!sourceAssignment.hauler && sourceAssignment.harvester) {
                    neededHaulers++;
                }
            }
            
            // Check if we need a claimer
            const remoteRoom = Game.rooms[roomName];
            if (remoteRoom && remoteRoom.controller) {
                const reservation = remoteRoom.controller.reservation;
                if (!reservation || reservation.ticksToEnd < 1000) {
                    if (!assignment.claimer) {
                        neededClaimers++;
                    }
                }
            }
        }
        
        // Store needed counts in memory for SpawnManager to use
        room.memory.neededRemoteHarvesters = neededRemoteHarvesters;
        room.memory.neededHaulers = neededHaulers;
        room.memory.neededClaimers = neededClaimers;
    }
}

module.exports = RoomManager;
