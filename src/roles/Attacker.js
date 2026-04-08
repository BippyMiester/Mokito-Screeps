'use strict';

/**
 * Attacker - Part of attack squads (3 attackers + 1 healer)
 * Travels to enemy rooms and destroys structures/spawn
 * Coordinates with squad members - waits until full group before attacking
 */
class Attacker {
    run(creep) {
        // Check if we're part of a squad
        if (!creep.memory.squadId) {
            creep.say('❌ no squad');
            return;
        }

        // Get squad info
        const squad = Memory.attackSquads[creep.memory.squadId];
        if (!squad) {
            // Squad doesn't exist, try to find a new one
            this.findNewSquad(creep);
            return;
        }

        // Check if squad is ready (all 4 members spawned)
        if (!squad.ready) {
            this.waitForSquad(creep, squad);
            return;
        }

        // Squad is ready - proceed with attack
        this.executeAttack(creep, squad);
    }

    /**
     * Find a new squad to join
     */
    findNewSquad(creep) {
        // Look for squads needing attackers
        for (const squadId in Memory.attackSquads) {
            const squad = Memory.attackSquads[squadId];
            if (squad.members.attackers.length < 3) {
                // Join this squad
                creep.memory.squadId = squadId;
                squad.members.attackers.push(creep.name);
                creep.say('🎖️ joined');
                return;
            }
        }

        // No squad found - wait
        creep.say('⏳ waiting');
    }

    /**
     * Wait for full squad to form near spawn
     */
    waitForSquad(creep, squad) {
        // Move to spawn
        const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
        if (!spawn) return;

        // Stay near spawn
        if (!creep.pos.inRangeTo(spawn, 3)) {
            creep.moveTo(spawn, { range: 3 });
            return;
        }

        // Count current squad members present
        const presentAttackers = squad.members.attackers.filter(name => {
            const otherCreep = Game.creeps[name];
            return otherCreep && otherCreep.room.name === creep.room.name;
        });

        const presentHealers = squad.members.healers.filter(name => {
            const otherCreep = Game.creeps[name];
            return otherCreep && otherCreep.room.name === creep.room.name;
        });

        // Check if full squad is ready
        if (presentAttackers.length >= 3 && presentHealers.length >= 1) {
            squad.ready = true;
            console.log(`🎖️ Squad ${creep.memory.squadId} is ready to attack ${squad.targetRoom}!`);
            
            // Notify all squad members
            for (const name of [...squad.members.attackers, ...squad.members.healers]) {
                const otherCreep = Game.creeps[name];
                if (otherCreep) {
                    otherCreep.say('⚔️ CHARGE!');
                }
            }
        } else {
            // Show waiting status
            creep.say(`⏳ ${presentAttackers.length}/3A ${presentHealers.length}/1H`);
        }
    }

    /**
     * Execute attack on target room
     */
    executeAttack(creep, squad) {
        // Check if we need to retreat
        if (this.shouldRetreat(creep)) {
            this.retreat(creep, squad);
            return;
        }

        // Travel to target room
        if (creep.room.name !== squad.targetRoom) {
            this.travelToTarget(creep, squad.targetRoom);
            return;
        }

        // In target room - find something to attack
        const target = this.findAttackTarget(creep, squad);
        
        if (target) {
            this.attackTarget(creep, target);
        } else {
            // Nothing to attack - maybe room is cleared
            this.handleRoomCleared(creep, squad);
        }
    }

    /**
     * Determine if creep should retreat
     */
    shouldRetreat(creep) {
        // Retreat if heavily damaged
        if (creep.hits < creep.hitsMax * 0.3) {
            return true;
        }

        // Retreat if no healer nearby and damaged
        if (creep.hits < creep.hitsMax * 0.6) {
            const healerNearby = this.findNearbyHealer(creep);
            if (!healerNearby) {
                return true;
            }
        }

        // Retreat if surrounded by enemies
        const nearbyHostiles = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 2);
        if (nearbyHostiles.length >= 3) {
            return true;
        }

