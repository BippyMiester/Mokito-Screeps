# Implementation Task List - Prioritized

## Current Status: Phases 0-8 COMPLETE ✅

| Phase | Status | Completion | Notes |
|-------|--------|------------|-------|
| 0 - Emergency | ✅ COMPLETE | 100% | Emergency spawning, survival mode |
| 1 - Foundation | ✅ COMPLETE | 100% | Harvester, Runner, basic spawning |
| 2 - Stabilization | ✅ COMPLETE | 100% | Upgrader, Builder roles |
| 3 - Capacity | ✅ COMPLETE | 100% | Extension construction |
| 4 - Efficiency | ✅ COMPLETE | 100% | Stationary harvesting, containers |
| 5 - Infrastructure | ✅ COMPLETE | 100% | Road networks |
| 6 - Defense (Ramparts) | ✅ COMPLETE | 100% | Ramparts around critical structures |
| 7 - Defense (Towers) | ✅ COMPLETE | 100% | Tower construction (RCL 3+), tower AI |
| 8 - Storage | ✅ COMPLETE | 100% | Storage construction (RCL 4+), energy balancing |
| 9 - Remote Mining | ✅ COMPLETE | 100% | RemoteHarvester, Hauler, Claimer |
| 10 | 🔄 IN PROGRESS | 0% | Scout network, military squads |

**Latest Update:** 2026-04-09 - Phases 0-8 100% complete, ready for Phase 9

### Phase Trigger Conditions

| Phase | Name | Trigger Condition | RCL Required | Status |
|-------|------|-------------------|--------------|--------|
| 0 | Emergency | Harvesters < 2 | RCL 1 | ✅ COMPLETE |
| 1 | Foundation | Runners < ceil(harvesters/2) | RCL 1 | ✅ COMPLETE |
| 2 | Stabilization | Upgraders < 1 | RCL 1-2 | ✅ COMPLETE |
| 3 | Capacity | Harvesters < sourcePositions OR Builders < 1 | RCL 2 | ✅ COMPLETE |
| 4 | Efficiency | Stationary mode enabled, Containers built at sources | RCL 2+ | ✅ COMPLETE |
| 5 | Infrastructure | Roads from spawn→sources→controller | RCL 3 | ✅ COMPLETE |
| 6 | Defense | Ramparts around spawn/controller/towers | RCL 4 | ✅ COMPLETE |
| 7 | Towers | Towers built, tower defense AI active | RCL 3+ | ✅ COMPLETE |
| 8 | Storage | Storage built, energy balancing via Runners | RCL 4 | ✅ COMPLETE |
| 9 | Remote Mining | Remote rooms scouted, harvesters/haulers assigned | RCL 3+ | ✅ COMPLETE |

---

This document provides a detailed, prioritized task list for implementing the complete Mokito strategy.

## CRITICAL PATH - Phase 1-3

### Task 1.1: Basic Harvester Role ✅ COMPLETE
**Priority: CRITICAL** | **Phase: 1** | **Time: 2 hours** | **Status: DONE**

- [x] Create `src/roles/Harvester.js` with traditional delivery mode
- [x] Basic body: [WORK, CARRY, MOVE]
- [x] Assign to nearest source
- [x] State management (harvest vs deliver)
- [x] Emergency mode detection and switching

**Implementation Date:** 2026-04-09
**Files Modified:** `src/roles/Harvester.js`
**Testing:** Harvesters spawn and gather energy correctly

---

### Task 1.2: Basic Runner Role ✅ COMPLETE
**Priority: CRITICAL** | **Phase: 1** | **Time: 2 hours** | **Status: DONE**

- [x] Create `src/roles/Runner.js`
- [x] Pick up dropped energy
- [x] Deliver to spawn/extensions
- [x] Basic pathfinding
- [x] Move request system for obstacle avoidance

**Implementation Date:** 2026-04-09
**Files Modified:** `src/roles/Runner.js`
**Testing:** Runners transport energy efficiently

---

