# Bot Comparison Analysis

## Overview

Analysis of three top-tier Screeps example bots to extract best practices and implementation patterns.

---

## TooAngel Bot

### Architecture
- **Style:** Monolithic with many specialized roles
- **Brain System:** Centralized brain modules manage high-level decisions
- **Role Count:** 40+ specialized creep roles
- **Prototype Extensions:** Heavy use of prototype modifications

### Key Strengths

#### 1. Squad System (brain_squadmanager.js)
```javascript
// Squad composition: 1 siege + 3 heal
const siegeSpawns = [
  { creeps: 1, role: 'squadsiege' },
  { creeps: 3, role: 'squadheal' }
];
```
- Coordinated group attacks
- Wait until all members ready before attack
- Siege + healer combo for room destruction

#### 2. Room Planning (brain_nextroom.js)
- Automatic room selection
- Exit analysis
- Source count optimization
- Distance calculation from existing rooms

#### 3. Defense System
```javascript
// From role_defendmelee.js
const hostile = creep.findClosestEnemy();
if (hostile) {
  const search = PathFinder.search(creep.pos, hostile.pos);
  creep.move(direction);
  creep.attack(hostile);
}
```
- Automatic defense creep spawning
- Target prioritization
- Ranged and melee defense roles

#### 4. Power Processing
- NPC stronghold attack squads
- Power bank detection and harvesting
- Power creep management

#### 5. Market Integration
- Automatic market order creation
- Resource arbitrage
- Terminal usage optimization

### Implementation Patterns

**Role Pattern:**
```javascript
roles.rolename = {
  settings: {
    layoutString: 'MA', // M=MOVE, A=ATTACK, etc
    amount: [1, 1],   // [min, max]
    fillTough: true,
  },
  action: function(creep) {
    // Role logic
  }
};
```

**Memory Management:**
- Global Memory.squads for squad tracking
- Memory.rooms[roomName].queue for spawn queue
- Centralized memory preparation

### Weaknesses
- High complexity
- Many dependencies between modules
- Heavy prototype modification

---

## Overmind Bot

### Architecture
- **Style:** Colony-based task management
- **System:** Overlords manage specific tasks
- **Directives:** Task-oriented behavior system
- **Colonies:** Each room is a semi-autonomous colony

### Key Strengths

#### 1. Colony System (Colony.ts)
```typescript
class Colony {
  room: Room;
  overseer: Overseer;
  creeps: Creep[];
  
  run(): void {
    // Colony-level logic
  }
}
```
- Semi-autonomous room management
- Self-contained operations
- Easy to scale across rooms

#### 2. Overlord Pattern
```typescript
abstract class Overlord {
  colony: Colony;
  priority: number;
  
  abstract run(): void;
  abstract buildCreepBody(): BodyPartConstant[];
}
```
- Task-specific managers
- Priority-based execution
- Modular and extensible

#### 3. Directive System
- Task-oriented directives
- Behavior composition
- Easy to add new behaviors

#### 4. Reinforcement Learning
- Experimental learning system
- Automatic parameter optimization
- Performance tracking

#### 5. Intel System
```typescript
class Intel {
  static room(roomName: string): RoomIntel {
    // Cached room intelligence
  }
}
```
- Cached room information
- Efficient data storage
- Quick lookups

### Implementation Patterns

**Task Queue:**
```typescript
interface Task {
  name: string;
  priority: number;
  execute(): void;
}
```

**Creep Setup:**
```typescript
const setups = {
  worker: new CreepSetup('worker', {
    pattern: [WORK, CARRY, MOVE],
    patternLimit: 5,
  }),
};
```

### Weaknesses
- Learning curve
- TypeScript overhead
- Less pre-built military features

---

## Hivemind (Mirroar) Bot

### Architecture
- **Style:** Empire management with processes
- **System:** Process-based execution
- **Managers:** Specialized managers per system
- **Empire:** Multi-room coordination

### Key Strengths

#### 1. Process System
```typescript
abstract class Process {
  abstract run(): void;
  abstract getPriority(): number;
}
```
- Priority-based process execution
- Modular process structure
- Easy to add new processes

#### 2. Bay System (manager.bay.ts)
```typescript
interface Bay {
  sources: Source[];
  creeps: Creep[];
  containers: Container[];
}
```
- Groups sources with associated infrastructure
- Localized management
- Efficient resource distribution

#### 3. Military Manager (manager.military.ts)
```typescript
class MilitaryManager {
  squads: Squad[];
  
  requestSquad(targetRoom: string): void {
    // Squad creation logic
  }
}
```
- Centralized military coordination
- Squad management
- Attack planning

