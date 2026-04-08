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
        
        // Cleanup old memory
        for (const roomName in Memory.rooms) {
            if (!Game.rooms[roomName]) {
                // Keep intel but remove runtime data
            }
        }
    }
}

module.exports = MemoryManager;
