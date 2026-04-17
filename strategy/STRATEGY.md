# Mokito Screeps Bot - Complete Game Strategy

## Executive Summary

This document outlines a comprehensive 20-phase strategy for dominating the Screeps game world, combining best practices from three top-tier example bots (TooAngel, Overmind, and Hivemind). The strategy progresses from basic survival to global domination through systematic base building, military expansion, resource optimization, and endgame technologies.

---

## Phase Overview Table

| Phase | Name | Focus | Key Technologies | Status |
|-------|------|-------|-------------------|-----------|
| 0 | Emergency Mode | Survive with minimal creeps | N/A | ✅ COMPLETE |
| 1 | Basic Harvesting | Establish energy flow | Harvester/Runner | ✅ COMPLETE |
| 2 | First Spawn | Stabilize room economy | Upgrader | ✅ COMPLETE |
| 3 | Extension Build | Increase energy capacity | Builder | ✅ COMPLETE |
| 4 | Stationary Harvesting | Optimize energy extraction | Container mining | ✅ COMPLETE |
| 5 | Road Networks | Movement efficiency | Construction | ✅ COMPLETE |
| 6 | Defense Foundations | Basic room protection | Ramparts, Towers | ✅ COMPLETE |
| 7 | Storage System | Buffer resources | Storage, Links | ✅ COMPLETE |
| 8 | Remote Mining 1 | Expand beyond spawn room | RemoteHarvester | ✅ COMPLETE |
| 9 | First Expansion | Multi-room control | Claimer | 🔄 IN PROGRESS |
| 10 | Military Awakening | Basic defense force | Defender | RCL 5 |
| 11 | Scout Network | Intelligence gathering | Scout | RCL 5 |
| 12 | Squad Warfare | Coordinated attacks | Attack Squads | RCL 5-6 |
| 13 | Room Conquest | Destroy enemy spawns | Siege operations | RCL 6 |
| 14 | Market Dominance | Economic warfare | Trading, Credits | RCL 6-7 |
| 15 | Advanced Military | Complex operations | Nukes, Boosts | RCL 7 |
| 16 | Power Processing | NPC strongholds | Power Creeps | RCL 8 |
| 17 | Inter-Shard Empire | Multi-shard presence | Inter-shard travel | RCL 8 |
| 18 | Global Operations | World-scale control | Mass automation | GCL 20+ |
| 19 | Nuclear Armageddon | Total destruction | Doomsday weapons | GCL 30+ |
| 20 | Eternal Empire | Self-sustaining dominance | AI optimization | Endgame |

---

## Detailed Phase Breakdown

### Phase 0: Emergency Mode (Ticks 0-100)
**Goal:** Survive until proper infrastructure can be built
**Critical Actions:**
- Spawn absolute minimum viable creeps (1-2 harvesters)
- Focus solely on gathering energy for first spawn
- Do not build anything except absolutely necessary
- Manual intervention may be required

**From TooAngel:** Has emergency spawn logic for trapped scenarios
**From Overmind:** Uses fallback bootstrap creeps
**From Hivemind:** Colony bootstrap mode with minimal creeps

---

### Phase 1: Basic Harvesting (RCL 1-2)
**Goal:** Establish sustainable energy flow
**Implement:**
- Traditional Harvester role (WORK/CARRY/MOVE)
- Harvesters deliver directly to spawn
- Spawn first Runner for transport efficiency

**Key Metrics:**
- Target: 2 harvesters per source
- Energy income > Spawn cost per tick
- Maintain 300+ energy buffer

---

### Phase 2: First Spawn (RCL 2)
**Goal:** Stabilize room economy
**Implement:**
- Upgrader role for controller progress
- Basic economic loop: Harvest → Spawn → Upgrade
- Simple body parts: [WORK, CARRY, MOVE]

**Unlocks:**
- Extensions (5 total at RCL 2)
- 550 max energy capacity

---

