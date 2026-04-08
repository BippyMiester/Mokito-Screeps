'use strict';

const SourceManager = require('./SourceManager');

/**
 * SpawnManager - Manages creep spawning with priority system
 * 
 * Phase 1: Fill all harvester positions (cycle: 2 harvesters, 1 upgrader)
 * Phase 2: Fill all upgrader positions
 * Phase 3: Spawn builders and repairers (1:1 ratio, max 3 each)
 */
class SpawnManager {
    constructor() {
        this.sourceManager = new SourceManager();
    }

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

        // Get total needed harvesters from SourceManager
        const needs = this.sourceManager.checkSpawnNeeds(room);
        const totalNeededHarvesters = needs.length;
        const desiredUpgraders = Math.ceil(totalNeededHarvesters / 2);

        // PHASE 1: Fill all harvester positions around sources
        if (harvesters.length < totalNeededHarvesters) {
            const cyclePosition = (harvesters.length + upgraders.length) % 3;
            
            if (cyclePosition === 0 || cyclePosition === 1) {
                // Spawn harvester
                const body = this.getHarvesterBody(energyCapacity);
                if (energyAvailable >= this.calculateBodyCost(body)) {
                    this.spawnHarvester(spawn, needs[0].source);
                }
            } else {
                // Spawn upgrader
                if (upgraders.length < desiredUpgraders) {
                    const body = this.getUpgraderBody(energyCapacity);
                    if (energyAvailable >= this.calculateBodyCost(body)) {
                        this.spawnUpgrader(spawn);
                    }
                }
            }
            return;
        }

        // PHASE 2: Fill all upgrader positions
        if (upgraders.length < desiredUpgraders) {
            const body = this.getUpgraderBody(energyCapacity);
            if (energyAvailable >= this.calculateBodyCost(body)) {
                this.spawnUpgrader(spawn);
            }
            return;
        }

        // PHASE 3: Spawn builders and repairers (1:1 ratio, max 3 each)
        // Only after ALL harvesters AND ALL upgraders are complete
        
        const maxBuilders = 3;
        const maxRepairers = 3;
        
        // Determine which to spawn based on 1:1 ratio
        // If builders == repairers, spawn builder first
        // If builders > repairers, spawn repairer
        const shouldSpawnBuilder = builders.length <= repairers.length;
        
        if (shouldSpawnBuilder && builders.length < maxBuilders) {
            // Check if there are construction sites
            const sites = room.find(FIND_CONSTRUCTION_SITES);
            if (sites.length > 0) {
                const body = this.getBuilderBody(energyCapacity);
                if (energyAvailable >= this.calculateBodyCost(body)) {
                    this.spawnBuilder(spawn);
                }
            }
            return;
        }
        
        if (!shouldSpawnBuilder && repairers.length < maxRepairers) {
            // Check if there are structures to repair
            const needsRepair = this.needsRepair(room);
            if (needsRepair) {
                const body = this.getRepairerBody(energyCapacity);
                if (energyAvailable >= this.calculateBodyCost(body)) {
                    this.spawnRepairer(spawn);
                }
            }
        }
    }

    needsRepair(room) {
        // Check if anything needs repair
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

    calculateBodyCost(body) {
        const costs = {
            [MOVE]: 50,
            [WORK]: 100,
            [CARRY]: 50
        };
        return body.reduce((sum, part) => sum + (costs[part] || 0), 0);
    }

    getHarvesterBody(energyCapacity) {
        const body = [];
        let remaining = energyCapacity - 100;
        const maxWork = Math.min(Math.floor(remaining / 100), 5);
        
        for (let i = 0; i < maxWork; i++) {
            body.push(WORK);
        }
        body.push(CARRY);
        body.push(MOVE);
        return body;
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

    spawnHarvester(spawn, source) {
        const body = this.getHarvesterBody(spawn.room.energyCapacityAvailable);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Harvester' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'harvester', sourceId: source.id, harvestPos: null }
        });

        if (result === OK) {
            console.log('Spawning harvester: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnUpgrader(spawn) {
        const body = this.getUpgraderBody(spawn.room.energyCapacityAvailable);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Upgrader' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'upgrader' }
        });

        if (result === OK) {
            console.log('Spawning upgrader: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnBuilder(spawn) {
        const body = this.getBuilderBody(spawn.room.energyCapacityAvailable);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Builder' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'builder' }
        });

        if (result === OK) {
            console.log('Spawning builder: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }

    spawnRepairer(spawn) {
        const body = this.getRepairerBody(spawn.room.energyCapacityAvailable);
        if (body.length === 0) return ERR_NOT_ENOUGH_ENERGY;

        const name = 'Repairer' + Game.time;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: 'repairer' }
        });

        if (result === OK) {
            console.log('Spawning repairer: ' + name + ' [' + body.length + ' parts]');
        }
        return result;
    }
}

module.exports = SpawnManager;
