'use strict';

/**
 * Healer - Part of attack squads (1 healer per squad of 4)
 * Heals attackers and keeps the squad alive
 * Follows attackers and maintains formation
 */
class Healer {
    run(creep) {
        // Check if we're part of a squad
        if (!creep.memory.squadId) {
            creep.say('❌ no squad');
            return;
        }

        const squad = Memory.attackSquads[creep.memory.squadId];
        if (!squad) {
            creep.say('❌ squad gone');
            return;
        }

        // Check if we need to retreat
        if (this.shouldRetreat(creep)) {
            this.retreat(creep);
            return;
        }

        // Self-heal if damaged
        if (creep.hits < creep.hitsMax && 
            creep.body.some(p => p.type === HEAL && p.hits > 0)) {
            creep.heal(creep);
        }

        // Squad not ready yet - wait at spawn
        if (!squad.ready) {
            this.waitForSquad(creep, squad);
            return;
        }

        // Squad is ready - follow and heal attackers
        this.supportSquad(creep, squad);
    }

    /**
     * Wait for full squad formation near spawn
     */
    waitForSquad(creep, squad) {
        const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
        if (!spawn) return;

        // Stay near spawn
        if (!creep.pos.inRangeTo(spawn, 3)) {
            creep.moveTo(spawn, { range: 3 });
        } else {
            // Check squad status
            const presentAttackers = squad.members.attackers.filter(name => {
                const other = Game.creeps[name];
                return other && other.room.name === creep.room.name;
            }).length;

            const presentHealers = squad.members.healers.filter(name => {
                const other = Game.creeps[name];
                return other && other.room.name === creep.room.name;
            }).length;

            creep.say(`⏳ ${presentAttackers}/3A`);

            // Heal any damaged squad members nearby
            const damagedSquadMate = this.findDamagedSquadMate(creep, squad);
            if (damagedSquadMate) {
                this.healTarget(creep, damagedSquadMate);
            }
        }
    }

    /**
     * Support the squad by healing and following attackers
     */
    supportSquad(creep, squad) {
        // Travel to target room if needed
        if (creep.room.name !== squad.targetRoom) {
            this.travelToTarget(creep, squad.targetRoom);
            return;
        }

        // In target room - find someone to heal
        const healTarget = this.findBestHealTarget(creep, squad);
        
        if (healTarget) {
            this.healTarget(creep, healTarget);
        } else {
            // No one to heal - follow the closest attacker
            this.followAttacker(creep, squad);
        }
    }

    /**
     * Find the best target to heal
     * Priority: Dying squad members > Damaged squad members > Damaged self
     */
    findBestHealTarget(creep, squad) {
        const allSquadMembers = [...squad.members.attackers, ...squad.members.healers];
        let bestTarget = null;
        let bestPriority = -1;

        for (const name of allSquadMembers) {
            const targetCreep = Game.creeps[name];
            if (!targetCreep || targetCreep.name === creep.name) continue;
            if (targetCreep.room.name !== creep.room.name) continue;

            const healthPercent = targetCreep.hits / targetCreep.hitsMax;
            const range = creep.pos.getRangeTo(targetCreep);

            // Calculate priority (higher = more urgent)
            let priority = 0;
            
            // Critical health = very high priority
            if (healthPercent < 0.3) priority += 100;
            else if (healthPercent < 0.5) priority += 50;
            else if (healthPercent < 0.8) priority += 20;

            // Attacking creeps get priority over healers
            if (squad.members.attackers.includes(name)) priority += 10;

            // Closer targets get slight priority
            priority -= range * 2;

            if (priority > bestPriority) {
                bestPriority = priority;
                bestTarget = targetCreep;
            }
        }

        return bestTarget;
    }

    /**
     * Find damaged squad members near spawn while waiting
     */
    findDamagedSquadMate(creep, squad) {
        const allMembers = [...squad.members.attackers, ...squad.members.healers];
        
        for (const name of allMembers) {
            if (name === creep.name) continue;
            
            const other = Game.creeps[name];
            if (!other || other.room.name !== creep.room.name) continue;
            if (other.hits >= other.hitsMax) continue;

            const range = creep.pos.getRangeTo(other);
            if (range <= 3) {
                return other;
            }
        }

        return null;
    }

    /**
     * Heal a target (ranged or adjacent)
     */
    healTarget(creep, target) {
        const range = creep.pos.getRangeTo(target);

        if (range <= 1) {
            // Adjacent - heal directly
            creep.heal(target);
            creep.say('💚 heal');
        } else if (range <= 3) {
            // In range - ranged heal
            creep.rangedHeal(target);
            creep.say('💚 ranged');
        } else {
            // Move closer
            creep.moveTo(target, {
                visualizePathStyle: { stroke: '#00ff00' },
                range: 1
            });
        }
    }

    /**
     * Follow the closest attacker when no healing needed
     */
    followAttacker(creep, squad) {
        // Find closest attacker in the room
        let closestAttacker = null;
        let closestRange = Infinity;

        for (const name of squad.members.attackers) {
            const attacker = Game.creeps[name];
            if (!attacker || attacker.room.name !== creep.room.name) continue;

            const range = creep.pos.getRangeTo(attacker);
            if (range < closestRange) {
                closestRange = range;
                closestAttacker = attacker;
            }
        }

        if (closestAttacker) {
            // Stay 2 tiles behind the attacker
            if (closestRange > 2) {
                creep.moveTo(closestAttacker, {
                    visualizePathStyle: { stroke: '#00ff00' },
                    range: 2
                });
            }
        } else {
            // No attackers visible - move toward center of room
            creep.moveTo(25, 25);
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
                    visualizePathStyle: { stroke: '#00ff00' }
                });
            }
        }
    }

    /**
     * Check if healer should retreat
     */
    shouldRetreat(creep) {
        // Retreat if very low health
        if (creep.hits < creep.hitsMax * 0.25) {
            return true;
        }

        // Retreat if surrounded by enemies
        const nearbyHostiles = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 2);
        if (nearbyHostiles.length >= 2) {
            return true;
        }

        // Retreat if taking damage and no attackers nearby
        if (creep.hits < creep.hitsMax * 0.5) {
            const squad = Memory.attackSquads[creep.memory.squadId];
            if (squad) {
                let attackersNearby = 0;
                for (const name of squad.members.attackers) {
                    const attacker = Game.creeps[name];
                    if (attacker && attacker.room.name === creep.room.name) {
                        if (creep.pos.getRangeTo(attacker) <= 3) {
                            attackersNearby++;
                        }
                    }
                }
                
                if (attackersNearby === 0) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Retreat to safety
     */
    retreat(creep) {
        // Try to find exit
        const exit = creep.pos.findClosestByRange(FIND_EXIT);
        
        if (exit) {
            creep.moveTo(exit, {
                visualizePathStyle: { stroke: '#ffff00' }
            });
            creep.say('🏃 retreat');
        }

        // Keep self-healing while retreating
        if (creep.body.some(p => p.type === HEAL && p.hits > 0)) {
            creep.heal(creep);
        }
    }
}

module.exports = Healer;
