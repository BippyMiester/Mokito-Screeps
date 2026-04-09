# Comprehensive Military Strategy Analysis

## Executive Summary

This document analyzes military strategies from three advanced Screeps AI bots: **TooAngel**, **Overmind**, and **Mirroar-HiveMind**. Each bot implements distinct approaches to warfare, from simple solo attackers to complex coordinated squads.

---

## 1. Military Roles Found

### 1.1 TooAngel Military Roles

#### Attack Roles

**`autoattackmelee`**
- **Purpose**: First wave auto-attacker focused on spawn killing
- **Body Configuration**: `'MA'` with `amount: [5, 5]`, `fillTough: true`
- **Strategy**:
  - Primary target: Hostile spawn (highest priority)
  - Secondary: Closest enemy creep, then hostile structures, then construction sites
  - Uses `ignoreDestructibleStructures: true` for pathing to spawn
  - Supports safe mode handling (attacks construction sites when safe mode active)
- **Key Code Pattern**:
```javascript
const spawn = creep.pos.findClosestByRangeHostileSpawn();
if (!spawn) {
  attackWithoutSpawn(creep); // Fallback chain
  return true;
}
const path = creep.pos.findPathTo(spawn, {ignoreDestructibleStructures: true});
creep.attack(spawn);
creep.moveByPath(path);
```

**`nextroomerattack`**
- **Purpose**: Clears blocked routes to revive rooms
- **Body Configuration**: Same as autoattackmelee (`'MA'`, `[5, 5]`)
- **Strategy**: Simple spawn-focused attack, attacks anything hostile if no spawn

**`attackunreserve`**
- **Purpose**: Defends external rooms from hostile reservation
- **Body Configuration**: `prefixString: 'MMMMRRHH'`, `layoutString: 'AM'`
- **Boost Actions**: `['rangedAttack', 'heal']`
- **Target Priority**:
  1. Creeps with CLAIM parts (highest priority)
  2. Creeps with WORK parts
  3. Creeps with CARRY parts
  4. Any hostile creep
  5. Hostile structures
  6. Any structure

**`squadsiege`**
- **Purpose**: Siege unit in coordinated squad attacks
- **Body Configuration**: `'MW'` (Move + Work), `maxLayoutAmount: 21`, `fillTough: true`
- **Capabilities**:
  - Dismantles structures while moving (walls, ramparts, everything)
  - Uses `dismantle()` for efficient structure destruction
  - Retreats when damaged (`creep.hits < creep.hitsMax`)
- **Pre-Move Action**: Dismantles adjacent structures in path

```javascript
roles.squadsiege.dismantleSurroundingStructures = function(creep, directions) {
  const posForward = creep.pos.getAdjacentPosition(directions.forwardDirection);
  const structures = posForward.lookFor(LOOK_STRUCTURES);
  // Prioritizes: Other structures > Ramparts > Walls
};
```

#### Defense Roles

**`defender`**
- **Purpose**: General room defender for external rooms
- **Body Configuration**: `'MRH'` (Move/Ranged/Heal), scales with controller level
  - Level 1: `[2, 1, 1]`
  - Level 8: `[4, 1, 1]`
- **Boost Actions**: `['rangedAttack', 'heal']`
- **Behavior**:
  - Self-heals continuously
  - Uses `handleDefender()` for combat
  - Recycles if in base with reverse flag

**`defendmelee`**
- **Purpose**: Emergency melee defender
- **Body Configuration**: `'MA'` `[1, 1]`, `fillTough: true`
- **Behavior**:
  - Simple closest-enemy attack
  - Uses PathFinder with cost matrix callback
  - Recycles if no enemies (every 3rd tick check)

**`defendranged`**
- **Purpose**: Ranged defender from ramparts
- **Body Configuration**: `'RM'` `[1, 1]`, `maxLayoutAmount: 20`, `fillTough: true`
- **Key Tactics**:
  - Uses `fightRampart()` - positions on ramparts near enemies
  - Falls back to `fightRanged()` if no rampart available
  - Recycles after countdown if no enemies

```javascript
const action = function(creep) {
  let hostiles = creep.room.findEnemies();
  if (!hostiles.length) {
    if (recycleCreep(creep)) return true;
    creep.waitRampart(); // Wait on closest rampart
    return true;
  }
  
  if (creep.fightRampart(target)) {
    creep.say('fightRampart');
    return true;
  }
  
  creep.say('fightRanged');
  return creep.fightRanged(target);
};
```

#### Support Roles

**`squadheal`**
- **Purpose**: Dedicated healer for squads
- **Body Configuration**: `'MH'` `[1, 1]`, `fillTough: true`
- **Healing Priority**:
  1. Self-heal if damaged (triggers reverse routing)
  2. Heal closest damaged creep
  3. Follow squad siege creeps
- **Squad Integration**:
```javascript
roles.squadheal.preMove = function(creep, directions) {
  if (creep.hits < creep.hitsMax) {
    creep.selfHeal();
    creep.memory.routing.reverse = true;
    return false;
  }
  
  if (creep.healClosestCreep()) return true;
  
  if (squad.action === 'move') {
    if (creep.squadMove(squad, 4, false, 'heal')) return true;
  }
};
```

### 1.2 Overmind Military Roles

Overmind uses a **role-based zerg system** with `CombatZerg` and `Swarm` abstractions:

**Combat Roles (via CreepSetup)**
- **`melee`** (zergling): Melee attackers for swarms
- **`ranged`** (hydralisk): Ranged attackers (siege variants)
- **`healer`** (medic): Dedicated healers
- **`guardMelee`** (broodling): Fast response guards

