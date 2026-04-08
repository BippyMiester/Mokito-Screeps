'use strict';

class ConstructionManager {
    run(room) {
        const rcl = room.controller.level;
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        
        if (!spawn) return;
        
        // Get existing construction sites count
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length >= 3) return; // Don't overwhelm with construction
        
        // Build based on RCL
        this.buildEssentials(room, spawn);
        
        if (rcl >= 2) {
            this.buildExtensions(room);
        }
        
        if (rcl >= 3) {
            this.buildTower(room);
        }
        
        if (rcl >= 4) {
            this.buildStorage(room);
        }
    }
    
    buildEssentials(room, spawn) {
        // Build roads to sources
        const sources = room.find(FIND_SOURCES);
        for (const source of sources) {
            this.buildRoad(room, spawn.pos, source.pos);
        }
        
        // Build road to controller
        if (room.controller) {
            this.buildRoad(room, spawn.pos, room.controller.pos);
        }
    }
    
    buildExtensions(room) {
        // Build extensions around spawn
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn) return;
        
        // Get current extension count
        const extensions = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_EXTENSION }
        });
        
        const maxExtensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
        
        if (extensions.length < maxExtensions) {
            // Place extension near spawn
            this.placeStructureNear(room, spawn.pos, STRUCTURE_EXTENSION, 2);
        }
    }
    
    buildTower(room) {
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_TOWER }
        });
        
        const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0;
        
        if (towers.length < maxTowers) {
            const spawn = room.find(FIND_MY_SPAWNS)[0];
            this.placeStructureNear(room, spawn.pos, STRUCTURE_TOWER, 3);
        }
    }
    
    buildStorage(room) {
        const storages = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_STORAGE }
        });
        
        if (storages.length === 0) {
            const spawn = room.find(FIND_MY_SPAWNS)[0];
            this.placeStructureNear(room, spawn.pos, STRUCTURE_STORAGE, 2);
        }
    }
    
    buildRoad(room, fromPos, toPos) {
        const path = fromPos.findPathTo(toPos, {
            ignoreCreeps: true,
            ignoreRoads: true
        });
        
        for (const step of path) {
            const pos = new RoomPosition(step.x, step.y, room.name);
            const structures = pos.lookFor(LOOK_STRUCTURES);
            const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
            
            if (!hasRoad) {
                pos.createConstructionSite(STRUCTURE_ROAD);
            }
        }
    }
    
    placeStructureNear(room, centerPos, structureType, range) {
        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                const x = centerPos.x + dx;
                const y = centerPos.y + dy;
                
                if (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
                    const pos = new RoomPosition(x, y, room.name);
                    const terrain = pos.lookFor(LOOK_TERRAIN);
                    
                    if (terrain.length > 0 && terrain[0] !== 'wall') {
                        const structures = pos.lookFor(LOOK_STRUCTURES);
                        const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                        
                        if (structures.length === 0 && sites.length === 0) {
                            pos.createConstructionSite(structureType);
                            return; // Place one at a time
                        }
                    }
                }
            }
        }
    }
}

module.exports = ConstructionManager;