### Phase 3: Extension Build (RCL 2)
**Goal:** Maximize energy capacity
**Implement:**
- Builder role
- Diamond pattern extension placement around spawn
- Automated construction of all 5 extensions

**Strategic Note:**
- Extensions allow 550 energy creeps
- Essential for Phase 4 efficiency

---

### Phase 4: Stationary Harvesting (RCL 3) ✅ COMPLETE
**Goal:** Achieve maximum mining efficiency
**Status:** FULLY IMPLEMENTED

**Implementation Details:**
- **Harvester.js**: Dual-mode system with `runTraditional()` and `runStationary()`
  - Automatic mode switching via `getRoomMode()` based on RCL >= 2 and harvester count
  - Position assignment system with obstacle avoidance (`moveToHarvestPosition`)
  - Creep coordination with move requests for blocking creeps
  - Harvest and drop logic with position caching
- **Runner.js**: Optimized container collection
  - Priority 1: Withdraw from containers at sources
  - Priority 2: Pick up dropped energy from stationary harvesters
  - Move request system for obstacle avoidance
- **ConstructionManager.js**: `buildContainers()` method
  - Container placement within 1-2 tiles of sources
  - Position scoring based on distance to spawn and source

**Key Metrics:**
- 10 energy per tick per source (2 WORK parts)
- Zero move fatigue at source positions
- Container proximity: 1-2 tiles from source
- Mode trigger: RCL >= 2 AND harvesters >= total source positions

**From TooAngel:** Uses stationary sourcer roles with link/containers
**From Overmind:** HiveClusters manage stationary mining
**From Hivemind:** Bay managers handle source efficiency

---

### Phase 5: Road Networks (RCL 3) ✅ COMPLETE
**Goal:** Minimize movement costs
**Status:** FULLY IMPLEMENTED

**Implementation Details:**
- **ConstructionManager.js**: `buildEssentials()` and `buildRoad()` methods
  - Roads from spawn to sources (Priority 1)
  - Roads from spawn to controller (Priority 2)
  - Roads between sources (Priority 3)
  - Roads from sources to controller (Priority 4)
  - Defensive grid around spawn (Priority 5)
- Uses `findPathTo()` with `ignoreCreeps: true` for optimal placement
- Skips building roads on target positions (spawn, controller, etc.)
- Limits to 3 roads per tick to prevent overwhelming builders

**Key Metrics:**
- Roads reduce move fatigue by 50%
- Automated placement using pathfinding
- Integrated with ConstructionManager priority system

---

### Phase 6: Remote Mining 1 (RCL 3-4) ✅ COMPLETE
**Goal:** Expand energy extraction beyond spawn room
**Status:** FULLY IMPLEMENTED

**Implementation Details:**
- **RemoteHarvester.js**: Multi-room mining with container building
  - Travels to adjacent rooms with sources
  - Builds containers at remote sources
  - Returns to home room when energy full
  - Handles hostile room detection
- **Hauler.js**: Long-distance energy transport
  - Collects from remote containers
  - Delivers to home room storage/spawn
  - Efficient body composition (CARRY-heavy)
- **Claimer.js**: Room reservation and claiming
  - CLAIM part for controller reservation
  - Room claiming for expansion
- **SpawnManager.js**: Remote worker spawning
  - `spawnRemoteHarvester()`, `spawnHauler()`, `spawnClaimer()` methods
  - Dynamic body scaling based on available energy

**Unlocks:**
- Containers (RCL 3)
- Links (RCL 5 - prepare for this)

**From TooAngel:** Comprehensive remote mining system with reservation
**From Hivemind:** Source managers coordinate remote extraction

---

### Phase 7: Storage System (RCL 4) ✅ COMPLETE
**Goal:** Buffer resources for burst spending
**Status:** FULLY IMPLEMENTED

**Implementation Details:**
- **ConstructionManager.js**: `buildStorage()` and `placeStorageNear()` methods
  - Storage placed 2 tiles from spawn
  - Construction triggered automatically at RCL 4