**Key Pattern: CombatZerg**
```typescript
// CombatZerg extends Zerg with combat capabilities
interface CombatZerg extends Zerg {
  // Auto-combat methods
  autoMelee(): void;
  autoRanged(): void;
  autoHeal(allowRangedHeal?: boolean): void;
  autoSkirmish(roomName: string): void;
  attackAndChase(target: Creep | Structure): void;
}
```

### 1.3 Mirroar-HiveMind Military Roles

**`brawler`**
- **Purpose**: Multi-purpose military unit
- **Capabilities**: Attack, heal, claim (context-dependent)
- **Target System**: Weighted priority options
```typescript
type MilitaryTargetOption = 
  | {type: 'hostilecreep', priority: number, weight: number, object: Creep}
  | {type: 'hostilestructure', priority: number, weight: number, object: AnyStructure}
  | {type: 'controller', priority: number, weight: number, object: StructureController}
  | {type: 'creep', priority: number, weight: number, object: Creep}; // For healing
```

**`guardian`**
- **Purpose**: Room defense from ramparts
- **Tactics**:
  - Finds best rampart to cover enemy positions
  - Uses `militaryPriority` for targeting
  - Supports both melee and ranged attacks

**`scout`**
- **Purpose**: Intelligence gathering
- **Features**:
  - Smart target selection based on priority
  - Oscillation detection (prevents stuck scouts)
  - NavMesh integration for pathfinding

**`dismantler`**
- **Purpose**: Structure destruction specialist
- **Features**:
  - Targets specific structures by position
  - Supports operation-specific dismantling

---

## 2. Squad Tactics

### 2.1 TooAngel Squad System

**Squad Structure**
- Defined in `Memory.squads[squadName]`
- Tracks: `born`, `target`, `from`, `route`, `action`, `moveTarget`
- Contains sub-collections: `siege`, `heal`, `autoattackmelee`

**Squad Types**

1. **Siege Squad** (`startSquad`)
   - Composition: 1 squadsiege + 3 squadheal
   - Purpose: Destroy structures and breach walls

2. **Melee Squad** (`startMeleeSquad`)
   - Composition: 3 autoattackmelee + 3 squadheal
   - Purpose: Clean rooms from invaders

**Squad State Machine**
```javascript
// Squad states: 'move' -> 'attack'
if (squad.action === 'move') {
  // Check if all creeps are waiting at rally point
  let allReady = true;
  for (const siegeId of Object.keys(squad.siege)) {
    if (!siege.waiting) allReady = false;
  }
  for (const healId of Object.keys(squad.heal)) {
    if (!heal.waiting) allReady = false;
  }
  
  if (allReady) squad.action = 'attack';
}
```

**Squad Movement Coordination**
```javascript
Creep.prototype.squadMove = function(squad, maxRange, moveRandom, role) {
  if (this.room.name === squad.moveTarget) {
    const nextExits = this.room.find(this.memory.routing.route[...].exit);
    const nextExit = nextExits[Math.floor(nextExits.length / 2)];
    const range = this.pos.getRangeTo(nextExit.x, nextExit.y);
    
    if (range < maxRange) {
      // Signal ready and wait
      Memory.squads[this.memory.squad][role][this.id].waiting = true;
      if (moveRandom) this.moveRandom();
      return true;
    }
  }
  return false;
};
```

### 2.2 Overmind Swarm System

**Swarm Architecture**
```typescript
class Swarm implements ProtoSwarm {
  creeps: CombatZerg[];                    // All combat creeps
  formation: (CombatZerg | undefined)[][];  // 2D formation grid
  staticFormation: (CombatZerg | undefined)[][];  // Base formation
  width: number;                          // Formation width
  height: number;                         // Formation height
  anchor: RoomPosition;                   // Top-left position
  orientation: TOP | RIGHT | BOTTOM | LEFT;
  
  // Formation sorting: Attackers front, healers rear
  getCreepScores(creeps) {
    const score = CombatIntel.getAttackPotential(creep) 
                  + CombatIntel.getRangedAttackPotential(creep)
                  + CombatIntel.getDismantlePotential(creep) 
                  - CombatIntel.getHealPotential(creep);
    return -1 * score;  // Negative so attackers come first
  }
}
```

**Formation Orientation System**
- Supports 4 orientations: TOP, RIGHT, BOTTOM, LEFT
- Can pivot clockwise/counter-clockwise
- Can swap horizontally/vertically
- Maintains formation integrity during rotation

```typescript
rotate(direction: TOP | BOTTOM | LEFT | RIGHT): number {
  const rotateAngle = newAngle - prevAngle;
  
  if (rotateAngle == 3 || rotateAngle == -1) {
    return this.pivot('counterclockwise');
  } else if (rotateAngle == 1 || rotateAngle == -3) {
    return this.pivot('clockwise');
  } else if (rotateAngle == 2 || rotateAngle == -2) {
    return newAngle % 2 == 0 ? this.swap('vertical') : this.swap('horizontal');
  }
}

private pivot(direction: 'clockwise' | 'counterclockwise'): number {
  // Moves each creep in formation to rotate
  // c1 -> RIGHT, c2 -> BOTTOM, c3 -> TOP, c4 -> LEFT (clockwise)
}
```

