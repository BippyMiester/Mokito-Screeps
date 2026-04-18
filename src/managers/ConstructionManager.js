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
            this.buildContainers(room); // Phase 4: Containers at sources (RCL 3 unlocks containers)
            this.buildTower(room); // Phase 7: Towers (RCL 3 unlocks 1 tower)
        }
        
        if (rcl >= 4) {
            this.buildStorage(room); // Phase 8: Storage (RCL 4 unlocks storage)
            this.buildRamparts(room); // Phase 6: Ramparts (RCL 4 unlocks ramparts)
        }
        
        if (rcl >= 5) {
            this.buildWalls(room); // Phase 6+: Walls at exits (RCL 5+)
        }
    }
    
    /**
     * Phase 4: Build containers at sources for stationary harvesting
     */
    buildContainers(room) {
        const sources = room.find(FIND_SOURCES);
        const containers = room.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_CONTAINER }
        });
        const sites = room.find(FIND_CONSTRUCTION_SITES, {
            filter: { structureType: STRUCTURE_CONTAINER }
        });
        
        const totalNeeded = sources.length;
        const currentCount = containers.length + sites.length;
        
        if (currentCount >= totalNeeded) return;
        
        // Build containers at sources
        for (const source of sources) {
            // Check if source already has a container nearby
            const nearbyContainers = source.pos.findInRange(FIND_STRUCTURES, 2, {
                filter: { structureType: STRUCTURE_CONTAINER }
            });
            const nearbySites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, {
                filter: { structureType: STRUCTURE_CONTAINER }
            });
            
            if (nearbyContainers.length === 0 && nearbySites.length === 0) {
                // Find a good position for the container
                const pos = this.findContainerPosition(source);
                if (pos) {
                    pos.createConstructionSite(STRUCTURE_CONTAINER);
                    console.log('📦 Building container at source ' + source.id);
                    return;
                }
            }
        }
    }
    
    /**
     * Find best position for a container near a source
     * Prioritizes positions close to the source and with road access
     */
    findContainerPosition(source) {
        const room = source.room;
        const terrain = room.getTerrain();
        let bestPos = null;
        let bestScore = -Infinity;
        
        // Check all positions within 1 tile of source
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                
                const x = source.pos.x + dx;
                const y = source.pos.y + dy;
                
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                
                const pos = new RoomPosition(x, y, room.name);
                
                // Check if position is blocked
                const structures = pos.lookFor(LOOK_STRUCTURES);
                if (structures.length > 0) continue;
                
                const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                if (sites.length > 0) continue;
                
                // Calculate score (closer to spawn is better)
                const spawn = room.find(FIND_MY_SPAWNS)[0];
                let score = 0;
                
                // Distance from source (prefer 1 tile away)
                const distToSource = Math.abs(dx) + Math.abs(dy);
                score += (3 - distToSource) * 10;
                
                // Distance to spawn (closer is better)
                if (spawn) {
                    const distToSpawn = pos.getRangeTo(spawn);
                    score -= distToSpawn * 2;
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestPos = pos;
                }
            }
        }
        
        return bestPos;
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
        // Phase 6: Build ramparts at room entrances to defend against invaders
        // Strategy: Build ramparts 2 tiles from exits in a line until hitting walls
        // This forces enemies to walk through a chokepoint protected by ramparts
        
        const exitDirections = [FIND_EXIT_TOP, FIND_EXIT_RIGHT, FIND_EXIT_BOTTOM, FIND_EXIT_LEFT];
        
        for (const exitDir of exitDirections) {
            const exitPositions = room.find(exitDir);
            if (exitPositions.length === 0) continue;
            
            // Find positions 2 tiles from the exit
            const defensivePositions = this.getDefensiveLine(room, exitDir, exitPositions);
            
            // Build ramparts at these positions
            for (const pos of defensivePositions) {
                // Skip if there's already a structure or construction site
                const structures = pos.lookFor(LOOK_STRUCTURES);
                const hasStructure = structures.some(s => 
                    s.structureType === STRUCTURE_RAMPART || 
                    s.structureType === STRUCTURE_WALL
                );
                
                if (hasStructure) continue;
                
                const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
                const hasSite = sites.some(s => 
                    s.structureType === STRUCTURE_RAMPART || 
                    s.structureType === STRUCTURE_WALL
                );
                
                if (!hasSite) {
                    pos.createConstructionSite(STRUCTURE_RAMPART);
                    return;
                }
            }
        }
    }
    
    /**
     * Get defensive line positions 2 tiles from an exit
     * Creates a line of positions until hitting a wall or connecting to walls
     */
    getDefensiveLine(room, exitDir, exitPositions) {
        const defensivePositions = [];
        const terrain = room.getTerrain();
        
        // Determine direction offset based on exit direction
        let dx = 0, dy = 0;
        switch (exitDir) {
            case FIND_EXIT_TOP: dy = 2; break;      // Move down 2 from top
            case FIND_EXIT_RIGHT: dx = -2; break;   // Move left 2 from right
            case FIND_EXIT_BOTTOM: dy = -2; break;  // Move up 2 from bottom
            case FIND_EXIT_LEFT: dx = 2; break;     // Move right 2 from left
        }
        
        // Get the line of positions 2 tiles from exit
        for (const exitPos of exitPositions) {
            const x = exitPos.x + dx;
            const y = exitPos.y + dy;
            
            if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
                // Check if this position is valid (not a wall)
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    const pos = new RoomPosition(x, y, room.name);
                    
                    // Check if position is on a path (road or frequently used)
                    // Also extend the line to create a barrier
                    const extendedPositions = this.extendDefensiveLine(room, pos, exitDir, terrain);
                    defensivePositions.push(...extendedPositions);
                }
            }
        }
        
        // Remove duplicates
        const uniquePositions = [];
        const seen = new Set();
        for (const pos of defensivePositions) {
            const key = `${pos.x},${pos.y}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniquePositions.push(pos);
            }
        }
        
        return uniquePositions;
    }
    
    /**
     * Extend defensive line horizontally/vertically to create a barrier
     */
    extendDefensiveLine(room, startPos, exitDir, terrain) {
        const positions = [startPos];
        
        // Determine extension direction (perpendicular to exit)
        let extendX = 0, extendY = 0;
        if (exitDir === FIND_EXIT_TOP || exitDir === FIND_EXIT_BOTTOM) {
            extendX = 1; // Extend horizontally
        } else {
            extendY = 1; // Extend vertically
        }
        
        // Extend in both directions until hitting walls
        const directions = [1, -1];
        for (const dir of directions) {
            let x = startPos.x + extendX * dir;
            let y = startPos.y + extendY * dir;
            
            while (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
                // Stop if we hit a wall
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) break;
                
                // Stop if we hit an existing wall or rampart
                const pos = new RoomPosition(x, y, room.name);
                const structures = pos.lookFor(LOOK_STRUCTURES);
                const hasBarrier = structures.some(s => 
                    s.structureType === STRUCTURE_WALL || 
                    s.structureType === STRUCTURE_RAMPART
                );
                
                if (hasBarrier) break;
                
                positions.push(pos);
                
                // Continue extending
                x += extendX * dir;
                y += extendY * dir;
                
                // Limit extension to reasonable length
                if (positions.length > 10) break;
            }
        }
        
        return positions;
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
            
            // Skip the target position (controller, spawn, etc.)
            if (step.x === toPos.x && step.y === toPos.y) continue;
            
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