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
        
        // Run spawn logic - spawn creeps for GCL and base building
        this.spawnManager.run(room);
        
        // Manage construction - build base structures
        this.constructionManager.run(room);
        
        // Update room level tracking
        Memory.mokito.rooms[room.name].level = room.controller.level;
    }
}

module.exports = RoomManager;