**Swarm Assembly & Regroup**
```typescript
assemble(assemblyPoint: RoomPosition, allowIdleCombat = true): boolean {
  if (this.isInFormation(assemblyPoint) && this.hasMaxCreeps) {
    this.memory.initialAssembly = true;
    return true;
  }
  
  // Each creep moves to its formation position
  const formationPositions = this.getFormationPositionsFromAnchor(assemblyPoint);
  for (const creep of this.creeps) {
    if (allowIdleCombat && creep.room.dangerousPlayerHostiles.length > 0) {
      creep.autoSkirmish(creep.room.name);
    } else {
      creep.goTo(formationPositions[creep.name], {
        noPush: creep.pos.inRangeToPos(destination, 5),
        ignoreCreepsOnDestination: true
      });
    }
  }
}

regroup(): boolean {
  if (this.isInFormation(this.anchor)) return true;
  const regroupPosition = this.findRegroupPosition();
  return this.assemble(regroupPosition, false);
}
```

### 2.3 Mirroar-HiveMind Squad System

**Squad Interface**
```typescript
interface Squad {
  getName(): string;
  addUnit(unitType: SquadUnitType): number;
  removeUnit(unitType: SquadUnitType): number;
  setUnitCount(unitType: SquadUnitType, count: number): void;
  getUnitCount(unitType: SquadUnitType): number;
  getComposition(): Partial<Record<SquadUnitType, number>>;
  clearUnits(): void;
  disband(): void;
  getOrders(): Array<{priority: number, weight: number, target: string}>;
  setSpawn(roomName: string): void;
  getSpawn(): string;
  setTarget(targetPos: RoomPosition): void;
  getTarget(): RoomPosition | null;
}
```

**Squad Movement**
```typescript
performSquadMove(creep: BrawlerCreep) {
  const squad = this.squadManager.getSquad(creep.memory.squadName);
  if (!squad) return; // @todo Go recycle
  
  // Movement is dictated by squad orders
  const orders = squad.getOrders();
  if (orders.length > 0) {
    creep.memory.target = orders[0].target;
  } else {
    delete creep.memory.target;
  }
  
  if (!creep.memory.target) {
    // No orders - wait by spawn and renew
    if (creep.ticksToLive < CREEP_LIFE_TIME * 0.66) {
      spawn.renewCreep(creep);
    }
  }
}
```

---

## 3. Attack Strategies

### 3.1 Spawn Kill Strategy

**TooAngel Implementation**
```javascript
roles.autoattackmelee.action = function(creep) {
  const spawn = creep.pos.findClosestByRangeHostileSpawn();
  if (!spawn) {
    attackWithoutSpawn(creep); // Fallback
    return true;
  }
  
  const search = PathFinder.search(creep.pos, {pos: spawn.pos, range: 1}, {maxRooms: 1});
  creep.move(creep.pos.getDirectionTo(search.path[0]));
  
  if (creep.pos.getRangeTo(spawn.pos) <= 1) {
    creep.attack(spawn);
  } else {
    // Attack structures along the way
    const structures = creep.pos.findInRange(FIND_STRUCTURES, 1);
    creep.attack(structures[0]);
  }
};
```

**Target Priority Chain**:
1. Hostile spawn
2. Hostile creeps
3. Hostile structures
4. Construction sites

### 3.2 Room Denial/Siege Strategy

**TooAngel Siege Algorithm**
```javascript
Creep.prototype.siege = function() {
  // Track damage for retreat decisions
  this.memory.hitsLost = this.memory.hitsLast - this.hits;
  this.memory.hitsLast = this.hits;
  
  // Retreat if heavily damaged
  if (withdraw(this)) return true;
  
  // Target priority: Tower -> Spawn
  let target = creep.pos.findClosestStructure(FIND_HOSTILE_STRUCTURES, STRUCTURE_TOWER);
  if (!target) {
    target = creep.pos.findClosestStructure(FIND_HOSTILE_STRUCTURES, STRUCTURE_SPAWN);
  }
  
  if (!target) {
    destroyConstructionSites(this);
    return false;
  }
  
  // Path to target, dismantle ramparts in the way
  const path = this.pos.findPathTo(target, {
    ignoreDestructibleStructures: false,
    ignoreCreeps: true
  });
  
  // Check if path is blocked by ramparts
  if (path.length === 0 || !target.pos.isEqualTo(path[path.length-1])) {
    const rampart = this.pos.findClosestStructure(FIND_STRUCTURES, STRUCTURE_RAMPART);
    this.moveTo(rampart);
    target = rampart;
  }
  
  this.dismantle(target);
};
```

**Overmind Swarm Siege**
```typescript
autoSiege(roomName: string, waypoint?: RoomPosition) {
  this.autoMelee();
  this.autoRanged();
  this.autoHeal();
  
  if (!this.isInFormation()) {
    if (!_.any(this.creeps, creep => creep.pos.isEdge)) {
      return this.regroup();
    }
  }
  
  // Recovery logic
  if (this.needsToRecover()) {
    this.target = undefined;
    return this.recover();
  }
  
  // Travel to target room
  if (!this.safelyInRoom(roomName)) {
    return waypoint ? this.goTo(waypoint) : this.goToRoom(roomName);
  }
  
  // Find and approach target
  if (!this.target) {
    this.target = CombatTargeting.findBestSwarmStructureTarget(
      this, roomName, 10 * this.memory.numRetreats, displayCostMatrix
    );
  }
  
  if (this.target) {
    this.combatMove([{pos: this.target.pos, range: 1}], []);
  }
  
  this.reorient(true, false);  // Face structure targets
}
```

### 3.3 Harassment/Guerrilla Tactics