#### 4. Squad System (manager.squad.ts)
```typescript
class Squad {
  members: Creep[];
  formation: Formation;
  
  moveTo(target: RoomPosition): void {
    // Formation movement
  }
}
```
- Formation-based movement
- Coordinated attacks
- Position-based roles

#### 5. Inter-Shard Support
- Multi-shard memory synchronization
- Cross-shard operations
- Portal usage optimization

### Implementation Patterns

**Manager Pattern:**
```typescript
class Manager {
  private rooms: Room[];
  
  constructor(empire: Empire) {
    this.rooms = empire.rooms;
  }
  
  run(): void {
    // Management logic
  }
}
```

**Operation Pattern:**
```typescript
abstract class Operation {
  targetRoom: string;
  
  abstract execute(): void;
}
```

### Weaknesses
- Complex process management
- Overhead from abstraction layers
- Documentation gaps

---

## Comparative Analysis

### Spawn Management

| Feature | TooAngel | Overmind | Hivemind |
|---------|----------|----------|----------|
| Queue System | Centralized array | Per-colony | Per-room |
| Body Calculation | layoutString | CreepSetup | Template-based |
| Priority | Role-based | Task-based | Process-based |

**Best Practice:** Hybrid approach with layoutString for bodies and priority-based spawning

---

### Military System

| Feature | TooAngel | Overmind | Hivemind |
|---------|----------|----------|----------|
| Squads | Siege+Heal | Task groups | Formation-based |
| Coordination | Memory.squads | Overlords | Squad manager |
| Attack Logic | Priority-based | Directive-based | Operations |
| Defense | Automatic | Directive | Process-based |

**Best Practice:** TooAngel's squad system + Hivemind's formation movement

---

### Resource Management

| Feature | TooAngel | Overmind | Hivemind |
|---------|----------|----------|----------|
| Storage | Centralized | Colony-based | Bay-localized |
| Links | Yes | Yes | Yes |
| Terminals | Market integrated | Colony-based | Empire-wide |
| Remote Mining | Yes | Yes | Yes |

**Best Practice:** Colony-based with bay-localized efficiency

---

### Code Organization

| Aspect | TooAngel | Overmind | Hivemind |
|--------|----------|----------|----------|
| Language | JavaScript | TypeScript | TypeScript |
| Structure | Role-focused | Colony-focused | Manager-focused |
| Extensibility | Moderate | High | High |
| Learning Curve | Steep | Moderate | Steep |

---

## Recommended Hybrid Approach

### Architecture
1. **Colony-based** (from Overmind) - Each room semi-autonomous
2. **Manager system** (from Hivemind) - Specialized managers per system
3. **Role-based creeps** (from TooAngel) - Many specific roles

### Military
1. **Squad coordination** (from TooAngel) - Wait for full squad
2. **Formation movement** (from Hivemind) - Position-based
3. **Target priority** (from TooAngel) - Spawn first

### Economy
1. **Stationary mining** (from TooAngel) - Maximum efficiency
2. **Bay system** (from Hivemind) - Localized resource management
3. **Queue-based spawning** (from TooAngel) - Centralized spawn queue

### Defense
1. **Threat detection** (from TooAngel) - Automatic enemy detection
2. **Tower logic** (from TooAngel) - Priority targeting
3. **Defender roles** (from TooAngel) - Multiple defense types

---

## Code Patterns to Adopt

### From TooAngel:
```javascript
// Role configuration
role.settings = {
  layoutString: 'MA',
  amount: [1, 1],
  fillTough: true,
};

// Squad coordination
Memory.squads[squadId] = {
  action: 'move',
  members: { attackers: [], healers: [] },
};
```

### From Overmind:
```typescript
// Colony encapsulation
class Colony {
  run(): void {
    this.overseer.run();
  }
}

// Task priority
interface Task {
  priority: number;
  execute(): void;
}
```

### From Hivemind:
```typescript
// Process priority
abstract class Process {
  abstract getPriority(): number;
}

// Squad movement
class Squad {
  moveInFormation(target: RoomPosition): void;
}
```

---

## Implementation Priority

**Immediate (Phase 1-3):**
- TooAngel's role system
- Overmind's colony concept
- Basic spawn queue

**Short-term (Phase 4-8):**
- Stationary mining (TooAngel)
- Bay concept (Hivemind)
- Defense roles (TooAngel)

**Medium-term (Phase 9-13):**
- Squad system (TooAngel)
- Formation movement (Hivemind)
- Military manager (Hivemind)

**Long-term (Phase 14+):**
- Market integration (TooAngel)
- Inter-shard (Hivemind)
- Reinforcement learning (Overmind)

---

*Analysis complete - 2026-04-09*
