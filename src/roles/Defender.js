'use strict';

/**
 * Defender - Protects room from hostile creeps
 * Automatically spawned when enemies are detected in the room
 * Targets hostile creeps, prioritizing healers and dangerous units
 */
class Defender {
    run(creep) {
        // Check if we're under attack
        if (!this.isRoomUnderAttack(creep.room)) {
            // No enemies - move to rally point near spawn or recycle
            this.moveToRallyPoint(creep);
            return;
        }

        // Find and attack hostile creeps
        const target = this.findPriorityTarget(creep);
        
        if (target) {
            this.engageTarget(creep, target);
        } else {
            // No visible hostiles but attack timer active - patrol
            this.patrolRoom(creep);
        }
    }

    /**
     * Check if room is currently under attack
     */
    isRoomUnderAttack(room) {
        // Check memory for attack timer
        if (room.memory.attackTimer > 0) {
            return true;
        }
        
        // Check for hostile creeps
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            // Set attack timer (decrements in RoomManager)
            room.memory.attackTimer = 20; // 20 ticks of alert after last seen
            return true;
        }
        
        return false;
    }

    /**
     * Find priority target for attack
     * Priority: Healers > Ranged attackers > Melee attackers > Workers
     */
    findPriorityTarget(creep) {
        const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        
        if (hostiles.length === 0) {
            return null;
        }

        // Score each hostile by threat level
        const scored = hostiles.map(hostile => {
            let score = 0;
            
            // Check body parts
            const body = hostile.body;
            const healParts = body.filter(p => p.type === HEAL).length;
            const rangedParts = body.filter(p => p.type === RANGED_ATTACK).length;
            const attackParts = body.filter(p => p.type === ATTACK).length;
            const workParts = body.filter(p => p.type === WORK).length;
            
            // Prioritize by threat (higher score = higher priority)
            if (healParts > 0) score += 100 + healParts * 10; // Healers are top priority
            if (rangedParts > 0) score += 50 + rangedParts * 5; // Ranged attackers
            if (attackParts > 0) score += 30 + attackParts * 3; // Melee attackers
            if (workParts > 0) score += 10; // Workers/collectors
            
            // Prefer closer targets slightly
            const range = creep.pos.getRangeTo(hostile);
            score -= range * 0.5;
            
            return { hostile, score };
        });
        
        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);
        
        return scored[0].hostile;
    }

    /**
     * Engage a target in combat
     */
    engageTarget(creep, target) {
        const range = creep.pos.getRangeTo(target);
        
        // If we're damaged and not at full health, check if we should retreat
        if (creep.hits < creep.hitsMax * 0.5) {
            // Retreat to heal if possible
            this.retreatIfPossible(creep, target);
            return;
        }
        
        if (range <= 1) {
            // Adjacent - attack
            creep.attack(target);
            creep.say('⚔️ attack');
        } else {
            // Move closer
            const result = creep.moveTo(target, {
                visualizePathStyle: { stroke: '#ff0000' },
                reusePath: 3
            });
            
            // Try to attack if in range (might have moved)
            if (creep.pos.getRangeTo(target) <= 1) {
                creep.attack(target);
            }
        }
    }

    /**
     * Retreat to a safer position if possible
     */
    retreatIfPossible(creep, threat) {
        // Find direction away from threat
        const dx = creep.pos.x - threat.pos.x;
        const dy = creep.pos.y - threat.pos.y;
        
        // Calculate retreat position
        let retreatX = creep.pos.x + Math.sign(dx) * 2;
        let retreatY = creep.pos.y + Math.sign(dy) * 2;
        
        // Clamp to room bounds
        retreatX = Math.max(1, Math.min(48, retreatX));
        retreatY = Math.max(1, Math.min(48, retreatY));
        
        const retreatPos = new RoomPosition(retreatX, retreatY, creep.room.name);
        
        // Check if retreat position is safe (no hostiles adjacent)
        const hostilesAtRetreat = retreatPos.findInRange(FIND_HOSTILE_CREEPS, 1);
        
        if (hostilesAtRetreat.length === 0) {
            // Safe to retreat
            creep.moveTo(retreatPos, {
                visualizePathStyle: { stroke: '#ffff00' }
            });
            creep.say('🏃 retreat');
            
            // Self-heal if we have heal parts
            if (creep.body.some(p => p.type === HEAL && p.hits > 0)) {
                creep.heal(creep);
            }
        } else {
            // Can't retreat safely, fight on
            if (creep.pos.getRangeTo(threat) <= 1) {
                creep.attack(threat);
            }
        }
    }

    /**
     * Move to rally point when no enemies present
     */
    moveToRallyPoint(creep) {
        const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
        if (spawn) {
            // Stay near spawn but not on top of it
            if (!creep.pos.inRangeTo(spawn, 3)) {
                creep.moveTo(spawn, {
                    range: 3,
                    visualizePathStyle: { stroke: '#00ff00' }
                });
            } else {
                // At rally point - heal up if damaged
                if (creep.hits < creep.hitsMax && 
                    creep.body.some(p => p.type === HEAL && p.hits > 0)) {
                    creep.heal(creep);
                }
            }
        }
    }

    /**
     * Patrol room when attack timer active but no visible enemies
     */
    patrolRoom(creep) {
        const spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
        if (spawn) {
            // Move between spawn and controller
            const controller = creep.room.controller;
            if (controller) {
                const target = creep.pos.getRangeTo(spawn) > creep.pos.getRangeTo(controller) 
                    ? spawn 
                    : controller;
                
                creep.moveTo(target, {
                    range: 5,
                    visualizePathStyle: { stroke: '#00ff00' }
                });
            }
        }
    }
}

module.exports = Defender;