**Overmind Guard Swarm**
```typescript
private handleGuard(guard: CombatZerg): void {
  if (guard.pos.roomName != this.pos.roomName) {
    guard.goToRoom(this.pos.roomName);
  } else {
    const attackTarget = this.findAttackTarget(guard);
    if (attackTarget) {
      guard.attackAndChase(attackTarget);
    } else {
      guard.park(this.pos); // Move off-road when idle
    }
  }
}

private findAttackTarget(guard: Zerg): Creep | Structure | undefined {
  if (guard.room.hostiles.length > 0) {
    const targets = _.filter(guard.room.hostiles, 
      hostile => hostile.pos.rangeToEdge > 0);  // Don't chase to edge
    return guard.pos.findClosestByRange(targets);
  }
  if (guard.room.hostileStructures.length > 0) {
    return guard.pos.findClosestByRange(guard.room.hostileStructures);
  }
}
```

**Mirroar-HiveMind Brawler Kiting**
```typescript
// Ranged attack with kiting
if (creep.getActiveBodyparts(RANGED_ATTACK)) {
  if (creep.pos.getRangeTo(target.pos) >= 3) {
    creep.moveTo(target, {range: 2});
    return;
  }
  
  // Flee while attacking
  const result = PathFinder.search(creep.pos, {pos: target.pos, range: 2}, {
    roomCallback: roomName => getCostMatrix(roomName, {ignoreMilitary: true}),
    flee: true,
    maxRooms: 1
  });
  
  if (result.path && result.path.length > 0) {
    creep.move(creep.pos.getDirectionTo(result.path[0]));
  }
}
```

### 3.4 Melee Rush Strategy

**TooAngel Melee Squad**
```javascript
function startMeleeSquad(roomNameFrom, roomNameAttack, spawns) {
  const defaultSpawns = [
    {creeps: 1, role: 'autoattackmelee'},
    {creeps: 1, role: 'squadheal'},
    {creeps: 2, role: 'autoattackmelee'},
    {creeps: 2, role: 'squadheal'}
  ];
  
  return createSquad('melee', roomNameFrom, roomNameAttack, spawns || defaultSpawns, {
    autoattackmelee: {},
    heal: {}
  });
}
```

**Composition Strategy**:
- 3 Melee attackers with TOUGH priority
- 3 Healers to support
- Close formation for mutual support

---

## 4. Defense Strategies

### 4.1 Tower Defense

**TooAngel Tower Management**
```javascript
Room.prototype.handleTowerWithEnemies = function(hostileCreeps, towers) {
  const hostileOffset = {};
  
  // Sort towers by distance to closest hostile
  const towersAttacking = _.sortBy(towers, (tower) => {
    const hostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    return tower.pos.getRangeTo(hostile);
  });
  
  // Each tower targets different hostile (offset prevents overkill)
  for (const tower of towersAttacking) {
    const sortHostiles = (object) => {
      return tower.pos.getRangeTo(object) + (hostileOffset[object.id] || 0);
    };
    const hostilesSorted = _.sortBy(hostileCreeps, sortHostiles);
    tower.attack(hostilesSorted[0]);
    hostileOffset[hostilesSorted[0].id] = 100;  // De-prioritize this target
  }
};
```

**Mirroar-HiveMind Military Intelligence System**
```typescript
Room.prototype.assertMilitarySituation = function() {
  this.sitRep = {
    damage: {},      // Expected damage at each position
    healing: {},    // Expected healing at each position
    myDamage: {},   // Our damage output
    myHealing: {}   // Our healing output
  };
  
  // Parse all creeps and structures
  for (const creep of creeps) {
    if (creep.my) {
      this.militaryObjects.myCreeps.push(creep);
    } else if (creep.isDangerous() && !hivemind.relations.isAlly(creep.owner.username)) {
      this.militaryObjects.creeps.push(creep);
    }
  }
  
  // Calculate threat maps
  for (const creep of this.militaryObjects.creeps) {
    this.assertMilitaryCreepPower(creep);
  }
  
  // Calculate target priorities
  this.assertTargetPriorities();
};

Room.prototype.getTowerTarget = function() {
  return cache.inObject(this, 'towerTarget', 1, () => {
    this.assertMilitarySituation();
    let max = null;
    for (const creep of this.militaryObjects.creeps) {
      if (!creep.militaryPriority || creep.militaryPriority <= 0) continue;
      if (max && max.militaryPriority > creep.militaryPriority) continue;
      max = creep;
    }
    return max;
  });
};
```

### 4.2 Rampart-Based Defense

**TooAngel fightRampart Pattern**
```javascript
Creep.prototype.fightRampart = function(target) {
  if (!target) return false;
  
  const rampart = target.findClosestRampart();
  if (rampart === null) return false;
  
  const range = target.pos.getRangeTo(rampart);
  if (range > 3) return false;  // Target too far from rampart
  
  // Mass attack if multiple targets in range
  const targets = this.pos.findInRange(FIND_HOSTILE_CREEPS, 3, {
    filter: this.room.findAttackCreeps
  });
  if (targets.length > 1) {
    this.rangedMassAttack();
  } else {
    this.rangedAttack(target);
  }
  
  // Move to rampart
  const returnCode = this.moveToMy(rampart.pos, 0);
  return returnCode === OK || returnCode === ERR_TIRED;
};
```

**Mirroar-HiveMind Guardian Pattern**
```typescript
getBestRampartToCover(creep: GuardianCreep): StructureRampart {
  const targets = creep.room.find(FIND_HOSTILE_CREEPS, {
    filter: filterEnemyCreeps
  });
  
  const ramparts: StructureRampart[] = [];
  for (const target of targets) {
    const closestRampart = _.min(
      _.filter(creep.room.myStructuresByType[STRUCTURE_RAMPART], s => {
        // Filter: Is planned rampart, not ramp position, and unoccupied
        if (!creep.room.roomPlanner.isPlannedLocation(s.pos, 'rampart')) return false;
        if (creep.room.roomPlanner.isPlannedLocation(s.pos, 'rampart.ramp')) return false;
        const occupyingCreeps = s.pos.lookFor(LOOK_CREEPS);
        if (occupyingCreeps.length > 0 && occupyingCreeps[0].id !== creep.id) return false;
        return true;
      }),
      s => s.pos.getRangeTo(target.pos)
    );
    if (!ramparts.includes(closestRampart)) ramparts.push(closestRampart);
  }
  
  // Choose rampart balancing distance to enemy and distance to creep
  return _.min(ramparts, (s: StructureRampart) => 
    s.pos.getRangeTo(creep.pos) / 2 + 
    s.pos.getRangeTo(s.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: filterEnemyCreeps}))
  );
}
```

