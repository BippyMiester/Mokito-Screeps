'use strict';

const SpawnManager = require('./SpawnManager');
const ConstructionManager = require('./ConstructionManager');

/**
 * RoomManager - Manages owned rooms including defense, offense, and economy
 * Handles military operations, room threats, and attack coordination
 */
class RoomManager {
    constructor() {
        this.spawnManager = new SpawnManager();
        this.constructionManager = new ConstructionManager();
    }
    
    run() {
        // Initialize military memory
        if (!Memory.military) {
            Memory.military = {
                squads: {},
                defense: {},
                intel: {}
            };
        }
        
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            
            if (room.controller && room.controller.my) {
                this.runOwnedRoom(room);
            }
        }
        
        // Manage attack squads globally
        this.manageAttackSquads();
    }
    
    runOwnedRoom(room) {
        // Initialize room memory if needed
        if (!Memory.mokito.rooms[room.name]) {
            Memory.mokito.rooms[room.name] = {
                level: room.controller.level,
                spawnQueue: [],
                constructionSites: []
            };
        }
        
        // Initialize room-specific defense memory
        if (!Memory.military.defense[room.name]) {
            Memory.military.defense[room.name] = {
                underAttack: false,
                attackTimer: 0,
                lastHostileSeen: 0,
                defendersSpawned: 0
            };
        }
        
        // Initialize remote room tracking
        if (!room.memory.remoteRooms) {
            room.memory.remoteRooms = [];
        }
        if (!room.memory.remoteAssignments) {
            room.memory.remoteAssignments = {};
        }
        
        // Check for threats and update defense status
        this.updateDefenseStatus(room);
        
        // Run tower defense
        this.runTowerDefense(room);
        
        // Run spawn logic
        this.spawnManager.run(room);
        
        // Manage construction
        this.constructionManager.run(room);
        
        // Manage remote rooms
        this.manageRemoteRooms(room);
        
        // Update room level tracking
        Memory.mokito.rooms[room.name].level = room.controller.level;
    }
    
    /**
     * Update room defense status and threat detection
     */
    updateDefenseStatus(room) {
        const defense = Memory.military.defense[room.name];
        
        // Check for hostile creeps
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        
        if (hostiles.length > 0) {
            // Under attack!
            defense.underAttack = true;
            defense.attackTimer = 20; // Stay alert for 20 ticks after last hostile seen
            defense.lastHostileSeen = Game.time;
            
            // Log first detection
            if (!defense.alertLogged) {
                console.log(`🚨 ROOM ${room.name} UNDER ATTACK! ${hostiles.length} hostiles detected!`);
                defense.alertLogged = true;
            }
        } else {
            // Decrement attack timer
            if (defense.attackTimer > 0) {
                defense.attackTimer--;
            } else {
                defense.underAttack = false;
                defense.alertLogged = false;
            }
        }
        
        // Store needed defenders count
        if (defense.underAttack) {
            const neededDefenders = Math.min(hostiles.length * 2, 4); // 2 defenders per hostile, max 4
            room.memory.neededDefenders = neededDefenders;
        } else {
            room.memory.neededDefenders = 0;
        }
    }
    
    /**
     * Run tower defense logic
     */
    runTowerDefense(room) {
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER
        });
        
        if (towers.length === 0) return;
        
        // Find hostiles
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        
        if (hostiles.length > 0) {
            // Priority target: Healers > Ranged > Melee > Others
            const priorityTargets = hostiles.sort((a, b) => {
                const scoreA = this.getThreatScore(a);
                const scoreB = this.getThreatScore(b);
                return scoreB - scoreA; // Higher score first
            });
            
            const target = priorityTargets[0];
            
            // Attack with all towers
            for (const tower of towers) {
                tower.attack(target);
            }
        } else {
            // No hostiles - repair damaged structures
            const damagedStructures = room.find(FIND_MY_STRUCTURES, {
                filter: s => s.hits < s.hitsMax * 0.75 && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART
            });
            
            if (damagedStructures.length > 0) {
                // Sort by damage percentage
                damagedStructures.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
                
                for (const tower of towers) {
                    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > tower.store.getCapacity(RESOURCE_ENERGY) * 0.5) {
                        tower.repair(damagedStructures[0]);
                    }
                }
            }
            
            // Repair walls/ramparts if enough energy
            const defenseStructures = room.find(FIND_MY_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && s.hits < 100000
            });
            
            if (defenseStructures.length > 0 && towers[0].store.getUsedCapacity(RESOURCE_ENERGY) > towers[0].store.getCapacity(RESOURCE_ENERGY) * 0.8) {
                defenseStructures.sort((a, b) => a.hits - b.hits);
                for (const tower of towers) {
                    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > tower.store.getCapacity(RESOURCE_ENERGY) * 0.8) {
                        tower.repair(defenseStructures[0]);
                    }
                }
            }
        }
    }
    
    /**
     * Calculate threat score for target prioritization
     */
    getThreatScore(creep) {
        let score = 0;
        
        const body = creep.body;
        const healParts = body.filter(p => p.type === HEAL && p.hits > 0).length;
        const rangedParts = body.filter(p => p.type === RANGED_ATTACK && p.hits > 0).length;
        const attackParts = body.filter(p => p.type === ATTACK && p.hits > 0).length;
        const workParts = body.filter(p => p.type === WORK && p.hits > 0).length;
        
        // Healers are highest priority
        score += healParts * 100;
        // Then ranged attackers
        score += rangedParts * 50;
        // Then melee attackers
        score += attackParts * 30;
        // Workers last
        score += workParts * 10;
        
        return score;
    }
    
    /**
     * Manage attack squads globally
     */
    manageAttackSquads() {
        // Clean up dead squads
        for (const squadId in Memory.military.squads) {
            const squad = Memory.military.squads[squadId];
            
            // Check if squad members are alive
            const aliveAttackers = squad.members.attackers.filter(name => Game.creeps[name]).length;
            const aliveHealers = squad.members.healers.filter(name => Game.creeps[name]).length;
            
            // Squad is dead if no one is alive
            if (aliveAttackers === 0 && aliveHealers === 0) {
                console.log(`💀 Squad ${squadId} eliminated`);
                delete Memory.military.squads[squadId];
                continue;
            }
            
            // Check for success
            if (squad.status === 'success') {
                console.log(`✅ Squad ${squadId} completed mission`);
                delete Memory.military.squads[squadId];
            }
        }
        
        // Count active squads
        const activeSquadCount = Object.keys(Memory.military.squads).length;
        
        // Request new squads if under max (3) and we have targets
        if (activeSquadCount < 3) {
            // Find hostile rooms from scout intel
            const hostileRooms = this.getHostileRoomsFromIntel();
            
            for (const roomName of hostileRooms) {
                // Check if already targeted by a squad
                const alreadyTargeted = Object.values(Memory.military.squads).some(
                    squad => squad.targetRoom === roomName
                );
                
                if (!alreadyTargeted) {
                    // Request a new squad
                    this.requestAttackSquad(roomName);
                    break; // Only request one squad per tick
                }
            }
        }
        
        // Update needed squad members for spawning
        this.updateNeededSquadMembers();
    }
    
    /**
     * Get list of hostile rooms from scout intelligence
     */
    getHostileRoomsFromIntel() {
        if (!Memory.roomIntel) return [];
        
        const hostile = [];
        const myUsername = Object.values(Game.spawns)[0]?.owner.username;
        
        for (const roomName in Memory.roomIntel) {
            const intel = Memory.roomIntel[roomName];
            
            // Room has hostile controller owner
            if (intel.owner && intel.owner !== myUsername) {
                hostile.push(roomName);
                continue;
            }
            
            // Room has hostile creeps
            if (intel.creeps && intel.creeps.hostile > 0) {
                hostile.push(roomName);
                continue;
            }
            
            // Room has hostile structures
            if (intel.structures && intel.structures.spawn) {
                const hostileSpawns = intel.structures.spawn.filter(s => !s.my);
                if (hostileSpawns.length > 0) {
                    hostile.push(roomName);
                }
            }
        }
        
        // Sort by last scan (most recent intel first)
        hostile.sort((a, b) => {
            const intelA = Memory.roomIntel[a];
            const intelB = Memory.roomIntel[b];
            return (intelB?.lastScan || 0) - (intelA?.lastScan || 0);
        });
        
        return hostile;
    }
    
    /**
     * Request a new attack squad
     */
    requestAttackSquad(targetRoom) {
        // Find a room to spawn from (closest to target)
        let spawnRoom = null;
        let closestDistance = Infinity;
        
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (room.controller && room.controller.my) {
                const distance = Game.map.getRoomLinearDistance(roomName, targetRoom);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    spawnRoom = roomName;
                }
            }
        }
        
        if (!spawnRoom) return;
        
        const squadId = 'squad_' + Game.time;
        
        Memory.military.squads[squadId] = {
            id: squadId,
            targetRoom: targetRoom,
            homeRoom: spawnRoom,
            status: 'forming', // forming, ready, attacking, success
            ready: false,
            members: {
                attackers: [],
                healers: []
            },
            created: Game.time
        };
        
        // Store in room memory for spawning
        const room = Game.rooms[spawnRoom];
        if (!room.memory.pendingSquads) {
            room.memory.pendingSquads = [];
        }
        room.memory.pendingSquads.push(squadId);
        
        console.log(`🎖️ Attack squad ${squadId} requested for ${targetRoom}`);
    }
    
    /**
     * Update needed squad member counts for spawning
     */
    updateNeededSquadMembers() {
        // Reset needed counts
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (room.controller && room.controller.my) {
                room.memory.neededAttackers = 0;
                room.memory.neededHealers = 0;
            }
        }
        
        // Count needed members for forming squads
        for (const squadId in Memory.military.squads) {
            const squad = Memory.military.squads[squadId];
            if (squad.ready) continue; // Squad is ready, no more needed
            
            const room = Game.rooms[squad.homeRoom];
            if (!room) continue;
            
            const neededAttackers = Math.max(0, 3 - squad.members.attackers.length);
            const neededHealers = Math.max(0, 1 - squad.members.healers.length);
            
            room.memory.neededAttackers += neededAttackers;
            room.memory.neededHealers += neededHealers;
        }
    }
    
    manageRemoteRooms(room) {
        // Only manage remote rooms if we have enough local workers
        const creeps = room.find(FIND_MY_CREEPS);
        const harvesters = creeps.filter(c => c.memory.role === 'harvester').length;
        const upgraders = creeps.filter(c => c.memory.role === 'upgrader').length;
        const runners = creeps.filter(c => c.memory.role === 'runner').length;
        
        // Need at least basic infrastructure before expanding
        if (harvesters < 2 || upgraders < 1 || runners < 1) {
            return;
        }
        
        // Scout for new rooms - do immediately if no remote rooms known, then every 100 ticks
        if (room.memory.remoteRooms.length === 0 || Game.time % 100 === 0) {
            this.scoutRemoteRooms(room);
        }
        
        // Update assignments for existing remote rooms
        this.updateRemoteAssignments(room);
        
        // Spawn remote workers if needed
        this.spawnRemoteWorkers(room);
        
        // Debug logging - remove after fixing
        if (Game.time % 60 === 0) {
            console.log(`Remote: ${room.memory.remoteRooms.length} rooms, need: RH:${room.memory.neededRemoteHarvesters} H:${room.memory.neededHaulers} C:${room.memory.neededClaimers}`);
        }
    }
    
    scoutRemoteRooms(room) {
        // Find adjacent rooms
        const exits = Game.map.describeExits(room.name);
        
        for (const direction in exits) {
            const roomName = exits[direction];
            
            // Check if room is already known
            if (room.memory.remoteRooms.includes(roomName)) {
                continue;
            }
            
            // Check room status
            const roomStatus = Game.map.getRoomStatus(roomName);
            if (roomStatus.status !== 'normal') {
                continue;
            }
            
            // Check if room has sources
            // We'll need to scout it first
            if (!room.memory.remoteAssignments[roomName]) {
                room.memory.remoteRooms.push(roomName);
                room.memory.remoteAssignments[roomName] = {
                    scouting: true,
                    sources: {}
                };
            }
        }
    }
    
    updateRemoteAssignments(room) {
        for (const roomName of room.memory.remoteRooms) {
            const assignment = room.memory.remoteAssignments[roomName];
            if (!assignment) continue;
            
            // Check if we have visibility into the room
            const remoteRoom = Game.rooms[roomName];
            if (!remoteRoom) {
                continue;
            }
            
            // Scout the room if needed
            if (assignment.scouting) {
                this.scoutRoom(room, roomName, assignment);
            }
            
            // Update source assignments
            for (const sourceId in assignment.sources) {
                const sourceAssignment = assignment.sources[sourceId];
                
                // Check if harvester is alive
                if (sourceAssignment.harvester) {
                    const harvester = Game.creeps[sourceAssignment.harvester];
                    if (!harvester) {
                        sourceAssignment.harvester = null;
                    }
                }
                
                // Check if hauler is alive
                if (sourceAssignment.hauler) {
                    const hauler = Game.creeps[sourceAssignment.hauler];
                    if (!hauler) {
                        sourceAssignment.hauler = null;
                    }
                }
            }
            
            // Update claimer assignment
            if (assignment.claimer) {
                const claimer = Game.creeps[assignment.claimer];
                if (!claimer) {
                    assignment.claimer = null;
                }
            }
        }
    }
    
    scoutRoom(homeRoom, roomName, assignment) {
        const remoteRoom = Game.rooms[roomName];
        if (!remoteRoom) return;
        
        // Find sources
        const sources = remoteRoom.find(FIND_SOURCES);
        
        // Create assignments for each source
        for (const source of sources) {
            if (!assignment.sources[source.id]) {
                assignment.sources[source.id] = {
                    harvester: null,
                    hauler: null,
                    containerBuilt: false,
                    containerId: null,
                    pos: {
                        x: source.pos.x,
                        y: source.pos.y
                    }
                };
            }
        }
        
        assignment.scouting = false;
        console.log('🔍 Scouted ' + roomName + ': Found ' + sources.length + ' sources');
    }
    
    spawnRemoteWorkers(room) {
        // Count remote workers
        const creeps = room.find(FIND_MY_CREEPS);
        const remoteHarvesters = creeps.filter(c => c.memory.role === 'remoteharvester').length;
        const haulers = creeps.filter(c => c.memory.role === 'hauler').length;
        const claimers = creeps.filter(c => c.memory.role === 'claimer').length;
        const scouts = creeps.filter(c => c.memory.role === 'scout').length;
        
        // Calculate needed remote workers
        let neededRemoteHarvesters = 0;
        let neededHaulers = 0;
        let neededClaimers = 0;
        let neededScouts = 0;
        
        for (const roomName of room.memory.remoteRooms) {
            const assignment = room.memory.remoteAssignments[roomName];
            if (!assignment || assignment.scouting) continue;
            
            for (const sourceId in assignment.sources) {
                const sourceAssignment = assignment.sources[sourceId];
                
                if (!sourceAssignment.harvester) {
                    neededRemoteHarvesters++;
                }
                if (!sourceAssignment.hauler && sourceAssignment.harvester && neededHaulers < 3) {
                    neededHaulers++;
                }
            }
            
            // Check if we need a claimer
            const remoteRoom = Game.rooms[roomName];
            if (remoteRoom && remoteRoom.controller) {
                const reservation = remoteRoom.controller.reservation;
                if (!reservation || reservation.ticksToEnd < 1000) {
                    if (!assignment.claimer) {
                        neededClaimers++;
                    }
                }
            }
        }
        
        // Always want at least 1 scout if we don't have one
        if (scouts < 1) {
            neededScouts = 1;
        }
        
        // Store needed counts in memory for SpawnManager to use
        room.memory.neededRemoteHarvesters = neededRemoteHarvesters;
        room.memory.neededHaulers = neededHaulers;
        room.memory.neededClaimers = neededClaimers;
        room.memory.neededScouts = neededScouts;
    }
}

module.exports = RoomManager;
