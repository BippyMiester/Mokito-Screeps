# MOKITO SCREEPS BOT - STRATEGY

## Phase Overview (NEW - Updated 2026-04-18)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 1 | Harvesters | Spawn harvesters = open_spaces / 2 | 🔄 IN PROGRESS |
| 2 | Upgraders | 3 upgraders | 🔄 IN PROGRESS |
| 3 | Builders + Extensions | 3 builders, build extensions | 🔄 IN PROGRESS |
| 4 | Runners + Repairers + Stationary | 3 runners, 2 repairers, stationary harvesting | 🔄 IN PROGRESS |
| 5 | Road Network | 10+ roads | 🔄 IN PROGRESS |
| 6 | Ramparts (Room Defense) | Ramparts at exits, no openings | 🔄 IN PROGRESS |
| 7+ | COMING SOON | TBD | ⏳ NOT STARTED |

---

## Phase 1: Harvesters 🔄

**Requirements:**
- Calculate required harvesters: `Math.floor(total_open_spaces / 2)`
- Harvesters deliver energy to spawn/extensions

**Implementation:**
- Harvester.js role: Traditional delivery mode
- SpawnManager: Spawn harvesters up to required count
- ConstructionManager: Build extensions if available

---

## Phase 2: Upgraders 🔄

**Requirements:**
- Have required harvesters from Phase 1
- Spawn 3 upgraders
- Upgraders work on controller progress

---

## Phase 3: Builders + Extensions 🔄

**Requirements:**
- Have harvesters and upgraders from previous phases
- Spawn 3 builders
- Builders construct extensions

---

## Phase 4: Runners + Repairers + Stationary 🔄

**Requirements:**
- Spawn 3 runners (energy transport)
- Spawn 2 repairers
- First runner triggers stationary harvesting mode

**Implementation:**
- Runner.js: Collect dropped energy, deliver to spawn/extensions
- Repairer.js: Maintain roads and structures
- Harvester.js switches to stationary mode on Phase 4

---

## Phase 5: Road Network 🔄

**Requirements:**
- Build 10+ roads connecting key areas
- Roads: spawn→sources→controller

---

## Phase 6: Ramparts (Room Defense) 🔄

**Requirements:**
- Build ramparts 2+ spaces from room exits
- Create continuous wall with NO openings
- Protect room from enemy entry

**Implementation:**
- ConstructionManager: Calculate defensive positions
- Extend barrier lines until hitting walls
- Ensure complete coverage of all exits

---

## Phase 7+: COMING SOON ⏳

**Not yet implemented.**
Future phases may include:
- Remote mining
- Storage system
- Towers and advanced defense
- Military operations
- Market trading
- Power processing
- Nuclear capabilities

---

## Energy Management

**Reserve:** Maintain 35% energy reserve for emergencies
**Priority:** Spawn → Towers → Extensions → Storage

## Creep Limits (NEW)

| Role | Max Count | Phase |
|------|-----------|-------|
| Harvester | open_spaces / 2 | 1 |
| Upgrader | 3 | 2 |
| Builder | 3 | 3 |
| Runner | 3 | 4 |
| Repairer | 2 | 4 |

---

*Last Updated: 2026-04-18*
