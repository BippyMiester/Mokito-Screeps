'use strict';

/**
 * SourceManager - Manages stationary harvesting
 * Each source gets dedicated harvesters for each open position around it
 */
class SourceManager {
    constructor() {
        this.cache = {};
    }

    /**
     * Get all open positions around a source where a creep can stand and harvest
     */
    getHarvestPositions(source) {
        const cacheKey = source.id + '_positions';
        if (this.cache[cacheKey]) {
            return this.cache[cacheKey];
        }

        const positions = [];
        const room = source.room;
        const terrain = room.getTerrain();

        // Check all 8 adjacent positions
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;

                const x = source.pos.x + dx;
                const y = source.pos.y + dy;

                // Check bounds
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;

                // Check if position is walkable (not a wall)
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    positions.push(new RoomPosition(x, y, room.name));
                }
            }
        }

        this.cache[cacheKey] = positions;
        return positions;
    }

    /**
     * Count how many harvesters are assigned to a source
     */
    countHarvestersForSource(source) {
        const positions = this.getHarvestPositions(source);
        let count = 0;

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'harvester' && 
                creep.memory.sourceId === source.id) {
                count++;
            }
        }

        return count;
    }

    /**
     * Get available harvest positions for a source (not occupied by other harvesters)
     */
    getAvailablePositions(source) {
        const allPositions = this.getHarvestPositions(source);
        const occupied = new Set();

        // Mark positions occupied by stationary harvesters
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'harvester' && 
                creep.memory.sourceId === source.id &&
                creep.memory.harvestPos) {
                occupied.add(creep.memory.harvestPos.x + ',' + creep.memory.harvestPos.y);
            }
        }

        return allPositions.filter(pos => !occupied.has(pos.x + ',' + pos.y));
    }

    /**
     * Calculate how many WORK parts are needed to fully harvest a source
     */
    getNeededWorkParts(source) {
        // Each WORK part harvests 2 energy per tick
        // Sources regenerate 3000 energy every 300 ticks = 10 energy/tick average
        // Need 5 WORK parts to harvest 10 energy per tick (fully deplete)
        // But we want some buffer, so aim for 5-6 WORK parts total per source
        return 5;
    }

    /**
     * Get optimal body for a stationary harvester
     */
    getHarvesterBody(energyAvailable) {
        // Stationary harvester: WORK parts to harvest, 1 CARRY to store, no MOVE needed
        // Maximize WORK parts based on available energy
        const workParts = Math.min(Math.floor((energyAvailable - 50) / 100), 5);
        
        const body = [];
        for (let i = 0; i < workParts; i++) {
            body.push(WORK);
        }
        body.push(CARRY);
        
        return body;
    }

    /**
     * Check if we need more harvesters for a room
     */
    checkSpawnNeeds(room) {
        const sources = room.find(FIND_SOURCES);
        const needs = [];

        for (const source of sources) {
            const positions = this.getHarvestPositions(source);
            const currentHarvesters = this.countHarvestersForSource(source);
            const availablePositions = this.getAvailablePositions(source);

            // Spawn harvesters to fill all positions
            if (currentHarvesters < positions.length && availablePositions.length > 0) {
                needs.push({
                    source: source,
                    position: availablePositions[0],
                    priority: 1  // High priority
                });
            }
        }

        return needs;
    }

    /**
     * Find dropped energy near sources for collection
     */
    findDroppedEnergy(room) {
        const sources = room.find(FIND_SOURCES);
        const energyPiles = [];

        for (const source of sources) {
            const positions = this.getHarvestPositions(source);
            for (const pos of positions) {
                const resources = pos.lookFor(LOOK_RESOURCES);
                for (const resource of resources) {
                    if (resource.resourceType === RESOURCE_ENERGY) {
                        energyPiles.push(resource);
                    }
                }
            }
        }

        return energyPiles;
    }

    /**
     * Get total energy dropped near sources
     */
    getDroppedEnergyAmount(room) {
        const piles = this.findDroppedEnergy(room);
        return piles.reduce((sum, pile) => sum + pile.amount, 0);
    }
}

module.exports = SourceManager;
