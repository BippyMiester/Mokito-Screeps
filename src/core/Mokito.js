'use strict';

const CreepManager = require('../managers/CreepManager');
const RoomManager = require('../managers/RoomManager');
const MemoryManager = require('../managers/MemoryManager');

class Mokito {
    constructor() {
        this.creepManager = new CreepManager();
        this.roomManager = new RoomManager();
        this.memoryManager = new MemoryManager();
        
        this.initialized = false;
    }
    
    run() {
        // Clean up memory
        this.memoryManager.cleanup();
        
        // Run rooms - focus on GCL gain and base building
        this.roomManager.run();
        
        // Run creeps
        this.creepManager.run();
        
        // Heartbeat every 60 ticks (15 seconds at 250ms tick rate)
        if (Game.time % 60 === 0) {
            const room = Game.rooms[Object.keys(Game.rooms)[0]];
            if (room && room.controller) {
                const creeps = room.find(FIND_MY_CREEPS);
                const harvesters = creeps.filter(c => c.memory.role === 'harvester').length;
                const upgraders = creeps.filter(c => c.memory.role === 'upgrader').length;
                const builders = creeps.filter(c => c.memory.role === 'builder').length;
                const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
                    filter: r => r.resourceType === RESOURCE_ENERGY
                }).reduce((sum, r) => sum + r.amount, 0);
                
                console.log('💓 Mokito Heartbeat | Creeps: H:' + harvesters + ' U:' + upgraders + ' B:' + builders + 
                          ' | GCL:' + Game.gcl.level + 
                          ' | RCL:' + room.controller.level + 
                          ' | Dropped:' + droppedEnergy);
            }
        }
    }
}

module.exports = Mokito;
