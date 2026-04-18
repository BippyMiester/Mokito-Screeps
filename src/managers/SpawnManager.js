'use strict';

/**
 * SpawnManager - Manages creep spawning with NEW phase-based priority system
 *
 * NEW PHASE STRUCTURE (2026-04-18):
 * Phase 1: Harvesters = open_spaces / 2
 * Phase 2: Upgraders = 3
 * Phase 3: Builders = 3 + Extensions
 * Phase 4: Runners = 3, Repairers = 2 (first runner triggers stationary)
 * Phase 5: Roads (10+)
 * Phase 6: Ramparts at exits
 *
 * ENERGY RESERVE: Always maintain 35% energy reserve
 */
class SpawnManager {
    run(room) {
        const spawns = room.find(FIND_MY_SPAWNS);
        const spawn = spawns[0];
        if (!spawn || spawn.spawning) return;

        const energyAvailable = room.energyAvailable;
        const energyCapacity = room.energyCapacityAvailable;

        // Count existing creeps
        const creeps = room.find(FIND_MY_CREEPS);
        const harvesters = creeps.filter(c => c.memory.role === 'harvester');
        const upgraders = creeps.filter(c => c.memory.role === 'upgrader');
        const builders = creeps.filter(c => c.memory.role === 'builder');
        const repairers = creeps.filter(c => c.memory.role === 'repairer');
        const runners = creeps.filter(c => c.memory.role === 'runner');

        // Calculate source positions
        const sources = room.find(FIND_SOURCES);
        let totalSourcePositions = 0;
        for (const source of sources) {
            totalSourcePositions += this.countOpenPositions(source);
        }

        // Update spawn priority info
        const nextSpawns = this.getNextSpawnPriority(room, harvesters.length, upgraders.length, builders.length, repairers.length, runners.length, totalSourcePositions);
        room.memory.spawnPriority = nextSpawns;

        // Energy budget: Maintain 35% reserve
        const minReserve = Math.floor(energyCapacity * 0.35);
        const usableEnergy = energyAvailable - minReserve;

        if (usableEnergy < 200) {
            room.memory.waitingForEnergy = true;
            return;
        }
        room.memory.waitingForEnergy = false;

        // === PHASE 1: HARVESTERS ===
        // Required: open_spaces / 2 (rounded down)
        const requiredHarvesters = Math.floor(totalSourcePositions / 2);
        if (harvesters.length < requiredHarvesters) {
            this.spawnHarvester(spawn, sources, room, creeps);
            return;
        }

        // === PHASE 2: UPGRADERS ===
        // Required: 3 upgraders
        if (upgraders.length < 3) {
            this.spawnUpgrader(spawn, energyCapacity, room, creeps);
            return;
        }

        // === PHASE 3: BUILDERS ===
        // Required: 3 builders
        if (builders.length < 3) {
            this.spawnBuilder(spawn, energyCapacity, room, creeps);
            return;
        }

        // === PHASE 4: RUNNERS + REPAIRERS ===
        // Required: 3 runners, 2 repairers
        // First runner triggers stationary mode

        if (runners.length < 3) {
            // First runner triggers stationary harvesting
            if (runners.length === 0 && !room.memory.stationaryMode) {
                room.memory.stationaryMode = true;
                room.memory.harvesterMode = 'stationary';
            }
            this.spawnRunner(spawn, energyCapacity, room, creeps);
            return;
        }

        if (repairers.length < 2) {
            this.spawnRepairer(spawn, energyCapacity, room, creeps);
            return;
        }

        // Phases 5-6 are handled by ConstructionManager (roads, ramparts)
        // No additional creeps needed beyond Phase 4
    }

