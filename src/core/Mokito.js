'use strict';

const CreepManager = require('../managers/CreepManager');
const RoomManager = require('../managers/RoomManager');
const MemoryManager = require('../managers/MemoryManager');

/**
 * MOKITO PHASE MANAGEMENT SYSTEM v4
 *
 * Comprehensive phase determination based on:
 * - CREEP COUNTS: harvesters, runners, upgraders, builders, repairers
 * - BUILDINGS: extensions, containers, roads, ramparts, towers, storage
 * - RCL: Room Controller Level
 * - GCL: Global Control Level
 * - DEFENSES: walls, ramparts, tower count
 *
 * Phase Criteria (MUST meet ALL for each phase):
 * Phase 0: harvesters < 2 [EMERGENCY]
 * Phase 1: harvesters >= 2
 * Phase 2: harvesters >= 2 AND upgraders >= 1
 * Phase 3: harvesters >= sourcePositions AND builders >= 1 AND extensions >= 5
 * Phase 4: Phase 3 + runners >= ceil(harvesters/2) AND stationary mode active
 * Phase 5: Phase 4 + storage exists AND RCL >= 4 [MOVED FROM PHASE 9]
 * Phase 6: Phase 5 + containers >= sources.length
 * Phase 7: Phase 6 + roads >= 10
 * Phase 8: Phase 7 + ramparts >= 3 AND RCL >= 4
 * Phase 9: Phase 8 + towers >= maxTowers AND RCL >= 3
 */
class Mokito {
    constructor() {
        this.creepManager = new CreepManager();
        this.roomManager = new RoomManager();
        this.memoryManager = new MemoryManager();
    }
    
    run() {
        this.memoryManager.cleanup();
        this.roomManager.run();
        this.creepManager.run();
        
        // Heartbeat every 60 ticks
        if (Game.time % 60 === 0) {
            const roomName = Object.keys(Game.rooms)[0];
            const room = Game.rooms[roomName];
            if (room && room.controller) {
                const metrics = this.gatherRoomMetrics(room);
                const phase = this.getCurrentPhase(room, metrics);
                this.logHeartbeat(room, metrics, phase);
            }
        }
    }

    /**
     * Gather all room metrics for phase determination
     */
    gatherRoomMetrics(room) {
        const creeps = room.find(FIND_MY_CREEPS);
        const structures = room.find(FIND_MY_STRUCTURES);
        const allStructures = room.find(FIND_STRUCTURES);
        const constructionSites = room.find(FIND_CONSTRUCTION_SITES);
        
        // Creep counts
        const metrics = {
            harvesters: creeps.filter(c => c.memory.role === 'harvester').length,
            runners: creeps.filter(c => c.memory.role === 'runner').length,
            upgraders: creeps.filter(c => c.memory.role === 'upgrader').length,
            builders: creeps.filter(c => c.memory.role === 'builder').length,
            repairers: creeps.filter(c => c.memory.role === 'repairer').length,
            defenders: creeps.filter(c => c.memory.role === 'defender').length,
            remoteHarvesters: creeps.filter(c => c.memory.role === 'remoteharvester').length,
            haulers: creeps.filter(c => c.memory.role === 'hauler').length,
            claimers: creeps.filter(c => c.memory.role === 'claimer').length,
            totalCreeps: creeps.length,
            
            // Buildings
            extensions: structures.filter(s => s.structureType === STRUCTURE_EXTENSION).length,
            maxExtensions: CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0,
            containers: allStructures.filter(s => s.structureType === STRUCTURE_CONTAINER).length,
            roads: allStructures.filter(s => s.structureType === STRUCTURE_ROAD).length,
            ramparts: structures.filter(s => s.structureType === STRUCTURE_RAMPART).length,
            walls: structures.filter(s => s.structureType === STRUCTURE_WALL).length,
            towers: structures.filter(s => s.structureType === STRUCTURE_TOWER).length,
            maxTowers: CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0,
            storage: structures.find(s => s.structureType === STRUCTURE_STORAGE),
            spawn: structures.find(s => s.structureType === STRUCTURE_SPAWN),
            
            // Construction
            constructionSites: constructionSites.length,
            
            // Resources
            droppedEnergy: room.find(FIND_DROPPED_RESOURCES, {
                filter: r => r.resourceType === RESOURCE_ENERGY
            }).reduce((sum, r) => sum + r.amount, 0),
            
            // Room state
            rcl: room.controller.level,
            gcl: Game.gcl.level,
            totalSourcePositions: this.calculateSourcePositions(room),
            inStationaryMode: Memory.rooms[room.name]?.harvesterMode === 'stationary'
        };
        
        return metrics;
    }

