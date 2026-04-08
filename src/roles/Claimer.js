'use strict';

/**
 * Claimer - Reserves controller in remote rooms to prevent decay
 * Travels to target room and reserves controller
 * Returns home when TTL is low to be recycled
 */
class Claimer {
    run(creep) {
        // Initialize if needed
        if (!creep.memory.targetRoom) {
            this.assignTargetRoom(creep);
        }
        
        // Check TTL - return home if low
        if (creep.ticksToLive <= 100 && creep.room.name !== creep.memory.homeRoom) {
            this.travelHome(creep);
            return;
        }
        
        // Check if we need to travel to target room
        if (creep.room.name !== creep.memory.targetRoom) {
            this.travelToRoom(creep, creep.memory.targetRoom);
            return;
        }
        
        // In target room - reserve controller
        const controller = creep.room.controller;
        
        if (!controller) {
            creep.say('❌ no ctrl');
            return;
        }
        
        // Reserve controller
        const result = creep.reserveController(controller);
        
        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller, {
                visualizePathStyle: { stroke: '#ffaa00' }
            });
        } else if (result === OK) {
            creep.say('🔒 reserved');
        } else if (result === ERR_INVALID_TARGET) {
            // Controller might be owned by someone else
            creep.say('❌ owned');
        } else if (result === ERR_NO_BODYPART) {
            // No claim parts
            creep.say('❌ no parts');
        }
    }
    
    assignTargetRoom(creep) {
        const homeRoom = Game.rooms[creep.memory.homeRoom];
        if (!homeRoom) return;
        
        const remoteRooms = homeRoom.memory.remoteRooms || [];
        const assignments = homeRoom.memory.claimerAssignments || {};
        
        // Find unclaimed room
        for (const roomName of remoteRooms) {
            if (!assignments[roomName]) {
                creep.memory.targetRoom = roomName;
                assignments[roomName] = creep.name;
                homeRoom.memory.claimerAssignments = assignments;
                
                // Update status
                if (!homeRoom.memory.remoteAssignments) {
                    homeRoom.memory.remoteAssignments = {};
                }
                if (!homeRoom.memory.remoteAssignments[roomName]) {
                    homeRoom.memory.remoteAssignments[roomName] = {};
                }
                homeRoom.memory.remoteAssignments[roomName].claimer = creep.name;
                return;
            }
        }
        
        // Check if existing claimer needs replacement
        for (const roomName in assignments) {
            const claimerName = assignments[roomName];
            const claimer = Game.creeps[claimerName];
            if (!claimer || claimer.ticksToLive < 100) {
                // Replace this claimer
                creep.memory.targetRoom = roomName;
                assignments[roomName] = creep.name;
                homeRoom.memory.claimerAssignments = assignments;
                
                if (homeRoom.memory.remoteAssignments[roomName]) {
                    homeRoom.memory.remoteAssignments[roomName].claimer = creep.name;
                }
                return;
            }
        }
        
        creep.say('❌ no assign');
    }
    
    travelToRoom(creep, roomName) {
        const route = Game.map.findRoute(creep.room.name, roomName);
        
        if (route === ERR_NO_PATH) {
            creep.say('❌ no path');
            return;
        }
        
        if (route.length > 0) {
            const exit = creep.pos.findClosestByPath(route[0].exit);
            if (exit) {
                creep.moveTo(exit, {
                    visualizePathStyle: { stroke: '#ff00ff' }
                });
            }
        }
    }
    
    travelHome(creep) {
        if (creep.room.name === creep.memory.homeRoom) {
            // Suicide to recycle
            const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
            if (spawn) {
                if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(spawn);
                }
            }
            return;
        }
        
        this.travelToRoom(creep, creep.memory.homeRoom);
        creep.say('🏠 home');
    }
}

module.exports = Claimer;