### Task 1.3: Spawn Manager Basic ✅ COMPLETE
**Priority: CRITICAL** | **Phase: 1** | **Time: 3 hours** | **Status: DONE**

- [x] Create `src/managers/SpawnManager.js`
- [x] Emergency spawning (when harvesters < 2)
- [x] Body cost calculation
- [x] Basic spawning queue
- [x] Phase-based spawning priority system
- [x] Wait for full energy logic (for maximum body parts)

**Implementation Date:** 2026-04-09
**Files Modified:** `src/managers/SpawnManager.js`
**Notes:** Console spam cleaned up - removed unnecessary logs

---

### Task 1.4: Upgrader Role ✅ COMPLETE
**Priority: CRITICAL** | **Phase: 2** | **Time: 2 hours** | **Status: DONE**

- [x] Create `src/roles/Upgrader.js`
- [x] Self-mining capability
- [x] Upgrade controller
- [x] Energy collection
- [x] Idle upgrade behavior (when no energy available)

**Implementation Date:** 2026-04-09
**Files Modified:** `src/roles/Upgrader.js`
**Testing:** Controller gains progress

---

### Task 1.5: Builder Role ✅ COMPLETE
**Priority: CRITICAL** | **Phase: 2** | **Time: 2 hours** | **Status: DONE**

- [x] Create `src/roles/Builder.js`
- [x] Build construction sites
- [x] Repair roads/containers
- [x] Idle upgrader behavior
- [x] Defense structure prioritization

**Implementation Date:** 2026-04-09
**Files Modified:** `src/roles/Builder.js`
**Testing:** Builds extensions when available

---

### Task 1.6: Extension Construction ✅ COMPLETE
**Priority: CRITICAL** | **Phase: 3** | **Time: 3 hours** | **Status: DONE**

- [x] Diamond pattern placement
- [x] Priority building at RCL 2
- [x] Maximize 5 extension positions
- [x] Automated construction planning

**Implementation Date:** 2026-04-09
**Files Modified:** `src/managers/ConstructionManager.js`
**Testing:** All 5 extensions built before RCL 3

---

## HIGH PRIORITY - Phase 4-8

### Task 2.1: Stationary Harvesting ✅ COMPLETE
**Priority: HIGH** | **Phase: 4** | **Time: 4 hours** | **Status: DONE**

**Implementation:**
- ✅ **Harvester.js** - Dual-mode system with automatic switching
  - `runTraditional()` - Deliver energy to spawn/extensions
  - `runStationary()` - Drop energy at source position
  - `getRoomMode()` - Automatic mode switching at RCL >= 2 + harvesters >= positions
  - Position assignment with obstacle avoidance
  - Move request system for blocking creeps
- ✅ **Runner.js** - Container collection optimization
  - Withdraw from containers (Priority 1)
  - Pick up dropped energy (Priority 2)
  - Storage fallback (Priority 3)
- ✅ **ConstructionManager.js** - `buildContainers()` method
  - Container placement 1-2 tiles from sources
  - Position scoring for spawn proximity

**Key Features:**
- 10 energy per tick per source (2 WORK parts)
- Zero move fatigue at source positions
- Automatic mode switching with emergency fallback
- Creep coordination for position conflicts

**Implementation Date:** 2026-04-09
**Files Modified:** `src/roles/Harvester.js`, `src/managers/ConstructionManager.js`, `src/roles/Runner.js`

---

### Task 2.2: Road Construction ✅ COMPLETE
**Priority: HIGH** | **Phase: 5** | **Time: 3 hours** | **Status: DONE**

**Implementation:**
- ✅ **ConstructionManager.js** - Road network system
  - `buildRoad()` - Pathfinding-based road construction
  - `buildEssentials()` - Prioritized road building
  - Spawn → sources (Priority 1)
  - Spawn → controller (Priority 2) - Fixed to not build on controller
  - Sources → controller (Priority 3)
  - Defensive grid around spawn (Priority 4)
- ✅ **Repairer.js** - Road maintenance
  - Repairs roads below 50% health
  - Integrated with general repair logic