    /**
     * Calculate total open positions around all sources
     */
    calculateSourcePositions(room) {
        const sources = room.find(FIND_SOURCES);
        let total = 0;
        for (const source of sources) {
            const terrain = room.getTerrain();
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    const x = source.pos.x + dx;
                    const y = source.pos.y + dy;
                    if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
                        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                            total++;
                        }
                    }
                }
            }
        }
        return total;
    }

    /**
     * Initialize phase tracking memory
     */
    initPhaseMemory(roomName) {
        if (!Memory.mokito) {
            Memory.mokito = {};
        }
        if (!Memory.mokito.phaseTracking) {
            Memory.mokito.phaseTracking = {};
        }
        if (!Memory.mokito.phaseTracking[roomName]) {
            Memory.mokito.phaseTracking[roomName] = {
                currentPhase: 0,
                phaseDropTimer: 0,
                lastPhaseCheck: Game.time
            };
        }
        return Memory.mokito.phaseTracking[roomName];
    }

    /**
     * Check if metrics meet phase criteria
     */
    checkPhaseCriteria(phase, metrics) {
        switch (phase) {
            case 0: // Emergency
                return metrics.harvesters < 2;
                
            case 1: // Foundation
                return metrics.harvesters >= 2;
                
            case 2: // Stabilization
                return metrics.harvesters >= 2 && 
                       metrics.upgraders >= 1;
                
            case 3: // Capacity
                return metrics.harvesters >= metrics.totalSourcePositions &&
                       metrics.builders >= 1 &&
                       metrics.extensions >= 5 &&
                       metrics.rcl >= 2;
                
            case 4: // Efficiency (Stationary)
                const desiredRunners = Math.ceil(metrics.harvesters / 2);
                return metrics.harvesters >= metrics.totalSourcePositions &&
                       metrics.runners >= desiredRunners &&
                       metrics.upgraders >= 1 &&
                       metrics.inStationaryMode &&
                       metrics.rcl >= 2;
                
            case 5: // Storage - Resource Buffer
                if (!this.checkPhaseCriteria(4, metrics)) {
                    return false;
                }
                return metrics.storage !== undefined &&
                       metrics.rcl >= 4;
                
            case 6: // Infrastructure - Containers
                if (!this.checkPhaseCriteria(5, metrics)) {
                    return false;
                }
                const sources = metrics.totalSourcePositions / 8; // Approximate
                return metrics.containers >= Math.floor(sources);
                
            case 7: // Infrastructure - Roads
                if (!this.checkPhaseCriteria(6, metrics)) {
                    return false;
                }
                return metrics.roads >= 10;
                
            case 8: // Defense - Ramparts
                if (!this.checkPhaseCriteria(7, metrics)) {
                    return false;
                }
                return metrics.ramparts >= 3 &&
                       metrics.rcl >= 4;
                
            case 9: // Defense - Towers
                if (!this.checkPhaseCriteria(8, metrics)) {
                    return false;
                }
                return metrics.towers >= metrics.maxTowers &&
                       metrics.rcl >= 3;
                
            default:
                return false;
        }
    }

    /**
     * Determine current phase with grace periods
     */
    getCurrentPhase(room, metrics) {
        const phaseMem = this.initPhaseMemory(room.name);
        
        // Emergency check - immediate
        if (metrics.harvesters < 2) {
            phaseMem.currentPhase = 0;
            phaseMem.phaseDropTimer = 0;
            return {
                current: 0,
                name: this.getPhaseName(0, metrics),
                gracePeriod: 0,
                metrics: metrics
            };
        }
        
        // Find highest phase we meet
        let highestMetPhase = 0;
        for (let p = 9; p >= 0; p--) {
            if (this.checkPhaseCriteria(p, metrics)) {
                highestMetPhase = p;
                break;
            }
        }
        
        // Handle transitions
        if (highestMetPhase > phaseMem.currentPhase) {
            // Advancing - immediate
            phaseMem.currentPhase = highestMetPhase;
            phaseMem.phaseDropTimer = 0;
            return {
                current: phaseMem.currentPhase,
                name: this.getPhaseName(phaseMem.currentPhase, metrics),
                gracePeriod: 0,
                metrics: metrics
            };
        } else if (highestMetPhase < phaseMem.currentPhase) {
            // Dropping - grace period
            if (phaseMem.phaseDropTimer === 0) {
                phaseMem.phaseDropTimer = Game.time + 100;
                return {
                    current: phaseMem.currentPhase,
                    name: this.getPhaseName(phaseMem.currentPhase, metrics),
                    gracePeriod: 100,
                    metrics: metrics
                };
            } else if (Game.time >= phaseMem.phaseDropTimer) {
                phaseMem.currentPhase = highestMetPhase;
                phaseMem.phaseDropTimer = 0;
                return {
                    current: phaseMem.currentPhase,
                    name: this.getPhaseName(phaseMem.currentPhase, metrics),
                    gracePeriod: 0,
                    metrics: metrics
                };
            } else {
                return {
                    current: phaseMem.currentPhase,
                    name: this.getPhaseName(phaseMem.currentPhase, metrics),
                    gracePeriod: phaseMem.phaseDropTimer - Game.time,
                    metrics: metrics
                };
            }
        } else {
            phaseMem.phaseDropTimer = 0;
            return {
                current: phaseMem.currentPhase,
                name: this.getPhaseName(phaseMem.currentPhase, metrics),
                gracePeriod: 0,
                metrics: metrics
            };
        }
    }

    /**
     * Get phase display name with context
     */
    getPhaseName(phase, metrics) {
        const names = {
            0: 'Emergency - No Harvesters!',
            1: 'Foundation - Basic Energy',
            2: 'Stabilization - Controller Progress',
            3: 'Capacity - Extensions & Full Sources',
            4: 'Efficiency - Stationary Mode',
            5: 'Storage - Resource Buffer',
            6: 'Infrastructure - Containers Built',
            7: 'Infrastructure - Road Network',
            8: 'Defense - Ramparts Active',
            9: 'Defense - Towers Online'
        };
        return names[phase] || 'Unknown Phase';
    }

    /**
     * Get next phase requirements
     */
    getNextPhaseRequirements(currentPhase, metrics) {
        const requirements = [];
        
        switch (currentPhase) {
            case 0:
                requirements.push('2+ harvesters');
                break;
            case 1:
                requirements.push('1+ upgrader');
                break;
            case 2:
                requirements.push(`${metrics.totalSourcePositions}+ harvesters`);
                requirements.push('1+ builder');
                requirements.push('5+ extensions');
                break;
            case 3:
                requirements.push(`${Math.ceil(metrics.harvesters/2)}+ runners`);
                requirements.push('Stationary mode');
                break;
            case 4:
                const sources = Math.floor(metrics.totalSourcePositions / 8);
                requirements.push(`${sources}+ containers`);
                break;
            case 5:
                requirements.push('10+ roads');
                break;
            case 6:
                requirements.push('3+ ramparts');
                requirements.push('RCL 4+');
                break;
            case 7:
                requirements.push(`${metrics.maxTowers}+ towers`);
                break;
            case 8:
                requirements.push('Storage built');
                requirements.push('RCL 4+');
                break;
            case 9:
                requirements.push('Max phase reached!');
                break;
        }
        
        return requirements;
    }

    /**
     * Log heartbeat with phase info
     */
    logHeartbeat(room, metrics, phase) {
        const nextSpawns = room.memory.spawnPriority || [];
        let upNext = 'None';
        if (nextSpawns.length > 0) {
            upNext = nextSpawns[0].emoji + ' ' + nextSpawns[0].role;
            if (nextSpawns.length > 1) {
                upNext += ' → ' + nextSpawns[1].emoji + ' ' + nextSpawns[1].role;
            }
        }
        
        const nextRequirements = this.getNextPhaseRequirements(phase.current, metrics);
        
        let status = '\n💓 ========== MOKITO HEARTBEAT ==========\n';
        status += `📍 Phase ${phase.current}: ${phase.name}\n`;
        if (phase.gracePeriod > 0) {
            status += `   ⚠️  Degrading in ${phase.gracePeriod} ticks\n`;
        }
        
        // Progress to next phase
        if (phase.current < 9) {
            status += `   Next: ${nextRequirements.join(', ')}\n`;
        }
        
        status += '\n';
        status += `Creeps: H:${metrics.harvesters} R:${metrics.runners} U:${metrics.upgraders} B:${metrics.builders} Rp:${metrics.repairers}\n`;
        if (metrics.remoteHarvesters > 0 || metrics.haulers > 0) {
            status += `Remote: RH:${metrics.remoteHarvesters} Ha:${metrics.haulers} C:${metrics.claimers}\n`;
        }
        
        status += `\n`;
        status += `RCL: ${metrics.rcl} | GCL: ${metrics.gcl}\n`;
        status += `Buildings: Ex:${metrics.extensions}/${metrics.maxExtensions} `;
        status += `Co:${metrics.containers} Rd:${metrics.roads} `;
        status += `Ra:${metrics.ramparts} Tw:${metrics.towers}/${metrics.maxTowers}\n`;
        status += `Storage: ${metrics.storage ? '✅' : '❌'} | `;
        status += `Sites: ${metrics.constructionSites} | `;
        status += `Dropped: ${metrics.droppedEnergy}\n`;
        
        if (room.memory.waitingForEnergy) {
            status += `⏳ Waiting for energy: ${room.energyAvailable}/${room.energyCapacityAvailable}\n`;
        }
        
        status += `Next Spawn: ${upNext}\n`;
        status += '======================================\n';
        
        console.log(status);
    }
}

module.exports = Mokito;
