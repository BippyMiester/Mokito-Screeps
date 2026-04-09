# Implementation Task List - Prioritized

This document provides a detailed, prioritized task list for implementing the complete Mokito strategy.

## CRITICAL PATH - Phase 1-3

### Task 1.1: Basic Harvester Role
**Priority: CRITICAL** | **Phase: 1** | **Time: 2 hours**

- [ ] Create `src/roles/Harvester.js` with traditional delivery mode
- [ ] Basic body: [WORK, CARRY, MOVE]
- [ ] Assign to nearest source
- [ ] State management (harvest vs deliver)

**Testing:** Spawn 2 harvesters, verify energy gathering

---

### Task 1.2: Basic Runner Role  
**Priority: CRITICAL** | **Phase: 1** | **Time: 2 hours**

- [ ] Create `src/roles/Runner.js`
- [ ] Pick up dropped energy
- [ ] Deliver to spawn/extensions
- [ ] Basic pathfinding

**Testing:** Verify energy transport

---

### Task 1.3: Spawn Manager Basic
**Priority: CRITICAL** | **Phase: 1** | **Time: 3 hours**

- [ ] Create `src/managers/SpawnManager.js`
- [ ] Emergency spawning (when harvesters < 2)
- [ ] Body cost calculation
- [ ] Basic spawning queue

**Testing:** Auto-spawn harvesters when needed

---

### Task 1.4: Upgrader Role
**Priority: CRITICAL** | **Phase: 2** | **Time: 2 hours**

- [ ] Create `src/roles/Upgrader.js`
- [ ] Self-mining capability
- [ ] Upgrade controller
- [ ] Energy collection

**Testing:** Controller gains progress

---

### Task 1.5: Builder Role
**Priority: CRITICAL** | **Phase: 2** | **Time: 2 hours**

- [ ] Create `src/roles/Builder.js`
- [ ] Build construction sites
- [ ] Repair roads/containers
- [ ] Idle upgrader behavior

**Testing:** Builds extensions when available

---

### Task 1.6: Extension Construction
**Priority: CRITICAL** | **Phase: 3** | **Time: 3 hours**

- [ ] Diamond pattern placement
- [ ] Priority building at RCL 2
- [ ] Maximize 5 extension positions

**Testing:** All 5 extensions built before RCL 3

---

## HIGH PRIORITY - Phase 4-8

### Task 2.1: Stationary Harvesting
**Priority: HIGH** | **Phase: 4** | **Time: 4 hours**

- [ ] Stationary mode for harvesters
- [ ] Container construction at sources
- [ ] Drop energy instead of deliver
- [ ] Room mode switching

**Testing:** Harvesters stay at sources

---

### Task 2.2: Road Construction
**Priority: HIGH** | **Phase: 5** | **Time: 3 hours**

- [ ] Spawn → sources roads
- [ ] Spawn → controller roads
- [ ] Road maintenance

**Testing:** Reduced move fatigue

---

### Task 2.3: Storage System
**Priority: HIGH** | **Phase: 7** | **Time: 3 hours**

- [ ] Storage construction (RCL 4)
- [ ] Link placement preparation
- [ ] Energy balancing

**Testing:** Storage fills and buffers energy

---

### Task 2.4: Defense Foundation
**Priority: HIGH** | **Phase: 8** | **Time: 5 hours**

- [ ] Rampart construction
- [ ] First tower construction
- [ ] Tower defense logic
- [ ] Threat detection

**Testing:** Room defended against attacks

---

### Task 2.5: Repairer Role
**Priority: HIGH** | **Phase: 8** | **Time: 2 hours**

- [ ] Create `src/roles/Repairer.js`
- [ ] Repair roads, containers, ramparts
- [ ] Defense priority
- [ ] Idle upgrading

**Testing:** Structures maintained

---

## MEDIUM PRIORITY - Phase 9-13

### Task 3.1: Scout Role
**Priority: MEDIUM** | **Phase: 11** | **Time: 4 hours**

- [ ] Create `src/roles/Scout.js`
- [ ] Room exploration algorithm
- [ ] Intelligence gathering
- [ ] Hostile room identification

**Testing:** Scout visits rooms, saves data

---

### Task 3.2: Remote Mining
**Priority: MEDIUM** | **Phase: 6, 9** | **Time: 6 hours**

- [ ] Create `src/roles/RemoteHarvester.js`
- [ ] Travel to adjacent rooms
- [ ] Build containers remotely
- [ ] Create `src/roles/Hauler.js`

**Testing:** Energy flows from remote rooms

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
