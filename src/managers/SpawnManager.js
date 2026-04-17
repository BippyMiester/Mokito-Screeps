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
        const energyFull = energyAvailable >= energyCapacity;

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
        
        // Store energy status for other logic
        room.memory.energyFull = energyFull;
        
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
                    // Emergency harvester spawned silently
                }
            }
            return;
        }

        // Check if we should wait for full energy to maximize body parts
        // BUT: Never wait if we have no runners in stationary mode - that's a deadlock
        const inStationaryMode = room.memory.harvesterMode === 'stationary' || room.memory.stationaryMode;
        const criticalNeedRunner = inStationaryMode && runners.length < 1 && harvesters.length >= 2;
        
        if (!energyFull && harvesters.length >= 2 && room.controller.level >= 2 && !criticalNeedRunner) {
            // Wait for full energy unless it's early game or critical need
            // Status will be shown in heartbeat
            room.memory.waitingForEnergy = true;
            return;
        }
        
        room.memory.waitingForEnergy = false;

        // PHASE 1: Initial startup - exactly 2 harvesters, then 1 upgrader
        if (harvesters.length === 2 && upgraders.length < 1) {
            // For early game, don't wait for full energy
            if (energyAvailable >= 200) {
                this.spawnUpgrader(spawn, energyCapacity, room, creeps);
            }
            return;
        }

        // PHASE 2: Fill all harvester positions
        // Keep spawning harvesters until all source positions are filled
        if (harvesters.length < totalSourcePositions) {
            if (energyAvailable >= this.getHarvesterCost(energyCapacity, this.getBodyTier(room, creeps, 'harvester'))) {
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
                
                this.spawnHarvester(spawn, bestSource, energyCapacity, room, creeps);
            }
            return;
        }

        // Check if we should switch to stationary mode
        // This happens when we have enough harvesters to cover all source positions
        if (harvesters.length >= totalSourcePositions) {
            if (!room.memory.stationaryMode) {
                // Room switching to stationary mode (logged in heartbeat)
                room.memory.stationaryMode = true;
            }
        }

        // PHASE 3 (Stationary Mode): Spawn Runners first
        // Runners move energy from dropped locations to spawn/extensions
        // Ratio: 1 runner per 2 harvesters
        const desiredRunners = Math.ceil(harvesters.length / 2);
        if (runners.length < desiredRunners) {
            const bodyCost = this.getRunnerCost(energyCapacity, this.getBodyTier(room, creeps, 'runner'));
            if (energyAvailable >= bodyCost) {
                this.spawnRunner(spawn, energyCapacity, room, creeps);
            }
            return;
        }

        // PHASE 3 (Stationary Mode): Spawn Upgraders after Runners
        // Calculate desired upgraders: 1 per 1 harvester (1:1 ratio), minimum 1
        const desiredUpgraders = Math.max(1, harvesters.length);
        if (upgraders.length < desiredUpgraders) {
            const bodyCost = this.getUpgraderCost(energyCapacity, this.getBodyTier(room, creeps, 'upgrader'));
            if (energyAvailable >= bodyCost) {
                this.spawnUpgrader(spawn, energyCapacity, room, creeps);
            }
            return;
        }

        // PHASE 4: Builders and Repairers
        // Only spawn after harvesters, runners, and upgraders are complete
        // New ratios: Builders:Upgraders = 1:1, Repairers = (Builders+Upgraders)/2
        const maxBuilders = 3;
        const maxUpgraders = harvesters.length; // 1:1 with harvesters
        
        // Check for construction sites
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        
        // Calculate desired builders (1:1 with upgraders, up to max)
        const desiredBuilders = Math.min(upgraders.length, maxBuilders);
        
        // Spawn builder first (priority before repairers)
        // Maintain 1:1 ratio with upgraders
        // Spawn builders if: we have sites to work on, OR we need at least 1 builder for future work
        const minBuilders = sites.length > 0 ? 1 : 0; // At least 1 builder when there's work
        const actualDesiredBuilders = Math.max(minBuilders, Math.min(desiredBuilders, sites.length > 0 ? maxBuilders : 1));
        
        if (builders.length < actualDesiredBuilders) {
            const bodyCost = this.getBuilderCost(energyCapacity, this.getBodyTier(room, creeps, 'builder'));
            if (energyAvailable >= bodyCost) {
                this.spawnBuilder(spawn, energyCapacity, room, creeps);
                return;
            }
        }
        
        // Spawn repairers based on (builders + upgraders) / 2 formula
        // This ensures repairers scale with our building/upgrading workforce
        const desiredRepairers = Math.ceil((builders.length + upgraders.length) / 2);
        const maxRepairers = 4;
        
        if (repairers.length < desiredRepairers && repairers.length < maxRepairers) {
            const needsRepair = this.needsRepair(room);
            if (needsRepair || repairers.length === 0) {
                const bodyCost = this.getRepairerCost(energyCapacity, this.getBodyTier(room, creeps, 'repairer'));
                if (energyAvailable >= bodyCost) {
                    this.spawnRepairer(spawn, energyCapacity, room, creeps);
                    return;
                }
            }
        }
        
        // PHASE 5: Remote Workers (Multi-Room Harvesting)
        // Spawn remote harvesters for adjacent rooms
        const neededRemoteHarvesters = room.memory.neededRemoteHarvesters || 0;
        const neededHaulers = room.memory.neededHaulers || 0;
        const neededClaimers = room.memory.neededClaimers || 0;
        
        if (neededRemoteHarvesters > 0) {
            const bodyCost = this.getRemoteHarvesterCost(energyCapacity);
            if (energyAvailable >= bodyCost) {
                this.spawnRemoteHarvester(spawn, energyCapacity, room.name);
                return;
            }
        }
        
        if (neededHaulers > 0) {
            const bodyCost = this.getHaulerCost(energyCapacity);
            if (energyAvailable >= bodyCost) {
                this.spawnHauler(spawn, energyCapacity, room.name);
                return;
            }
        }
        
        if (neededClaimers > 0) {
            const bodyCost = this.getClaimerCost(energyCapacity);
            if (energyAvailable >= bodyCost) {
                this.spawnClaimer(spawn, room.name);
                return;
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
     * SMART BODY SCALING SYSTEM
     * 
     * Principles:
     * 1. Early game (few creeps): Smaller, cheaper bodies to spawn quickly
     * 2. Mid game (established economy): Medium bodies for efficiency
     * 3. Late game (full capacity): Large bodies for maximum throughput
     * 
     * Scaling Factors:
     * - Total creeps in room (more creeps = larger bodies)
     * - Current phase (higher phase = larger bodies)
     * - Available energy capacity (RCL level)
     * - Emergency situations (always small bodies)
     */

    /**
     * Calculate body tier based on room state
     * Returns 1-4 indicating body size tier
     */
    getBodyTier(room, creeps, role) {
        const totalCreeps = creeps.length;
        const rcl = room.controller.level;
        const roomMem = Memory.rooms[room.name] || {};
        const inStationaryMode = roomMem.harvesterMode === 'stationary';
        
        // EMERGENCY: Less than 3 creeps total - use minimal bodies
        if (totalCreeps < 3) {
            return 1; // Minimal body
        }
        
        // EARLY GAME: 3-6 creeps - use small efficient bodies
        if (totalCreeps < 7) {
            return 2; // Small body
        }
        
        // MID GAME: Established but not maxed - medium bodies
        if (totalCreeps < 12) {
            return 3; // Medium body
        }
        
        // LATE GAME: Many creeps - large bodies for efficiency
        return 4; // Large body
    }

    /**
     * Get scaled energy budget based on tier
     */
    getEnergyBudget(energyCapacity, tier) {
        // Tier 1: 200-300 energy (emergency/minimal)
        // Tier 2: 300-500 energy (early game)
        // Tier 3: 500-800 energy (mid game)
        // Tier 4: 800+ energy (late game, use full capacity)
        
        const budgets = {
            1: Math.min(300, energyCapacity),
            2: Math.min(500, energyCapacity),
            3: Math.min(800, energyCapacity),
            4: energyCapacity
        };
        
        return budgets[tier] || 300;
    }

    /**
     * Get harvester body and calculate cost
     * Scales based on room progress
     */
    getHarvesterCost(energyCapacity, tier) {
        const budget = this.getEnergyBudget(energyCapacity, tier);
        // WORK = 100, CARRY = 50, MOVE = 50
        // Minimum: WORK + CARRY + MOVE = 200
        // Reserve 100 for CARRY + MOVE, rest for WORK
        const workParts = Math.min(Math.floor((budget - 100) / 100), 5);
        return 100 * Math.max(1, workParts) + 100;
    }

    getHarvesterBody(energyCapacity, room, creeps) {
        const tier = this.getBodyTier(room, creeps, 'harvester');
        const budget = this.getEnergyBudget(energyCapacity, tier);
        
        const body = [];
        let remaining = budget - 100; // Reserve for CARRY + MOVE
        const maxWork = Math.min(Math.floor(remaining / 100), 5);
        
        // At least 1 WORK part
        const workParts = Math.max(1, maxWork);
        
        for (let i = 0; i < workParts; i++) {
            body.push(WORK);
        }
        body.push(CARRY);
        body.push(MOVE);
        return body;
    }

    getRunnerCost(energyCapacity, tier) {
        const budget = this.getEnergyBudget(energyCapacity, tier);
        // CARRY + MOVE = 100 per set
        const sets = Math.min(Math.floor(budget / 100), 16);
        return Math.max(2, sets) * 100; // At least 2 sets
    }

    getRunnerBody(energyCapacity, room, creeps) {
        const tier = this.getBodyTier(room, creeps, 'runner');
        const budget = this.getEnergyBudget(energyCapacity, tier);
        
        const body = [];
        let remaining = budget;
        
        // Minimum: 2 CARRY + 2 MOVE = 4 parts (400 energy at tier 4)
        // Or 1 CARRY + 1 MOVE = 2 parts (200 energy at tier 1-2)
        const minSets = tier <= 2 ? 1 : 2;
        
        // Add CARRY, MOVE pairs
        while (remaining >= 100 && body.length < 50 - 2) {
            body.push(CARRY);
            body.push(MOVE);
            remaining -= 100;
        }
        
        // Ensure minimum size
        if (body.length < minSets * 2) {
            for (let i = body.length / 2; i < minSets; i++) {
                body.push(CARRY);
                body.push(MOVE);
            }
        }
        
        return body.length > 0 ? body : [CARRY, MOVE];
    }

    getUpgraderCost(energyCapacity, tier) {
        const budget = this.getEnergyBudget(energyCapacity, tier);
        // WORK + CARRY + MOVE = 200 per set
        const sets = Math.min(Math.floor(budget / 200), 16);
        return Math.max(1, sets) * 200;
    }

    getUpgraderBody(energyCapacity, room, creeps) {
        const tier = this.getBodyTier(room, creeps, 'upgrader');
        const budget = this.getEnergyBudget(energyCapacity, tier);
        
        const body = [];
        const maxSets = Math.min(Math.floor(budget / 200), 16);
        const sets = Math.max(1, maxSets); // At least 1 set
        
        for (let i = 0; i < sets; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        return body;
    }

    getBuilderCost(energyCapacity, tier) {
        const budget = this.getEnergyBudget(energyCapacity, tier);
        const sets = Math.min(Math.floor(budget / 200), 16);
        return Math.max(1, sets) * 200;
    }

    getBuilderBody(energyCapacity, room, creeps) {
        const tier = this.getBodyTier(room, creeps, 'builder');
        const budget = this.getEnergyBudget(energyCapacity, tier);
        
        const body = [];
        const maxSets = Math.min(Math.floor(budget / 200), 16);
        const sets = Math.max(1, maxSets);
        
        for (let i = 0; i < sets; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        return body;
    }

    getRepairerCost(energyCapacity, tier) {
        const budget = this.getEnergyBudget(energyCapacity, tier);
        const sets = Math.min(Math.floor(budget / 200), 16);
        return Math.max(1, sets) * 200;
    }

    getRepairerBody(energyCapacity, room, creeps) {
        const tier = this.getBodyTier(room, creeps, 'repairer');
        const budget = this.getEnergyBudget(energyCapacity, tier);
        
        const body = [];
        const maxSets = Math.min(Math.floor(budget / 200), 16);
        const sets = Math.max(1, maxSets);
        
        for (let i = 0; i < sets; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        return body;
    }

    spawnHarvester(spawn, source, energyCapacity, room, creeps) {
        if (!source) return ERR_INVALID_ARGS;
        
        const body = this.getHarvesterBody(energyCapacity, room, creeps);
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

    spawnRunner(spawn, energyCapacity, room, creeps) {
        const body = this.getRunnerBody(energyCapacity, room, creeps);
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

    spawnUpgrader(spawn, energyCapacity, room, creeps) {
        const body = this.getUpgraderBody(energyCapacity, room, creeps);
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

    spawnBuilder(spawn, energyCapacity, room, creeps) {
        const body = this.getBuilderBody(energyCapacity, room, creeps);
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

    spawnRepairer(spawn, energyCapacity, room, creeps) {
        const body = this.getRepairerBody(energyCapacity, room, creeps);
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
        // New ratios: Builders:Upgraders = 1:1, Repairers = (Builders+Upgraders)/2
        const maxBuilders = 3;
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        
        // Calculate desired builders (1:1 with upgraders)
        const desiredBuilders = Math.min(upgraders.length, maxBuilders);
        
        // Allow at least 1 builder even without sites, for future building
        const minBuilders = sites.length > 0 ? 1 : 0;
        const actualDesiredBuilders = Math.max(minBuilders, Math.min(desiredBuilders, sites.length > 0 ? maxBuilders : 1));
        
        // Check if builder needed (builders come before repairers)
        if (builders.length < actualDesiredBuilders) {
            priorities.push({
                role: 'builder',
                emoji: '🔨',
                reason: builders.length + '/' + actualDesiredBuilders + ' builders, ' + sites.length + ' sites',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
        }
        
        // Check if repairer needed (repairers = (builders + upgraders) / 2)
        const needsRepair = this.needsRepair(room);
        const desiredRepairers = Math.ceil((builders.length + upgraders.length) / 2);
        const maxRepairers = 4;
        
        if (repairers.length < desiredRepairers && repairers.length < maxRepairers) {
            if (needsRepair || repairers.length === 0) {
                priorities.push({
                    role: 'repairer',
                    emoji: '🔧',
                    reason: repairers.length + '/' + desiredRepairers + ' repairers ((B+U)/2)',
                    priority: priorities.length === 0 ? 1 : 2
                });
                if (priorities.length >= 2) return priorities;
            }
        }
        
        // PHASE 5: Remote Workers
        const neededRemoteHarvesters = room.memory.neededRemoteHarvesters || 0;
        const neededHaulers = room.memory.neededHaulers || 0;
        const neededClaimers = room.memory.neededClaimers || 0;
        
        if (neededRemoteHarvesters > 0) {
            priorities.push({
                role: 'remoteharvester',
                emoji: '🌍',
                reason: neededRemoteHarvesters + ' remote harvesters needed',
                priority: 1
            });
            if (priorities.length >= 2) return priorities;
        }
        
        if (neededHaulers > 0) {
            priorities.push({
                role: 'hauler',
                emoji: '🚚',
                reason: neededHaulers + ' haulers needed',
                priority: priorities.length === 0 ? 1 : 2
            });
            if (priorities.length >= 2) return priorities;
        }
        
        if (neededClaimers > 0) {
            priorities.push({
                role: 'claimer',
                emoji: '🏳️',
                reason: neededClaimers + ' claimers needed',
                priority: priorities.length === 0 ? 1 : 2
            });
            if (priorities.length >= 2) return priorities;
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
    
    // Remote worker body and spawn methods
    getRemoteHarvesterCost(energyCapacity) {
        // Remote harvester: WORK, WORK, CARRY, MOVE
        // Needs to build container and harvest
        const maxSets = Math.min(Math.floor(energyCapacity / 350), 5);
        return maxSets > 0 ? maxSets * 350 : 350;
    }
    
    getRemoteHarvesterBody(energyCapacity) {
        const body = [];
        // Maximize work parts for remote harvesting
        let remaining = energyCapacity;
        
        while (remaining >= 350 && body.length < 50 - 4) {
            body.push(WORK);
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
            remaining -= 350;
        }
        
        return body.length > 0 ? body : [WORK, WORK, CARRY, MOVE];
    }
    
    getHaulerCost(energyCapacity) {
        // Hauler: CARRY, CARRY, MOVE - efficient transport
        const maxSets = Math.min(Math.floor(energyCapacity / 150), 16);
        return maxSets > 0 ? maxSets * 150 : 150;
    }
    
    getHaulerBody(energyCapacity) {
        const body = [];
        // Maximize carry capacity
        let remaining = energyCapacity;
        
        while (remaining >= 100 && body.length < 50 - 2) {
            body.push(CARRY);
            body.push(CARRY);
            body.push(MOVE);
            remaining -= 150;
        }
        
        return body.length > 0 ? body : [CARRY, CARRY, MOVE];
    }
    
    getClaimerCost(energyCapacity) {
        // Claimer needs CLAIM part
        return 650; // CLAIM + MOVE
    }
    
    getClaimerBody(energyCapacity) {
        return [CLAIM, MOVE];
    }
    
    spawnRemoteHarvester(spawn, energyCapacity, homeRoomName) {
        const body = this.getRemoteHarvesterBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;
        
        const name = 'RemoteHarvester' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: {
                role: 'remoteharvester',
                homeRoom: homeRoomName
            }
        });
        
        if (result === OK) {
            console.log('🌍 Spawning remote harvester: ' + name);
        }
        return result;
    }
    
    spawnHauler(spawn, energyCapacity, homeRoomName) {
        const body = this.getHaulerBody(energyCapacity);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;
        
        const name = 'Hauler' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: {
                role: 'hauler',
                homeRoom: homeRoomName
            }
        });
        
        if (result === OK) {
            console.log('🚚 Spawning hauler: ' + name);
        }
        return result;
    }
    
    spawnClaimer(spawn, homeRoomName) {
        const body = [CLAIM, MOVE];
        const name = 'Claimer' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: {
                role: 'claimer',
                homeRoom: homeRoomName
            }
        });
        
        if (result === OK) {
            console.log('🏳️ Spawning claimer: ' + name);
        }
        return result;
    }
}

module.exports = SpawnManager;
