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
                const repairers = creeps.filter(c => c.memory.role === 'repairer').length;
                const runners = creeps.filter(c => c.memory.role === 'runner').length;
                const remoteHarvesters = creeps.filter(c => c.memory.role === 'remoteharvester').length;
                const haulers = creeps.filter(c => c.memory.role === 'hauler').length;
                const claimers = creeps.filter(c => c.memory.role === 'claimer').length;
                const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
                    filter: r => r.resourceType === RESOURCE_ENERGY
                }).reduce((sum, r) => sum + r.amount, 0);
                
                // Get spawn priority info from room memory
                let upNext = 'None';
                const nextSpawns = room.memory.spawnPriority || [];
                if (nextSpawns.length > 0) {
                    upNext = nextSpawns[0].emoji + ' ' + nextSpawns[0].role;
                    if (nextSpawns.length > 1) {
                        upNext += ' → ' + nextSpawns[1].emoji + ' ' + nextSpawns[1].role;
                    }
                }
                
                // Build multi-line status message
                let status = '\n💓 ========== MOKITO HEARTBEAT ==========\n';
                status += 'Creeps: H:' + harvesters + ' R:' + runners + ' U:' + upgraders + ' B:' + builders + ' Rp:' + repairers;
                if (remoteHarvesters > 0 || haulers > 0 || claimers > 0) {
                    status += ' | RH:' + remoteHarvesters + ' Ha:' + haulers + ' C:' + claimers;
                }
                status += '\n';
                status += 'GCL:' + Game.gcl.level + ' | RCL:' + room.controller.level + '\n';
                status += 'Dropped Energy: ' + droppedEnergy + '\n';
                
                // Check if waiting for energy
                if (room.memory.waitingForEnergy) {
                    const energyAvailable = room.energyAvailable;
                    const energyCapacity = room.energyCapacityAvailable;
                    status += '⏳ Waiting for full energy: ' + energyAvailable + '/' + energyCapacity + '\n';
                }
                
                status += 'Next Spawn: ' + upNext + '\n';
                status += '======================================\n';
                
                console.log(status);
            }
        }
    }
}

module.exports = Mokito;