### 4.3 Safe Mode Triggering

**TooAngel Nuke Detection**
```javascript
Room.prototype.handleNukeAttack = function() {
  const nukes = this.findNukes();
  if (nukes.length === 0) return false;
  
  // Sort by time to land
  const sorted = _.sortBy(nukes, (object) => object.timeToLand);
  
  // Activate safe mode if nuke lands soon
  if (sorted[0].timeToLand < 100) {
    this.controller.activateSafeMode();
  }
  
  // Build ramparts on all structures in blast radius
  for (const nuke of nukes) {
    const structures = nuke.pos.findInRangeBuildings(4);
    for (const structure of structures) {
      const lookStructures = structure.pos.lookFor(LOOK_STRUCTURES);
      const lookRampart = _.findIndex(lookStructures, s => s.structureType === STRUCTURE_RAMPART);
      if (lookRampart === -1) {
        structure.pos.createConstructionSite(STRUCTURE_RAMPART);
      }
    }
  }
};
```

### 4.4 Emergency Defense Response

**TooAngel Threshold-Based Defense**
```javascript
// In room defense logic (from prototype_room_defense.js)
Room.prototype.handleAttackTimer = function() {
  if (this.memory.attackTimer > 0) {
    // Spawn defenders based on attack severity
    if (this.memory.attackTimer > config.defense.defendTimerThreshold) {
      // Spawn defendmelee and defendranged creeps
      this.spawnDefenders();
    }
  }
};
```

**Mirroar-HiveMind Military Value Calculation**
```typescript
const bodyPartValues = {
  [ATTACK]: 1,
  [CARRY]: 0,
  [CLAIM]: 10,   // High value for claimers
  [HEAL]: 5,     // Healers are priority targets
  [MOVE]: 0,
  [RANGED_ATTACK]: 2,
  [TOUGH]: 0,
  [WORK]: 1
};

Creep.prototype.getMilitaryValue = function() {
  let value = 0;
  for (const part of this.body) {
    const factor = 0.1 + (0.9 * part.hits / 100);
    value += factor * (bodyPartValues[part.type] || 0);
  }
  return value;
};

Room.prototype.assertTargetPriorities = function() {
  for (const creep of this.militaryObjects.creeps) {
    const potentialDamage = this.getMilitaryAssertion(creep.pos.x, creep.pos.y, 'myDamage');
    const potentialHealing = this.getMilitaryAssertion(creep.pos.x, creep.pos.y, 'healing');
    const effectiveDamage = creep.getEffectiveDamage(potentialDamage);
    
    const neededDamageFactor = creep.hits === creep.hitsMax ? 1.1 : 1;
    if (effectiveDamage > potentialHealing * neededDamageFactor) {
      // Can kill this creep - set priority based on value and vulnerability
      creep.militaryPriority = creep.getMilitaryValue() 
        * (effectiveDamage - potentialHealing) 
        * (creep.hitsMax / creep.hits) 
        * creep.ticksToLive / CREEP_LIFE_TIME;
    }
  }
};
```

---

## 5. Body Configurations

### 5.1 Found Patterns

| Role | Body Pattern | Max Size | Key Features |
|------|-------------|----------|--------------|
| **autoattackmelee** | `MA` `[5,5]` | - | `fillTough: true` |
| **squadsiege** | `MW` | 21 parts | `fillTough: true` |
| **squadheal** | `MH` `[1,1]` | - | `fillTough: true` |
| **defender** | `MRH` | Scales `[2,1,1]` to `[4,1,1]` | Level-dependent |
| **defendmelee** | `MA` `[1,1]` | - | `fillTough: true` |
| **defendranged** | `RM` `[1,1]` | 20 | `fillTough: true` |
| **attackunreserve** | `MMMMRRHH` + `AM` | - | Boost: rangedAttack, heal |

### 5.2 Body Calculation Pattern (TooAngel)

```javascript
// From utils_creep_part.js
module.exports.getParts = function(creep) {
  const parts = [];
  const settings = roles[creep.memory.role].settings;
  
  if (settings.layoutString) {
    const layout = settings.layoutString.split('');
    const amount = settings.amount || [1, 1];
    
    for (let i = 0; i < amount[0]; i++) {
      for (const part of layout) {
        parts.push(part);
      }
    }
  }
  
  // Fill with TOUGH parts first if fillTough is set
  if (settings.fillTough) {
    const toughParts = Math.floor((MAX_CREEP_SIZE - parts.length) / 2);
    for (let i = 0; i < toughParts; i++) {
      parts.unshift(TOUGH);
      parts.unshift(MOVE);
    }
  }
  
  return parts;
};
```

### 5.3 Overmind Creep Setups

