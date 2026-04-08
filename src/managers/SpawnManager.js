'use strict';

/**
 * SpawnManager - Manages creep spawning with priority system
 * 
 * Phase 1 (Early Game): 
 *   - Spawn 2 harvesters (deliver to spawn)
 *   - Then spawn 1 upgrader (self-mines)
 * Phase 2 (Filling Harvesters):
 *   - Continue spawning harvesters until all source positions filled
 * Phase 3 (Stationary Mode):
 *   - Once harvesters >= source positions, switch to stationary mode
 *   - Spawn Runners to move energy from drops to spawn (1 runner per 2 harvesters)
 *   - Then spawn Upgraders (1:1 ratio with harvesters)
 * Phase 4 (Builders/Repairers):
 *   - Only after harvesters, runners, and upgraders are complete
 *   - Ratio: 1 builder : 2 repairers
 *   - Max: 3 builders, 4 repairers
 * Emergency: 
 *   - If harvesters drop below 2, revert to Phase 1
 *   - Pause other spawning until harvesters rebuilt
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

        // Calculate needed harvesters (open positions around sources)
        const sources = room.find(FIND_SOURCES);
        let totalSourcePositions = 0;
        for (const source of sources) {
            totalSourcePositions += this.countOpenPositions(source);
        }
        
        // Update spawn priority info in room memory for heartbeat display
        const nextSpawns = this.getNextSpawnPriority(room);
        room.memory.spawnPriority = nextSpawns;
        
        // EMERGENCY MODE: Less than 2 harvesters
        // This is critical - we need energy production immediately
        if (harvesters.length < 2) {
            // Force traditional mode for all harvesters
            room.memory.stationaryMode = false;
            
            if (energyAvailable >= 200) {
                // Spawn basic harvester that will deliver to spawn
                const body = [WORK, CARRY, MOVE]; // Minimum viable body
                const name = 'Harvester' + Game.time;
                const source = sources[0];
                if (source) {
                    spawn.spawnCreep(body, name, {
                        memory: { 
                            role: 'harvester', 
                            sourceId: source.id,
                            delivering: false
                        }
                    });
                    console.log('🚨 EMERGENCY: Spawning harvester ' + name);
                }
            }
            return;
        }

        // PHASE 1: Initial startup - exactly 2 harvesters, then 1 upgrader
        if (harvesters.length === 2 && upgraders.length < 1) {
            if (energyAvailable >= 200) {
                this.spawnUpgrader(spawn, energyCapacity);
            }
            return;
        }

        // PHASE 2: Fill all harvester positions
        // Keep spawning harvesters until all source positions are filled
        if (harvesters.length < totalSourcePositions) {
            if (energyAvailable >= this.getHarvesterCost(energyCapacity)) {
                // Assign to source with fewest harvesters
                let bestSource = sources[0];
                let minHarvesters = Infinity;
                
                for (const source of sources) {
                    const harvestersAtSource = harvesters.filter(h => h.memory.sourceId === source.id).length;
                    if (harvestersAtSource < minHarvesters) {
                        minHarvesters = harvestersAtSource;
                        bestSource = source;
                    }
                }
                
                this.spawnHarvester(spawn, bestSource, energyCapacity);
            }
            return;
        }

        // Check if we should switch to stationary mode
        // This happens when we have enough harvesters to cover all source positions
        if (harvesters.length >= totalSourcePositions) {
            if (!room.memory.stationaryMode) {
                console.log('🔄 Switching to stationary harvesting mode');
                room.memory.stationaryMode = true;
            }
        }

        // PHASE 3 (Stationary Mode): Spawn Runners first
        // Runners move energy from dropped locations to spawn/extensions
        // Ratio: 1 runner per 2 harvesters
        const desiredRunners = Math.ceil(harvesters.length / 2);
        if (runners.length < desiredRunners) {
            const bodyCost = this.getRunnerCost(energyCapacity);
            if (energyAvailable >= bodyCost) {
                this.spawnRunner(spawn, energyCapacity);
            }
            return;
        }

        // PHASE 3 (Stationary Mode): Spawn Upgraders after Runners
        // Calculate desired upgraders: 1 per 1 harvester (1:1 ratio), minimum 1
        const desiredUpgraders = Math.max(1, harvesters.length);
        if (upgraders.length < desiredUpgraders) {
            const bodyCost = this.getUpgraderCost(energyCapacity);
            if (energyAvailable >= bodyCost) {
                this.spawnUpgrader(spawn, energyCapacity);
            }
            return;
        }

        // PHASE 4: Builders and Repairers
        // Only spawn after harvesters, runners, and upgraders are complete
        // Builders spawn first, then repairers in 1:2 ratio
        // Max: 3 builders, 4 repairers
        const maxBuilders = 3;
        const maxRepairers = 4;
        
        // Check for construction sites
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        
        // Spawn builder first (priority before repairers)
        if (builders.length < maxBuilders && sites.length > 0) {
            const bodyCost = this.getBuilderCost(energyCapacity);
            if (energyAvailable >= bodyCost) {
                this.spawnBuilder(spawn, energyCapacity);
                return;
            }
        }
        
        // Spawn repairer after builders are at capacity or no sites
        // Maintain 1:2 ratio (2 repairers per 1 builder), max 4 repairers
        if (repairers.length < maxRepairers) {
            const desiredRepairers = Math.min(builders.length * 2, maxRepairers);
            if (repairers.length < desiredRepairers || repairers.length === 0) {
                const needsRepair = this.needsRepair(room);
                if (needsRepair || repairers.length === 0) {
                    const bodyCost = this.getRepairerCost(energyCapacity);
                    if (energyAvailable >= bodyCost) {
                        this.spawnRepairer(spawn, energyCapacity);
                    }
                }
            }
        }
    }
    
    /**
     * Count open positions around a source (where a creep can stand to harvest)
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
                
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    count++;
                }
            }
        }
        
        return count;
    }

    /**
     * Check if any structures need repair
     */
    needsRepair(room) {
        const damaged = room.find(FIND_STRUCTURES, {
            filter: s => {
                if (s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.5) return true;
                if (s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.8) return true;
                if (s.structureType === STRUCTURE_RAMPART && s.hits < 1000000) return true;
                if (s.structureType === STRUCTURE_WALL && s.hits < 1000000) return true;
                return false;
            }
        });
        return damaged.length > 0;
    }

    /**
     * Get harvester body and calculate cost
     */
    getHarvesterCost(energyCapacity) {
        // Traditional harvesters need CARRY to deliver to spawn
        // Body: WORK(n), CARRY(1), MOVE(1)
        const workParts = Math.min(Math.floor((energyCapacity - 100) / 100), 5);
        return 100 * workParts + 100; // WORK parts + CARRY + MOVE
    }

    getHarvesterBody(energyCapacity) {
        const body = [];
        let remaining = energyCapacity - 100; // Reserve for CARRY + MOVE
        const maxWork = Math.min(Math.floor(remaining / 100), 5);
        
        for (let i = 0; i < maxWork; i++) {
            body.push(WORK);
        }
        body.push(CARRY);
        body.push(MOVE);
        return body;
    }

    getRunnerCost(energyCapacity) {
        // Runner body: prioritize CARRY and MOVE for transport efficiency
        // WORK is optional for self-sufficiency if needed
        const maxSets = Math.min(Math.floor(energyCapacity / 150), 16); // CARRY, MOVE, CARRY = 150
        return maxSets > 0 ? maxSets * 150 : 150;
    }

    getRunnerBody(energyCapacity) {
        const body = [];
        // Runners need lots of CARRY and MOVE for efficient transport
        // Maximize carry capacity while maintaining move speed
        let remaining = energyCapacity;
        
        // Add CARRY, MOVE pairs
        while (remaining >= 100 && body.length < 50 - 2) {
            body.push(CARRY);
            body.push(MOVE);
            remaining -= 100;
        }
        
        // If we have leftover, add more CARRY
        if (remaining >= 50 && body.length < 50) {
            body.push(CARRY);
        }
        
        return body.length > 0 ? body : [CARRY, MOVE];
    }

    getUpgraderCost(energyCapacity) {
        // Upgrader body: WORK, CARRY, MOVE repeating
        const maxSets = Math.min(Math.floor(energyCapacity / 200), 16);
        return maxSets > 0 ? maxSets * 200 : 200;
    }

    getUpgraderBody(energyCapacity) {
        const body = [];
        const maxSets = Math.min(Math.floor(energyCapacity / 200), 16);
        
        for (let i = 0; i < maxSets; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        return body.length > 0 ? body : [WORK, CARRY, MOVE];
    }

    getBuilderCost(energyCapacity) {
        const maxSets = Math.min(Math.floor(energyCapacity / 200), 16);
        return maxSets > 0 ? maxSets * 200 : 200;
    }

    getBuilderBody(energyCapacity) {
        const body = [];
        const maxSets = Math.min(Math.floor(energyCapacity / 200), 16);
        
        for (let i = 0; i < maxSets; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        return body.length > 0 ? body : [WORK, CARRY, MOVE];
    }

    getRepairerCost(energyCapacity) {
        const maxSets = Math.min(Math.floor(energyCapacity / 200), 16);
        return maxSets > 0 ? maxSets * 200 : 200;
    }

    getRepairerBody(energyCapacity) {
        const body = [];
        const maxSets = Math.min(Math.floor(energyCapacity / 200), 16);
        
        for (let i = 0; i < maxSets; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        return body.length > 0 ? body : [WORK, CARRY, MOVE];
    }

    spawnHarvester(spawn, source, energyCapacity) {
        if (!source) return ERR_INVALID_ARGS;
        
        const body = this.getHarvesterBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Harvester' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { 
                role: 'harvester', 
                sourceId: source.id,
                delivering: false,
                harvestPos: null
            }
        });

        if (result === OK) {
            console.log('🌱 Spawning harvester: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnRunner(spawn, energyCapacity) {
        const body = this.getRunnerBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Runner' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'runner' }
        });

        if (result === OK) {
            console.log('🏃 Spawning runner: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnUpgrader(spawn, energyCapacity) {
        const body = this.getUpgraderBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Upgrader' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'upgrader' }
        });

        if (result === OK) {
            console.log('⚡ Spawning upgrader: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnBuilder(spawn, energyCapacity) {
        const body = this.getBuilderBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Builder' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'builder' }
        });

        if (result === OK) {
            console.log('🔨 Spawning builder: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnRepairer(spawn, energyCapacity) {
        const body = this.getRepairerBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Repairer' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'repairer' }
        });

        if (result === OK) {
            console.log('🔧 Spawning repairer: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    /**
     * Get the next creep(s) that should be spawned based on current room state
     * Returns an array of up to 2 next priority spawns
     */
    getNextSpawnPriority(room) {
        const creeps = room.find(FIND_MY_CREEPS);
        const harvesters = creeps.filter(c => c.memory.role === 'harvester');
        const upgraders = creeps.filter(c => c.memory.role === 'upgrader');
        const builders = creeps.filter(c => c.memory.role === 'builder');
        const repairers = creeps.filter(c => c.memory.role === 'repairer');
        const runners = creeps.filter(c => c.memory.role === 'runner');

        const sources = room.find(FIND_SOURCES);
        let totalSourcePositions = 0;
        for (const source of sources) {
            totalSourcePositions += this.countOpenPositions(source);
        }

        const priorities = [];

        // EMERGENCY: Need harvesters immediately
        if (harvesters.length < 2) {
            priorities.push({
                role: 'harvester',
                emoji: '🌱',
                reason: 'EMERGENCY: Only ' + harvesters.length + ' harvester(s)',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
            
            if (harvesters.length < 2) {
                priorities.push({
                    role: 'harvester',
                    emoji: '🌱',
                    reason: 'Emergency backup',
                    priority: 2
                });
                return priorities;
            }
        }

        // PHASE 1: Initial startup - need 2 harvesters then 1 upgrader
        if (harvesters.length < 2) {
            priorities.push({
                role: 'harvester',
                emoji: '🌱',
                reason: 'Need ' + (2 - harvesters.length) + ' more to reach 2',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
        } else if (harvesters.length === 2 && upgraders.length < 1) {
            priorities.push({
                role: 'upgrader',
                emoji: '⚡',
                reason: 'First upgrader needed',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
        }

        // PHASE 2: Fill harvester positions
        if (harvesters.length < totalSourcePositions) {
            priorities.push({
                role: 'harvester',
                emoji: '🌱',
                reason: harvesters.length + '/' + totalSourcePositions + ' positions filled',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
            
            // Second harvester if still needed
            if (harvesters.length + 1 < totalSourcePositions) {
                priorities.push({
                    role: 'harvester',
                    emoji: '🌱',
                    reason: 'Filling source positions',
                    priority: 2
                });
                return priorities;
            }
        }

        // PHASE 3 (Stationary Mode): Spawn Runners
        if (harvesters.length >= totalSourcePositions) {
            const desiredRunners = Math.ceil(harvesters.length / 2);
            if (runners.length < desiredRunners) {
                priorities.push({
                    role: 'runner',
                    emoji: '🏃',
                    reason: runners.length + '/' + desiredRunners + ' runners needed',
                    priority: 1
                });
                if (priorities.length >= 2) return priorities;
                
                if (runners.length + 1 < desiredRunners) {
                    priorities.push({
                        role: 'runner',
                        emoji: '🏃',
                        reason: 'Moving dropped energy',
                        priority: 2
                    });
                    return priorities;
                }
            }

            // PHASE 3: Spawn Upgraders
            const desiredUpgraders = Math.max(1, harvesters.length);
            if (upgraders.length < desiredUpgraders) {
                priorities.push({
                    role: 'upgrader',
                    emoji: '⚡',
                    reason: upgraders.length + '/' + desiredUpgraders + ' (1:1 ratio)',
                    priority: 1
                });
                if (priorities.length >= 2) return priorities;
                
                if (upgraders.length + 1 < desiredUpgraders) {
                    priorities.push({
                        role: 'upgrader',
                        emoji: '⚡',
                        reason: 'Upgrading controller',
                        priority: 2
                    });
                    return priorities;
                }
            }
        }

        // PHASE 4: Builders and Repairers
        const maxBuilders = 3;
        const maxRepairers = 4;
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        
        // Check if builder needed (builders come before repairers)
        if (builders.length < maxBuilders && sites.length > 0) {
            priorities.push({
                role: 'builder',
                emoji: '🔨',
                reason: builders.length + '/' + maxBuilders + ' builders, ' + sites.length + ' sites',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
        }
        
        // Check if repairer needed (repairers come after builders, maintain 1:2 ratio)
        const needsRepair = this.needsRepair(room);
        const desiredRepairers = Math.min(builders.length * 2, maxRepairers);
        if (repairers.length < maxRepairers && (needsRepair || repairers.length === 0)) {
            if (repairers.length < desiredRepairers || repairers.length === 0) {
                priorities.push({
                    role: 'repairer',
                    emoji: '🔧',
                    reason: repairers.length + '/' + desiredRepairers + ' repairers (1:2 ratio)',
                    priority: priorities.length === 0 ? 1 : 2
                });
                if (priorities.length >= 2) return priorities;
            }
        }
        
        // If no specific needs, show what's at capacity
        if (priorities.length === 0) {
            if (room.memory.stationaryMode) {
                priorities.push({
                    role: 'upgrader',
                    emoji: '⚡',
                    reason: 'All creeps at capacity - spawning for upgrades',
                    priority: 1
                });
            } else {
                priorities.push({
                    role: 'harvester',
                    emoji: '🌱',
                    reason: 'All positions filled - maintaining count',
                    priority: 1
                });
            }
        }

        return priorities;
    }
}

module.exports = SpawnManager;