- **Runner.js**: Storage integration
  - Priority delivery to spawn/extensions first
  - Fallback to storage when spawn/extensions are full
  - Collection from storage when other sources are empty
- **RoomManager.js**: Storage monitoring and utilization
  - Tracks storage levels
  - Adjusts spawning priorities based on storage state

**Link Preparation:**
- Link placement logic prepared for Phase 9
- Position calculation for spawn-storage-controller triangle

**Unlocks:**
- 1 million energy storage capacity
- Buffer for expensive operations (spawning large creeps)

**Strategic Note:**
- Links eliminate Runner need for spawn/controller
- Prioritize link placement at storage and upgrade position

---

### Phase 8: Defense Foundations (RCL 4) ✅ COMPLETE
**Goal:** Basic room protection
**Status:** FULLY IMPLEMENTED

**Implementation Details:**
- **ConstructionManager.js**: 
  - `buildRamparts()` - 3x3 ramparts around spawn, controller, towers
  - `buildTower()` - Tower construction at RCL 3+
  - `buildWalls()` - Exit wall construction at RCL 5+
- **RoomManager.js**: Defense coordination
  - `updateDefenseStatus()` - Hostile detection and attack timer
  - `runTowerDefense()` - Tower AI with threat prioritization
  - Threat scoring: Healers (100+) > Ranged (50+) > Melee (30+) > Workers (10+)
  - Auto-repair damaged structures when no hostiles present
- **Defender.js**: Melee defense role
  - `findPriorityTarget()` - Smart target selection
  - `engageTarget()` - Attack and movement coordination
  - `retreatIfPossible()` - Self-preservation at <50% health
  - Rally point behavior when no enemies

**Tower Logic:**
- Attack: Prioritizes healers, then ranged/melee attackers
- Repair: Damaged structures (<75% health)
- Defense: Walls/ramparts (<100k hits) when energy >80%

**From TooAngel:** Automatic defense with tower logic and defender spawning
**From Overmind:** Directive-based defense system
**From Hivemind:** Room defense manager

---

### Phase 9: First Expansion (RCL 4-5)
**Goal:** Multi-room control
**Implement:**
- Claimer role for room reservation
- Scout role to identify good rooms
- Second room setup with basic infrastructure

**Target Selection:**
- Adjacent rooms with 2+ sources
- Controller in open area (easy defense)
- Avoid strongholds or player territories initially

---

### Phase 10: Military Awakening (RCL 5)
**Goal:** Establish defensive capabilities
**Implement:**
- Defender role (spawned when enemies detected)
- Tower defense logic (auto-target hostile creeps)
- Basic room threat detection

**Unlocks:**
- More towers (RCL 5 = 2 towers)
- Ramparts at higher levels

---

### Phase 11: Scout Network (RCL 5)
**Goal:** Intelligence gathering
**Implement:**
- Scout role that travels room to room
- Room intelligence storage (Memory.roomIntel)
- Identification of hostile rooms, resources, enemy positions

**From TooAngel:** Comprehensive scout system with room path planning
**From Overmind:** Intel system with room assessments
**From Hivemind:** Player intel manager

---

### Phase 12: Squad Warfare (RCL 5-6)
**Goal:** Offensive military capability
**Implement:**
- Attacker role (melee combat)
- Healer role (support)
- Squad coordination system
- 4-creep squads: 3 attackers + 1 healer

**Key Mechanics:**
- Squad waits until all members spawned before attacking
- Group movement (stay together)
- Target priority: Spawn > Towers > Extensions
- Retreat logic when damaged

---

### Phase 13: Room Conquest (RCL 6)
**Goal:** Destroy enemy spawns
**Implement:**
- Siege squad tactics
- Spawn destruction as primary objective
- Room denial (prevent enemy from rebuilding)

**From TooAngel:** Squad siege operations with heal coordination
**Key:** Maximize attack parts while maintaining heal support

---

### Phase 14: Market Dominance (RCL 6-7)
**Goal:** Economic control
**Implement:**
- Terminal construction (RCL 6)
- Market trading for credits
- Resource arbitrage between rooms
- Sell excess energy, buy needed resources