```typescript
// Combat setups with boosting
CombatSetups.zerglings = {
  default: new CreepSetup('zergling', {
    pattern: [TOUGH, MOVE, MOVE, ATTACK, ATTACK],
    sizeLimit: Infinity
  }),
  boosted_T3: new CreepSetup('zergling', {
    pattern: [TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, ATTACK, ATTACK],
    sizeLimit: Infinity
  })
};

CombatSetups.healers = {
  default: new CreepSetup('medic', {
    pattern: [MOVE, HEAL],
    sizeLimit: Infinity
  }),
  boosted_T3: new CreepSetup('medic', {
    pattern: [TOUGH, TOUGH, MOVE, MOVE, MOVE, HEAL, HEAL],
    sizeLimit: Infinity
  })
};
```

### 5.4 Boost Priorities

**Overmind SwarmDestroyer Boosts**:
- Zerglings: `[boostResources.attack[3], boostResources.tough[3], boostResources.move[3]]`
- Healers: `[boostResources.heal[3], boostResources.tough[3], boostResources.move[3]]`

---

## 6. Coordination Systems

### 6.1 Squad Membership (TooAngel)

```javascript
Creep.prototype.initializeSquadMembership = function(squadType) {
  if (this.memory.initialized) return;
  
  if (!Memory.squads) Memory.squads = {};
  if (!Memory.squads[this.memory.squad]) Memory.squads[this.memory.squad] = {};
  if (!Memory.squads[this.memory.squad][squadType]) {
    Memory.squads[this.memory.squad][squadType] = {};
  }
  
  Memory.squads[this.memory.squad][squadType][this.id] = {};
  this.memory.initialized = true;
};
```

### 6.2 Swarm Assignment (Overmind)

```typescript
makeSwarms(): void {
  this.swarms = {};
  const meleeZerg: CombatZerg[] = [...this.zerglings, ...this.healers];
  const maxPerSwarm = {[Roles.melee]: 2, [Roles.healer]: 2, [Roles.ranged]: 4};
  
  // Group creeps by swarm assignment
  const meleeZergBySwarm = _.groupBy(meleeZerg, 
    zerg => zerg.findSwarm(meleeZerg, maxPerSwarm)
  );
  
  for (const ref in meleeZergBySwarm) {
    if (ref != undefined) {
      this.swarms[ref] = new Swarm(this, ref, meleeZergBySwarm[ref], 2, 2);
    }
  }
}
```

### 6.3 Formation Position Tracking

```typescript
private getFormationPositionsFromAnchor(anchor: RoomPosition): 
  {[creepName: string]: RoomPosition} {
  const formationPositions: {[creepName: string]: RoomPosition} = {};
  
  for (let dy = 0; dy < this.formation.length; dy++) {
    for (let dx = 0; dx < this.formation[dy].length; dx++) {
      if (this.formation[dy][dx]) {
        formationPositions[this.formation[dy][dx]!.name] = 
          anchor.getOffsetPos(dx, dy);
      }
    }
  }
  
  return formationPositions;
}
```

---

## 7. Targeting Logic

### 7.1 Structure Targeting Priority

**TooAngel**:
1. Tower (highest threat)
2. Spawn (economic damage)
3. Construction sites (denial)

**Mirroar-HiveMind**:
```typescript
// Structure targeting in brawler
for (const structure of structures) {
  const option: HostileStructureTargetOption = {
    priority: encodePosition(structure.pos) === creep.memory.target ? 5 : 2,
    weight: 0,
    type: 'hostilestructure',
    object: structure
  };
  
  if (structure.structureType === STRUCTURE_SPAWN) {
    option.priority = 4;
  }
  if (structure.structureType === STRUCTURE_TOWER) {
    option.priority = 3;
  }
  
  options.push(option);
}
```

**Overmind (CombatTargeting)**:
```typescript
// Find best structure target for swarm
static findBestSwarmStructureTarget(swarm: Swarm, roomName: string, 
  padding: number, displayCostMatrix?: boolean): Structure | undefined {
  
  const room = Game.rooms[roomName];
  if (!room) return undefined;
  
  const structures = _.filter(room.hostileStructures, 
    s => s.hits > 0 && !s.isWalkable
  );
  
  // Score structures by: proximity to swarm, importance, and accessibility
  const scoredStructures = _.map(structures, structure => ({
    structure,
    score: this.scoreStructureTarget(swarm, structure, padding)
  }));
  
  return _.max(scoredStructures, s => s.score)?.structure;
}
```

### 7.2 Creep Targeting Priority

**TooAngel** (by body parts):
```javascript
const parts = [CLAIM, WORK, CARRY];
for (const part of parts) {
  const hostileCreepsWithPart = creep.pos.findClosestByRange(
    FIND_HOSTILE_CREEPS, 
    {filter: getFilterForBodyPart(part)}
  );
  if (hostileCreepsWithPart) {
    return attack(creep, hostileCreepsWithPart);
  }
}
```

**Mirroar-HiveMind** (military value):
```typescript
// Priority based on military value calculation
// CLAIM parts = 10, HEAL = 5, RANGED_ATTACK = 2, ATTACK/WORK = 1
const bodyPartValues = {
  [ATTACK]: 1,
  [CLAIM]: 10,
  [HEAL]: 5,
  [RANGED_ATTACK]: 2,
  [WORK]: 1
};
```

### 7.3 Tower Target Selection

**TooAngel**: Closest target with offset to prevent overkill
**Mirroar-HiveMind**: Highest `militaryPriority` from threat assessment

---

## 8. Retreat Logic

### 8.1 Health-Based Retreat

**TooAngel** (Multiple patterns):