**Key Features:**
- 50% move fatigue reduction on roads
- 3 roads per tick limit to prevent overwhelming builders
- Path reuses existing roads via `ignoreRoads: false`

**Implementation Date:** 2026-04-09
**Files Modified:** `src/managers/ConstructionManager.js`, `src/roles/Repairer.js`
**Testing:** Roads reduce move fatigue, paths connect key areas

---

### Task 2.3: Storage System ✅ COMPLETE
**Priority: HIGH** | **Phase: 8** | **Time: 3 hours** | **Status: DONE**

**Implementation:**
- ✅ **ConstructionManager.js** - `buildStorage()` and `placeStorageNear()`
  - Storage placement 2 tiles from spawn
  - Construction triggered at RCL 4
- ✅ **Runner.js** - Storage integration
  - Delivers to spawn/extensions first
  - Falls back to storage when full
  - Collects from storage when other sources empty
- ✅ **RoomManager.js** - Storage monitoring
  - Tracks storage levels
  - Adjusts spawning priorities based on storage state

**Key Features:**
- 1 million energy capacity
- Buffer for expensive operations
- Link preparation for Phase 9

**Implementation Date:** 2026-04-09
**Files Modified:** `src/managers/ConstructionManager.js`, `src/roles/Runner.js`, `src/managers/RoomManager.js`
**Testing:** Storage built at RCL 4, energy balancing works

---

### Task 2.4: Defense Foundation ✅ COMPLETE
**Priority: HIGH** | **Phase: 6-7** | **Time: 5 hours** | **Status: DONE**

**Implementation:**
- ✅ **ConstructionManager.js** - Defense structures
  - `buildRamparts()` - 3x3 ramparts around spawn/controller/towers
  - `buildTower()` - Tower placement at RCL 3+
  - `buildWalls()` - Exit walls at RCL 5+
- ✅ **RoomManager.js** - Defense coordination
  - `updateDefenseStatus()` - Hostile detection, attack timer (20 ticks)
  - `runTowerDefense()` - Tower AI with threat scoring
  - Threat priority: Healers > Ranged > Melee > Workers
  - Auto-repair structures when no hostiles
- ✅ **Defender.js** - Melee defense role
  - Smart target selection by threat level
  - Attack/move coordination
  - Retreat logic at <50% health
  - Rally point behavior

**Tower AI:**
- Attack: Prioritizes healers, then ranged/melee
- Repair: Structures <75% health
- Defense: Walls/ramparts <100k hits when energy >80%

**Implementation Date:** 2026-04-09
**Files Modified:** `src/managers/ConstructionManager.js`, `src/managers/RoomManager.js`, `src/roles/Defender.js`
**Testing:** Room defended against attacks, tower AI functional

---

### Task 2.5: Repairer Role ✅ COMPLETE
**Priority: HIGH** | **Phase: 8** | **Time: 2 hours** | **Status: DONE**

- [x] Create `src/roles/Repairer.js`
- [x] Repair roads, containers, ramparts
- [x] Defense priority (ramparts/walls first)
- [x] Idle upgrading when nothing to repair

**Implementation Date:** 2026-04-09
**Files Modified:** `src/roles/Repairer.js`
**Testing:** Structures maintained

---

## MEDIUM PRIORITY - Phase 9-13

### Task 3.1: Remote Mining ✅ COMPLETE
**Priority: MEDIUM** | **Phase: 9** | **Time: 6 hours** | **Status: DONE**

**Implementation:**
- ✅ **RemoteHarvester.js** - Multi-room mining
  - Travels to adjacent rooms with sources
  - Builds containers at remote sources
  - Returns to home room when energy full
  - Hostile room detection and avoidance
- ✅ **Hauler.js** - Long-distance transport
  - Collects from remote containers
  - Delivers to home room storage/spawn
  - CARRY-heavy body for efficiency
- ✅ **Claimer.js** - Room reservation and claiming
  - CLAIM part for controller reservation
  - Room claiming for expansion