**Strategic Note:**
- Credits unlock more spawnable creeps (GCL)
- Trade with other players

---

### Phase 15: Advanced Military (RCL 7)
**Goal:** Complex operations
**Implement:**
- Boosted creeps (mineral compounds)
- Lab operations
- Military body optimization
- Attack/Heal/Tough boosted squads

**From TooAngel:** Comprehensive boosting system
**Key:** Tough boosts for survivability, attack for damage

---

### Phase 16: Power Processing (RCL 8)
**Goal:** Power Creeps
**Implement:**
- Attack NPC power banks
- Power processing (RCL 8 unlocks power spawn)
- Power Creep management
- Inter-room power operations

**Unlocks:**
- Power creeps with unique abilities
- Operator, Executor, Commanders

---

### Phase 17: Inter-Shard Empire (RCL 8)
**Goal:** Multi-shard presence
**Implement:**
- Portal detection and use
- Inter-shard memory synchronization
- Shard-specific strategies
- Cross-shard resource sharing

**From Hivemind:** Inter-shard memory management

---

### Phase 18: Global Operations (GCL 20+)
**Goal:** World-scale control
**Implement:**
- Automated room claiming
- Territory expansion
- Resource network across all rooms
- Autonomous operation

**Key:** Self-sustaining empire with minimal intervention

---

### Phase 19: Nuclear Armageddon (GCL 30+)
**Goal:** Total destruction capability
**Implement:**
- Nuker construction (RCL 8)
- Nuclear launch protocols
- Mass destruction of enemy bases
- Doomsday weapons

**Strategic Note:**
- Nukes destroy all structures in 10x10 area
- Launch visible 50,000 ticks before impact
- Ultimate siege weapon

---

### Phase 20: Eternal Empire (Endgame)
**Goal:** Self-sustaining dominance
**Characteristics:**
- 30+ controlled rooms
- Full automation
- No human intervention needed
- Optimized for infinite runtime
- AI-driven decision making

---

## Implementation Priority

**Critical Path (Must Implement First):**
1. Phase 0-2: Basic survival and harvesting
2. Phase 3-5: Infrastructure and efficiency
3. Phase 8: Basic defense (room protection)

**High Priority:**
4. Phase 6-7: Remote mining and storage
5. Phase 10-11: Military basics and scouting
6. Phase 12-13: Squad warfare

**Medium Priority:**
7. Phase 9: First expansion
8. Phase 14: Market trading
9. Phase 15: Boosted creeps

**Late Game:**
10. Phase 16-20: Power creeps, nukes, inter-shard

---

## Resource Requirements by Phase

| Phase | Energy/1k Ticks | Creep Count | Complexity |
|-------|-----------------|-------------|------------|
| 0-2 | 5-10 | 3-5 | Low |
| 3-5 | 20-50 | 10-15 | Low-Med |
| 6-8 | 50-100 | 15-25 | Medium |
| 9-11 | 100-200 | 25-40 | Medium-High |
| 12-15 | 200-500 | 40-80 | High |
| 16-20 | 500+ | 100+ | Very High |

---

## Success Metrics

**Early Game (RCL 1-4):**
- GCL progress consistent
- No room decay
- Energy income > spending

**Mid Game (RCL 5-7):**
- Multi-room operation
- Military capability
- Resource surplus

**Late Game (RCL 8+):**
- Territory expansion
- Player ranking
- Global market participation

---

## Derived from Example Bots

**TooAngel Contributions:**
- Squad warfare system
- Comprehensive role set (40+ roles)
- Room planning and automation
- Power creep processing

**Overmind Contributions:**
- Colony-based architecture
- Directive-driven behavior
- Task queuing and prioritization
- Overlord management

**Hivemind Contributions:**
- Empire management
- Inter-shard operations
- Bay/source management
- Process-based architecture

---

*Last Updated: 2026-04-09*
*Strategy Version: 1.0*