```javascript
// From role_attackunreserve.js
roles.attackunreserve.preMove = function(creep) {
  if (creep.hits < 0.5 * creep.hitsMax) {
    creep.memory.routing.reverse = true;
    creep.memory.routing.reached = false;
    return false;
  }
  if (creep.hits > 0.75 * creep.hitsMax) {
    creep.memory.routing.reverse = false;
    return false;
  }
  creep.selfHeal();
};

// From prototype_creep_fight.js
function withdraw(creep) {
  if (creep.hits < 0.7 * creep.hitsMax) {
    const exitNext = creep.pos.findClosestByRange(FIND_EXIT);
    creep.moveTo(exitNext);
    return true;
  }
  return false;
}
```

**Overmind Swarm Recovery**:
```typescript
needsToRecover(recoverThreshold = 0.75, reengageThreshold = 1.0): boolean {
  let recovering: boolean;
  if (this.memory.recovering) {
    // Already recovering - check if ready to re-engage
    recovering = _.any(this.creeps, 
      creep => creep.hits < creep.hitsMax * reengageThreshold
    );
  } else {
    // Check if need to start recovering
    recovering = _.any(this.creeps, 
      creep => creep.hits < creep.hitsMax * recoverThreshold
    );
  }
  
  if (recovering && recovering != this.memory.recovering) {
    this.memory.numRetreats++;
  }
  this.memory.recovering = recovering;
  return recovering;
}

recover() {
  // Calculate retreat goals (away from enemies and towers)
  const allAvoidGoals = _.flatten(_.map(this.rooms, room => 
    GoalFinder.retreatGoalsForRoom(room).avoid
  ));
  
  const result = Movement.swarmCombatMove(this, [], allAvoidGoals);
  
  if (result == NO_ACTION) {
    // Move to safe room if no immediate threats
    const safeRoom = _.first(_.filter(this.rooms, 
      room => !room.owner || room.my
    ));
    if (safeRoom && !this.safelyInRoom(safeRoom.name)) {
      return this.goToRoom(safeRoom.name);
    }
  }
}
```

### 8.2 Flee Behavior

**TooAngel**:
```javascript
Creep.prototype.fleeFromHostile = function(hostile) {
  let direction = RoomPosition.oppositeDirection(
    this.pos.getDirectionTo(hostile)
  );
  
  if (!direction || this.pos.isBorder(-1)) {
    this.moveTo(25, 25);
    return true;
  }
  
  // Try directions with offset to find valid move
  for (let offset = 0; offset < 8; offset++) {
    const dir = RoomPosition.changeDirection(direction, offset);
    const pos = this.pos.getAdjacentPosition(dir);
    if (!pos.checkForWall() && pos.lookFor(LOOK_CREEPS).length === 0) {
      direction = dir;
      break;
    }
  }
  
  this.rangedAttack(hostile);
  this.move(direction);
};
```

**Overmind**:
```typescript
flee(target: Creep | HasPos): boolean {
  let direction = RoomPosition.oppositeDirection(
    this.pos.getDirectionTo(target)
  );
  this.rangedAttack(target as Creep);
  
  const pos = this.pos.getAdjacentPosition(direction);
  const terrain = pos.lookFor(LOOK_TERRAIN)[0];
  if (terrain === 'wall') {
    direction = _.random(1, 8) as DirectionConstant;
  }
  
  this.move(direction);
  return true;
}
```

### 8.3 Safe Zone Retreat

**Mirroar-HiveMind**:
```typescript
// Squad units retreat to spawn room when no orders
if (!creep.memory.target) {
  const spawnRoom = squad.getSpawn();
  if (!spawnRoom || creep.pos.roomName !== spawnRoom) return;
  
  // Renew if getting low on TTL
  if (creep.ticksToLive < CREEP_LIFE_TIME * 0.66) {
    const spawn = creep.pos.findClosestByRange<StructureSpawn>(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_SPAWN
    });
    if (spawn) {
      spawn.renewCreep(creep);
    }
  }
}
```

---

## 9. Implementation Patterns

### 9.1 Combat Intelligence Module

**Overmind CombatIntel**:
```typescript
class CombatIntel {
  // Calculate damage potential
  static getAttackPotential(creep: Creep): number {
    return _.sum(creep.body, part => 
      part.type === ATTACK && part.hits > 0 ? ATTACK_POWER : 0
    );
  }
  
  static getRangedAttackPotential(creep: Creep): number {
    return _.sum(creep.body, part => 
      part.type === RANGED_ATTACK && part.hits > 0 ? RANGED_ATTACK_POWER : 0
    );
  }
  
  static getHealPotential(creep: Creep): number {
    return _.sum(creep.body, part => 
      part.type === HEAL && part.hits > 0 ? HEAL_POWER : 0
    );
  }
  
  static minimumDamageMultiplierForGroup(creeps: Creep[]): number {
    // Calculate damage reduction from TOUGH parts
    return _.min(_.map(creeps, creep => {
      const toughParts = _.filter(creep.body, 
        part => part.type === TOUGH && part.hits > 0
      ).length;
      return 1 - (toughParts * 0.01 * 100 / creep.body.length);
    }));
  }
  
  static towerDamageAtPos(pos: RoomPosition): number {
    const room = Game.rooms[pos.roomName];
    if (!room) return 0;
    
    return _.sum(room.towers, tower => {
      const range = tower.pos.getRangeTo(pos);
      return TOWER_POWER_ATTACK * TOWER_FALLOFF(range);
    });
  }
}
```

### 9.2 Task-Based Combat System