    /**
     * Count open positions around a source
     */
    countOpenPositions(source) {
        const room = source.room;
        const terrain = room.getTerrain();
        let count = 0;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = source.pos.x + dx;
                const y = source.pos.y + dy;
                if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
                    if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                        count++;
                    }
                }
            }
        }
        return count;
    }

    /**
     * Get spawn priority for heartbeat display
     */
    getNextSpawnPriority(room, harvesterCount, upgraderCount, builderCount, repairerCount, runnerCount, totalSourcePositions) {
        const requiredHarvesters = Math.floor(totalSourcePositions / 2);
        const priorities = [];

        // Phase 1: Harvesters
        if (harvesterCount < requiredHarvesters) {
            priorities.push({
                role: 'harvester',
                emoji: '🌱',
                reason: `${harvesterCount}/${requiredHarvesters} harvesters (Phase 1)`,
                priority: 1
            });
        }

        // Phase 2: Upgraders
        if (upgraderCount < 3) {
            priorities.push({
                role: 'upgrader',
                emoji: '⚡',
                reason: `${upgraderCount}/3 upgraders (Phase 2)`,
                priority: 1
            });
        }

        // Phase 3: Builders
        if (builderCount < 3) {
            priorities.push({
                role: 'builder',
                emoji: '🔨',
                reason: `${builderCount}/3 builders (Phase 3)`,
                priority: 1
            });
        }

        // Phase 4: Runners
        if (runnerCount < 3) {
            priorities.push({
                role: 'runner',
                emoji: '🏃',
                reason: `${runnerCount}/3 runners (Phase 4)`,
                priority: 1
            });
        }

        // Phase 4: Repairers
        if (repairerCount < 2) {
            priorities.push({
                role: 'repairer',
                emoji: '🔧',
                reason: `${repairerCount}/2 repairers (Phase 4)`,
                priority: 1
            });
        }

        // All phases complete
        if (priorities.length === 0) {
            priorities.push({
                role: 'upgrader',
                emoji: '⚡',
                reason: 'All creeps spawned - maintaining',
                priority: 1
            });
        }

        return priorities;
    }

    // ==================== SPAWN METHODS ====================

    spawnHarvester(spawn, sources, room, creeps) {
        // Find source with fewest harvesters
        let bestSource = sources[0];
        let minHarvesters = Infinity;

        for (const source of sources) {
            const harvestersAtSource = creeps.filter(c =>
                c.memory.role === 'harvester' && c.memory.sourceId === source.id
            ).length;
            if (harvestersAtSource < minHarvesters) {
                minHarvesters = harvestersAtSource;
                bestSource = source;
            }
        }

        const name = 'Harvester' + Game.time;
        const result = spawn.spawnCreep([WORK, CARRY, MOVE], name, {
            memory: {
                role: 'harvester',
                sourceId: bestSource.id,
                delivering: false
            }
        });

        if (result === OK) {
            console.log(`🌱 Spawning harvester for source ${bestSource.id}`);
        }
    }

    spawnUpgrader(spawn, energyCapacity, room, creeps) {
        const name = 'Upgrader' + Game.time;
        const result = spawn.spawnCreep([WORK, CARRY, MOVE], name, {
            memory: { role: 'upgrader' }
        });

        if (result === OK) {
            console.log('⚡ Spawning upgrader');
        }
    }

    spawnBuilder(spawn, energyCapacity, room, creeps) {
        const name = 'Builder' + Game.time;
        const result = spawn.spawnCreep([WORK, CARRY, MOVE], name, {
            memory: { role: 'builder' }
        });

        if (result === OK) {
            console.log('🔨 Spawning builder');
        }
    }

    spawnRunner(spawn, energyCapacity, room, creeps) {
        const name = 'Runner' + Game.time;
        const result = spawn.spawnCreep([CARRY, CARRY, MOVE, MOVE], name, {
            memory: { role: 'runner' }
        });

        if (result === OK) {
            console.log('🏃 Spawning runner');
        }
    }

    spawnRepairer(spawn, energyCapacity, room, creeps) {
        const name = 'Repairer' + Game.time;
        const result = spawn.spawnCreep([WORK, CARRY, MOVE], name, {
            memory: { role: 'repairer' }
        });

        if (result === OK) {
            console.log('🔧 Spawning repairer');
        }
    }
}

module.exports = SpawnManager;
