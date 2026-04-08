'use strict';

/**
 * ConstructionManager - Plans and initiates construction of room structures
 * Priorities:
 * 1. Roads for efficiency
 * 2. Extensions for bigger creeps
 * 3. Towers for defense
 * 4. Ramparts/Walls for base defense
 * 5. Storage
 */
class ConstructionManager {
    run(room) {
        const rcl = room.controller.level;
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        
        if (!spawn) return;
        
        // Get existing construction sites count
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length >= 5) return; // Don't overwhelm with construction
        
        // Initialize room construction memory
        if (!Memory.rooms[room.name].construction) {
            Memory.rooms[room.name].construction = {
                roadsPlanned: false,
                lastRoadBuild: 0,
                defensePlanned: false
            };
        }
        
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
            this.buildRamparts(room); // Build ramparts around spawn
        }
        
        if (rcl >= 5) {
            this.buildWalls(room); // Build walls for outer defense
        }
    }
    
    buildEssentials(room, spawn) {
        const sources = room.find(FIND_SOURCES);
        
        // Priority 1: Roads from spawn to sources (for harvesters)
        for (const source of sources) {
            this.buildRoad(room, spawn.pos, source.pos);
        }
        
        // Priority 2: Road from spawn to controller (for upgraders)
        if (room.controller) {
            this.buildRoad(room, spawn.pos, room.controller.pos);
        }
        
        // Priority 3: Roads between sources (for efficiency)
        if (sources.length > 1) {
            for (let i = 0; i < sources.length - 1; i++) {
                this.buildRoad(room, sources[i].pos, sources[i + 1].pos);
            }
        }
        
        // Priority 4: Roads from sources to controller
        if (room.controller) {
            for (const source of sources) {
                this.buildRoad(room, source.pos, room.controller.pos);
            }
        }
        
        // Priority 5: Roads around important structures for defense mobility
        this.buildRoadsAroundStructures(room, spawn.pos);
    }
    
    buildRoadsAroundStructures(room, spawnPos) {
        // Build roads in a defensive grid around spawn
        const offsets = [
            {x: -2, y: -2}, {x: 0, y: -2}, {x: 2, y: -2},
            {x: -2, y: 0},                 {x: 2, y: 0},
            {x: -2, y: 2},  {x: 0, y: 2},  {x: 2, y: 2}
        ];
        
        for (const offset of offsets) {
            const x = spawnPos.x + offset.x;
            const y = spawnPos.y + offset.y;
            
            if (x > 0 && x < 49 && y > 0 && y < 49) {
                const pos = new RoomPosition(x, y, room.name);
                const terrain = pos.lookFor(LOOK_TERRAIN);
                
                if (terrain[0] !== 'wall') {
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
                    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                    
                    if (!hasRoad && sites.length === 0) {
                        pos.createConstructionSite(STRUCTURE_ROAD);
                        return;
                    }
                }
            }
        }
    }
    
    buildExtensions(room) {
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn) return;
        
        // Get current extension count
        const extensions = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_EXTENSION }
        });
        
        const maxExtensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
        
        if (extensions.length < maxExtensions) {
            // Place extensions in a pattern around spawn (better than random placement)
            this.placeExtensionPattern(room, spawn.pos, extensions.length, maxExtensions);
        }
    }
    
    /**
     * Place extensions in a diamond pattern around spawn for optimal pathing
     */
    placeExtensionPattern(room, spawnPos, currentCount, maxCount) {
        // Diamond pattern offsets (prioritize closer to spawn)
        const pattern = [
            {x: 0, y: -2}, {x: 1, y: -1}, {x: 2, y: 0}, {x: 1, y: 1},
            {x: 0, y: 2}, {x: -1, y: 1}, {x: -2, y: 0}, {x: -1, y: -1},
            // Second ring
            {x: 0, y: -3}, {x: 1, y: -2}, {x: 2, y: -2}, {x: 3, y: -1},
            {x: 3, y: 0}, {x: 3, y: 1}, {x: 2, y: 2}, {x: 1, y: 3},
            {x: 0, y: 3}, {x: -1, y: 3}, {x: -2, y: 2}, {x: -3, y: 1},
            {x: -3, y: 0}, {x: -3, y: -1}, {x: -2, y: -2}, {x: -1, y: -3},
            // Third ring
            {x: 0, y: -4}, {x: 1, y: -3}, {x: 2, y: -3}, {x: 3, y: -2},
            {x: 4, y: -1}, {x: 4, y: 0}, {x: 4, y: 1}, {x: 3, y: 2},
            {x: 3, y: 3}, {x: 2, y: 3}, {x: 1, y: 4}, {x: 0, y: 4},
            {x: -1, y: 4}, {x: -2, y: 3}, {x: -3, y: 2}, {x: -4, y: 1},
            {x: -4, y: 0}, {x: -4, y: -1}, {x: -3, y: -2}, {x: -2, y: -3},
            {x: -1, y: -4}
        ];
        
        // Skip already placed extensions
        const startIndex = currentCount;
        
        for (let i = startIndex; i < pattern.length && i < maxCount; i++) {
            const offset = pattern[i];
            const x = spawnPos.x + offset.x;
            const y = spawnPos.y + offset.y;
            
            if (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
                const pos = new RoomPosition(x, y, room.name);
                const terrain = pos.lookFor(LOOK_TERRAIN);
                
                if (terrain.length > 0 && terrain[0] !== 'wall') {
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                    
                    if (structures.length === 0 && sites.length === 0) {
                        pos.createConstructionSite(STRUCTURE_EXTENSION);
                        return; // Place one at a time
                    }
                }
            }
        }
    }
    
    buildTower(room) {
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_TOWER }
        });
        
        const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0;
        
        if (towers.length < maxTowers) {
            const spawn = room.find(FIND_MY_SPAWNS)[0];
            // Place tower near spawn but closer to edges for defense
            this.placeTowerNear(room, spawn.pos);
        }
    }
    
    placeTowerNear(room, spawnPos) {
        // Place tower 3-4 tiles from spawn in various directions (for defense)
        const offsets = [
            {x: 4, y: 0}, {x: -4, y: 0}, {x: 0, y: 4}, {x: 0, y: -4},
            {x: 4, y: 4}, {x: 4, y: -4}, {x: -4, y: 4}, {x: -4, y: -4}
        ];
        
        for (const offset of offsets) {
            const x = spawnPos.x + offset.x;
            const y = spawnPos.y + offset.y;
            
            if (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
                const pos = new RoomPosition(x, y, room.name);
                const terrain = pos.lookFor(LOOK_TERRAIN);
                
                if (terrain.length > 0 && terrain[0] !== 'wall') {
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                    
                    if (structures.length === 0 && sites.length === 0) {
                        pos.createConstructionSite(STRUCTURE_TOWER);
                        return;
                    }
                }
            }
        }
    }
    
    buildRamparts(room) {
        // Build ramparts around important structures (spawn, controller, towers)
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn) return;
        
        // Get positions to protect
        const protectPositions = [spawn.pos];
        
        // Add controller position
        if (room.controller) {
            protectPositions.push(room.controller.pos);
        }
        
        // Add tower positions
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_TOWER }
        });
        towers.forEach(tower => protectPositions.push(tower.pos));
        
        // Build ramparts around each protected position
        for (const pos of protectPositions) {
            // Build a 3x3 area of ramparts around important structures
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    // Skip the center position (structure is there)
                    if (dx === 0 && dy === 0) continue;
                    
                    const x = pos.x + dx;
                    const y = pos.y + dy;
                    
                    if (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
                        const rampartPos = new RoomPosition(x, y, room.name);
                        const terrain = rampartPos.lookFor(LOOK_TERRAIN);
                        
                        if (terrain[0] !== 'wall') {
                            const structures = rampartPos.lookFor(LOOK_STRUCTURES);
                            const hasRampart = structures.some(s => 
                                s.structureType === STRUCTURE_RAMPART
                            );
                            const sites = rampartPos.lookFor(LOOK_CONSTRUCTION_SITES);
                            const hasConstruction = sites.some(s => 
                                s.structureType === STRUCTURE_RAMPART
                            );
                            
                            if (!hasRampart && !hasConstruction) {
                                rampartPos.createConstructionSite(STRUCTURE_RAMPART);
                                return;
                            }
                        }
                    }
                }
            }
        }
    }
    
    buildWalls(room) {
        // Build walls at room exits to create chokepoints
        const exits = [
            FIND_EXIT_TOP,
            FIND_EXIT_RIGHT,
            FIND_EXIT_BOTTOM,
            FIND_EXIT_LEFT
        ];
        
        for (const exitDir of exits) {
            const exitPositions = room.find(exitDir);
            if (exitPositions.length === 0) continue;
            
            // Build walls at the first few positions of each exit
            // This creates natural chokepoints while allowing controlled entry
            const positionsToBlock = exitPositions.slice(0, Math.min(3, exitPositions.length));
            
            for (const pos of positionsToBlock) {
                // Check if position is near any important structure
                const nearImportant = this.isNearImportantStructure(room, pos);
                
                if (!nearImportant) {
                    const terrain = pos.lookFor(LOOK_TERRAIN);
                    if (terrain[0] !== 'wall') {
                        const structures = pos.lookFor(LOOK_STRUCTURES);
                        const hasWall = structures.some(s => 
                            s.structureType === STRUCTURE_WALL
                        );
                        const hasRampart = structures.some(s => 
                            s.structureType === STRUCTURE_RAMPART
                        );
                        const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                        const hasConstruction = sites.length > 0;
                        
                        if (!hasWall && !hasRampart && !hasConstruction) {
                            pos.createConstructionSite(STRUCTURE_WALL);
                            return;
                        }
                    }
                }
            }
        }
    }
    
    isNearImportantStructure(room, pos) {
        // Check if position is near spawn, controller, or storage
        const importantStructures = room.find(FIND_MY_STRUCTURES, {
            filter: s => [STRUCTURE_SPAWN, STRUCTURE_CONTROLLER, STRUCTURE_STORAGE].includes(s.structureType)
        });
        
        for (const structure of importantStructures) {
            if (pos.getRangeTo(structure) <= 5) {
                return true;
            }
        }
        return false;
    }
    
    buildStorage(room) {
        const storages = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_STORAGE }
        });
        
        if (storages.length === 0) {
            const spawn = room.find(FIND_MY_SPAWNS)[0];
            // Place storage 2 tiles from spawn
            this.placeStorageNear(room, spawn.pos);
        }
    }
    
    placeStorageNear(room, spawnPos) {
        // Place storage adjacent to spawn
        const offsets = [
            {x: 2, y: 0}, {x: -2, y: 0}, {x: 0, y: 2}, {x: 0, y: -2},
            {x: 2, y: 1}, {x: 2, y: -1}, {x: -2, y: 1}, {x: -2, y: -1}
        ];
        
        for (const offset of offsets) {
            const x = spawnPos.x + offset.x;
            const y = spawnPos.y + offset.y;
            
            if (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
                const pos = new RoomPosition(x, y, room.name);
                const terrain = pos.lookFor(LOOK_TERRAIN);
                
                if (terrain.length > 0 && terrain[0] !== 'wall') {
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                    
                    if (structures.length === 0 && sites.length === 0) {
                        pos.createConstructionSite(STRUCTURE_STORAGE);
                        return;
                    }
                }
            }
        }
    }
    
    buildRoad(room, fromPos, toPos) {
        const path = fromPos.findPathTo(toPos, {
            ignoreCreeps: true,
            ignoreRoads: false // Respect existing roads
        });
        
        let placed = 0;
        for (const step of path) {
            const pos = new RoomPosition(step.x, step.y, room.name);
            
            // Skip positions with structures
            const structures = pos.lookFor(LOOK_STRUCTURES);
            const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
            const hasConstruction = pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0;
            
            // Don't build roads on top of structures or exits
            if (!hasRoad && !hasConstruction && 
                step.x > 0 && step.x < 49 && 
                step.y > 0 && step.y < 49) {
                pos.createConstructionSite(STRUCTURE_ROAD);
                placed++;
                if (placed >= 3) break; // Limit to 3 roads per tick
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