**Overmind Task Attack**:
```typescript
@profile
export class TaskAttack extends Task {
  settings = {targetRange: 3};
  
  isValidTask() {
    return this.creep.getActiveBodyparts(ATTACK) > 0 
      || this.creep.getActiveBodyparts(RANGED_ATTACK) > 0;
  }
  
  isValidTarget(): boolean {
    return this.target && this.target.hits > 0;
  }
  
  work() {
    let attackReturn = 0;
    let rangedAttackReturn = 0;
    
    if (this.creep.getActiveBodyparts(ATTACK) > 0) {
      if (this.creep.pos.isNearTo(this.target)) {
        attackReturn = this.creep.attack(this.target);
      } else {
        attackReturn = this.moveToTarget(1);
      }
    }
    
    if (this.creep.pos.inRangeTo(this.target, 3) 
      && this.creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
      rangedAttackReturn = this.creep.rangedAttack(this.target);
    }
    
    return attackReturn == OK ? rangedAttackReturn : attackReturn;
  }
}
```

### 9.3 Military Manager Pattern

**Mirroar-HiveMind CombatManager**:
```typescript
export default class CombatManager {
  manageCombatActions(creep: Creep) {
    // Let military manager decide best action
    const bestTarget = this.getMostValuableTarget(creep);
    
    if (creep.getActiveBodyparts(ATTACK)) {
      this.performMeleeCombat(creep, bestTarget);
    } else if (creep.getActiveBodyparts(RANGED_ATTACK)) {
      this.performRangedCombat(creep, bestTarget);
    } else if (creep.getActiveBodyparts(HEAL)) {
      this.performHealing(creep);
    }
  }
  
  performKitingMovement(creep: Creep, target: Creep | null) {
    // Calculate safe positions
    const result = PathFinder.search(creep.pos, 
      {pos: target.pos, range: 2}, 
      {
        roomCallback: roomName => getCostMatrix(roomName, {ignoreMilitary: true}),
        flee: true,
        maxRooms: 1
      }
    );
    
    if (result.path && result.path.length > 0) {
      creep.move(creep.pos.getDirectionTo(result.path[0]));
    }
  }
}
```

### 9.4 Self-Healing Pattern

**TooAngel**:
```javascript
Creep.prototype.selfHeal = function() {
  if (!this.memory.canHeal) {
    this.memory.canHeal = this.getActiveBodyparts(HEAL) > 0;
  }
  if (this.memory.canHeal && this.isDamaged() < 1) {
    this.heal(this);
  }
};

Creep.prototype.healMyCreeps = function() {
  const myCreeps = this.room.findMyCreepsToHeal();
  if (myCreeps.length > 0) {
    this.moveTo(myCreeps[0]);
    if (this.pos.getRangeTo(myCreeps[0]) <= 1) {
      this.heal(myCreeps[0]);
    } else {
      this.rangedHeal(myCreeps[0]);
    }
    return true;
  }
  return false;
};
```

**Overmind**:
```typescript
autoHeal(allowRangedHeal = true) {
  const healTarget = CombatTargeting.findBestHealTarget(this.creep);
  if (healTarget) {
    if (this.creep.pos.isNearTo(healTarget)) {
      this.creep.heal(healTarget);
    } else if (allowRangedHeal && this.creep.pos.inRangeTo(healTarget, 3)) {
      this.creep.rangedHeal(healTarget);
      this.creep.moveTo(healTarget);
    } else {
      this.creep.moveTo(healTarget);
    }
  }
}
```

### 9.5 Formation Movement Pattern

**Overmind Swarm Movement**:
```typescript
// Coordinated swarm movement ensuring creeps don't get separated
movement.swarmMove(swarm: Swarm, destination: RoomPosition, options: SwarmMoveOptions): number {
  // Calculate path for swarm anchor
  // Ensure all creeps can reach their formation positions
  // Handle edge cases where formation can't be maintained
  // Use special cost matrix for swarm pathing
}

// Combat movement with approach/avoid goals
combatMove(approach: PathFinderGoal[], avoid: PathFinderGoal[], options: CombatMoveOptions): number {
  // Calculate best position balancing approach and avoid goals
  // Account for swarm formation constraints
  // Consider damage/healing potentials at each position
}
```

---

## 10. Key Differences Between Bots

| Aspect | TooAngel | Overmind | Mirroar-HiveMind |
|--------|----------|----------|------------------|
| **Squad Size** | 2-6 creeps | 2-4 creeps (swarms) | Flexible |
| **Coordination** | Simple waiting points | Formation-based | Order-based |
| **Targeting** | Simple priority chain | Threat-based | Weighted options |
| **Defense** | Threshold-based | Directive-based | Military assessment |
| **Retreat** | Health thresholds | Swarm recovery | Squad orders |
| **Boosting** | Minimal | Extensive (T3) | Moderate |
| **Scouting** | Basic | Integrated | NavMesh-based |

---

## 11. Best Practices Summary

### 11.1 Essential Patterns

1. **Always use TOUGH parts first** - `fillTough: true` pattern
2. **Self-heal check every tick** - Keep creeps topped off
3. **Ranged attack while fleeing** - Maximize damage output
4. **Formation before combat** - Don't fight scattered
5. **Track damage taken** - Use for retreat decisions

### 11.2 Target Selection

1. **CLAIM parts first** - Prevent spawning/reserving
2. **HEAL parts second** - Remove sustainability
3. **RANGED_ATTACK third** - Reduce incoming damage
4. **Melee last** - Less immediate threat

### 11.3 Defense Priorities

1. **Towers attack closest** - Maximum damage output
2. **Guard ramparts** - Stay safe while fighting
3. **Recycle when safe** - Don't waste idle creeps
4. **Safe mode at 100 ticks** - Before nuke lands

---

## Document Information

- **Created**: Analyzed from TooAngel, Overmind, and Mirroar-HiveMind Screeps bots
- **Files Analyzed**: 30+ military-related source files
- **Key Takeaway**: Squad coordination and intelligent targeting are the keys to effective military operations in Screeps