        return false;
    }

    /**
     * Find a nearby healer from our squad
     */
    findNearbyHealer(creep) {
        const squad = Memory.attackSquads[creep.memory.squadId];
        if (!squad) return null;

        for (const healerName of squad.members.healers) {
            const healer = Game.creeps[healerName];
            if (healer && healer.room.name === creep.room.name) {
                const range = creep.pos.getRangeTo(healer);
                if (range <= 3) {
                    return healer;
                }
            }
        }

        return null;
    }

    /**
     * Retreat to safer position
     */
    retreat(creep, squad) {
        // Try to move toward a healer or exit
        const healer = this.findNearbyHealer(creep);
        
        if (healer) {
            creep.moveTo(healer, {
                visualizePathStyle: { stroke: '#ffff00' }
            });
            creep.say('🏃 to healer');
        } else {
            // Retreat toward exit
            const exit = creep.pos.findClosestByRange(FIND_EXIT);
            if (exit) {
                creep.moveTo(exit, {
                    visualizePathStyle: { stroke: '#ffff00' }
                });
                creep.say('🏃 retreat');
            }
        }

        // Self-heal if we have heal parts
        if (creep.body.some(p => p.type === HEAL && p.hits > 0)) {
            creep.heal(creep);
        }
    }

    /**
     * Travel to target room
     */
    travelToTarget(creep, targetRoom) {
        const route = Game.map.findRoute(creep.room.name, targetRoom);
        
        if (route === ERR_NO_PATH) {
            creep.say('❌ no path');
            return;
        }

        if (route.length > 0) {
            const exitDir = route[0].exit;
            const exit = creep.pos.findClosestByPath(exitDir);
            
            if (exit) {
                creep.moveTo(exit, {
                    visualizePathStyle: { stroke: '#ff0000' }
                });
            }
        }
    }

    /**
     * Find priority target to attack
     * Priority: Spawn > Towers > Extensions > Controller > Other structures
     */
    findAttackTarget(creep, squad) {
        // Priority 1: Enemy spawn
        const spawn = creep.pos.findClosestByPath(FIND_HOSTILE_SPAWNS);
        if (spawn) {
            return { target: spawn, priority: 'spawn' };
        }

        // Priority 2: Towers
        const tower = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER
        });
        if (tower) {
            return { target: tower, priority: 'tower' };
        }

        // Priority 3: Extensions
        const extension = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION
        });
        if (extension) {
            return { target: extension, priority: 'extension' };
        }

        // Priority 4: Controller
        if (creep.room.controller) {
            return { target: creep.room.controller, priority: 'controller' };
        }

        // Priority 5: Any hostile structure
        const structure = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES);
        if (structure) {
            return { target: structure, priority: 'structure' };
        }

        // Priority 6: Hostile creeps
        const hostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS);
        if (hostile) {
            return { target: hostile, priority: 'creep' };
        }

        // Priority 7: Construction sites
        const site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        if (site) {
            return { target: site, priority: 'construction' };
        }

        return null;
    }

    /**
     * Attack a target
     */
    attackTarget(creep, targetInfo) {
        const target = targetInfo.target;
        const range = creep.pos.getRangeTo(target);

        if (range <= 1) {
            // Adjacent - attack
            creep.attack(target);
            creep.say(`⚔️ ${targetInfo.priority}`);
        } else {
            // Move closer
            creep.moveTo(target, {
                visualizePathStyle: { stroke: '#ff0000' },
                maxRooms: 1
            });
            
            // Try attacking anyway (might be in range)
            if (creep.pos.getRangeTo(target) <= 1) {
                creep.attack(target);
            }
        }
    }

    /**
     * Handle when room appears to be cleared
     */
    handleRoomCleared(creep, squad) {
        // Check if controller is safe mode
        if (creep.room.controller && creep.room.controller.safeMode) {
            // Wait for safe mode to expire
            creep.say('⏳ safe mode');
            
            // Attack construction sites if any
            const sites = creep.room.find(FIND_CONSTRUCTION_SITES);
            if (sites.length > 0) {
                creep.moveTo(sites[0]);
                creep.attack(sites[0]);
            }
            return;
        }

        // Room seems cleared - report success
        console.log(`✅ Squad ${creep.memory.squadId} has cleared ${creep.room.name}`);
        
        // Mark squad as successful
        squad.status = 'success';
        
        // Move to a rally point or return home
        const homeRoom = Game.rooms[squad.homeRoom];
        if (homeRoom) {
            const spawn = homeRoom.find(FIND_MY_SPAWNS)[0];
            if (spawn) {
                creep.moveTo(spawn);
            }
        }
    }
}

module.exports = Attacker;