- ✅ **RoomManager.js** - Remote room management
  - `scoutRemoteRooms()` - Automatic adjacent room discovery
  - `updateRemoteAssignments()` - Source/harvester/hauler tracking
  - `spawnRemoteWorkers()` - Dynamic need calculation

**Key Features:**
- Automatic room scouting every 100 ticks
- Dynamic assignment tracking
- Integration with SpawnManager for remote worker spawning

**Implementation Date:** 2026-04-09
**Files Modified:** `src/roles/RemoteHarvester.js`, `src/roles/Hauler.js`, `src/roles/Claimer.js`, `src/managers/RoomManager.js`, `src/managers/SpawnManager.js`
**Testing:** Energy flows from remote rooms, assignments tracked correctly

---

### Task 3.2: Scout Role 🔄 IN PROGRESS
**Priority: MEDIUM** | **Phase: 11** | **Time: 4 hours**

**Status:** Role exists but needs enhancement

- [x] Create `src/roles/Scout.js` - Basic implementation exists
- [ ] Enhance room exploration algorithm
- [ ] Expand intelligence gathering (store more room data)
- [ ] Hostile room identification and threat assessment

**Current Implementation:**
- Basic scout role exists
- Used for room reservation checking
- Integrated with RoomManager remote system

**Testing:** Scout visits rooms, saves data

---

### Task 3.3: Claimer Role
**Priority: MEDIUM** | **Phase: 9** | **Time: 3 hours**

- [ ] Create `src/roles/Claimer.js`
- [ ] Reserve remote controllers
- [ ] Room claiming

**Testing:** Reserve nearby rooms

---

### Task 3.4: Defender Role
**Priority: MEDIUM** | **Phase: 10** | **Time: 5 hours**

- [ ] Create `src/roles/Defender.js`
- [ ] Enemy detection
- [ ] Target prioritization
- [ ] Retreat logic

**Testing:** Spawns when enemies detected

---

### Task 3.5: Military Squad System
**Priority: MEDIUM** | **Phase: 12-13** | **Time: 8 hours**

- [ ] Create `src/roles/Attacker.js`
- [ ] Create `src/roles/Healer.js`
- [ ] Squad coordination (3+1)
- [ ] Squad formation waiting

**Testing:** Squad forms and attacks together

---

### Task 3.6: Attack Strategy
**Priority: MEDIUM** | **Phase: 12-13** | **Time: 4 hours**

- [ ] Target priority system
- [ ] Room pathing for squads
- [ ] Siege operations
- [ ] Retreat triggers

**Testing:** Successfully attack enemy rooms

---

## LOW PRIORITY - Phase 14-20

### Task 4.1: Market Trading
**Priority: LOW** | **Phase: 14** | **Time: 6 hours**

- [ ] Terminal construction
- [ ] Market orders
- [ ] Resource arbitrage

---

### Task 4.2: Creep Boosting
**Priority: LOW** | **Phase: 15** | **Time: 5 hours**

- [ ] Lab construction
- [ ] Compound production
- [ ] Boost application

---

### Task 4.3: Power Processing
**Priority: LOW** | **Phase: 16** | **Time: 8 hours**

- [ ] Power bank detection
- [ ] Power attack squads
- [ ] Power creep management

---

### Task 4.4: Inter-Shard Operations
**Priority: LOW** | **Phase: 17** | **Time: 6 hours**

- [ ] Portal detection
- [ ] Memory sync
- [ ] Cross-shard resources

---

### Task 4.5: Nuclear Capabilities
**Priority: LOW** | **Phase: 19** | **Time: 4 hours**

- [ ] Nuker construction
- [ ] Launch protocols
- [ ] Target selection

---

### Task 4.6: Full Automation
**Priority: LOW** | **Phase: 20** | **Time: Ongoing**

- [ ] Self-healing code
- [ ] Error recovery
- [ ] AI-driven decisions

---

## Implementation Timeline

**Week 1:** Tasks 1.1-1.4
**Week 2:** Tasks 1.5-2.1
**Week 3:** Tasks 2.2-2.5, 3.1
**Week 4+:** Tasks 3.2+ and beyond

---

*Created: 2026-04-09*
