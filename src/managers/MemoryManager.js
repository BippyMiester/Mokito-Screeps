'use strict';

class MemoryManager {
    cleanup() {
        // Clean up dead creeps from memory
        for (const name in Memory.creeps) {
            if (!Game.creeps[name]) {
                delete Memory.creeps[name];
            }
        }
        
        // Initialize persistent memory structures
        if (!Memory.mokito) {
            Memory.mokito = {
                version: '1.0.0',
                rooms: {},
                stats: {}
            };
        }
        
        // Initialize Memory.rooms if not exists
        if (!Memory.rooms) {
            Memory.rooms = {};
        }
        
        // Initialize room memory structures
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (room.controller && room.controller.my) {
                // Initialize room memory if not exists
                if (!Memory.rooms[roomName]) {
                    Memory.rooms[roomName] = {};
                }
                
                if (!room.memory.spawnPriority) {
                    room.memory.spawnPriority = [];
                }
            }
        }
        
        // Cleanup old memory
        for (const roomName in Memory.rooms) {
            if (!Game.rooms[roomName]) {
                // Keep intel but remove runtime data
                delete Memory.rooms[roomName].spawnPriority;
            }
        }
    }
}

module.exports = MemoryManager;
