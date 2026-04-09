# Strategy Directory

This directory contains comprehensive strategy documentation for the Mokito Screeps bot, derived from analysis of top-tier example bots.

## Files Overview

### Core Strategy Documents

- **[STRATEGY.md](./STRATEGY.md)** - Complete 20-phase game strategy
  - Early game survival (RCL 1-2)
  - Mid-game expansion (RCL 3-7)
  - Late game domination (RCL 8+)
  - Resource requirements per phase
  - Success metrics

- **[TASK_IMPLEMENTATION.md](./TASK_IMPLEMENTATION.md)** - Prioritized task list
  - 32 detailed implementation tasks
  - Ordered from critical to low priority
  - Time estimates per task
  - Dependencies clearly marked
  - Testing criteria

- **[BOT_COMPARISON.md](./BOT_COMPARISON.md)** - Example bot analysis
  - TooAngel bot deep dive
  - Overmind bot analysis
  - Hivemind (Mirroar) breakdown
  - Comparative analysis tables
  - Recommended hybrid approach

### Specialized Analysis

- **[MILITARY_ANALYSIS.md](./MILITARY_ANALYSIS.md)** - Warfare strategies
  - Squad tactics from all three bots
  - Attack/defense patterns
  - Military body configurations
  - Coordination systems

## Quick Start Guide

### For New Developers

1. Start with **STRATEGY.md** for overall game plan
2. Review **TASK_IMPLEMENTATION.md** for what to build first
3. Check **BOT_COMPARISON.md** for implementation patterns
4. Reference **MILITARY_ANALYSIS.md** for combat features

### For Implementation

**Current Phase:** 1-3 (Basic Infrastructure)

**Next Tasks:**
- Task 1.1: Basic Harvester Role
- Task 1.2: Basic Runner Role
- Task 1.3: Spawn Manager

**Status:** See top of each document for completion status

## Bot Philosophy

### Core Principles

1. **Survival First** - Ensure basic energy flow before anything else
2. **Efficiency** - Stationary harvesting, road networks, links
3. **Defense** - Always have basic protection before expansion
4. **Coordination** - Squads work together, not alone
5. **Automation** - Minimize manual intervention

### Strategic Priorities

```
Phase 1-3: Foundation (CRITICAL)
  └─ Harvest, upgrade, extend

Phase 4-8: Efficiency (HIGH)
  └─ Stationary, storage, defense

Phase 9-13: Expansion (MEDIUM)
  └─ Remote rooms, military basics

Phase 14-20: Domination (LOW)
  └─ Market, nukes, power creeps
```

## Derived from Research

### Example Bots Analyzed

- **TooAngel** - Most comprehensive, 40+ roles
- **Overmind** - Colony-based, TypeScript
- **Hivemind (Mirroar)** - Empire management, process-based

### Total Files Analyzed

- 522+ JavaScript/TypeScript files
- 3 complete bot codebases
- Military, economic, and defensive patterns

## Implementation Status

| Phase | Status | Completion |
|-------|--------|------------|
| 0-3 | In Progress | 40% |
| 4-8 | Not Started | 0% |
| 9-13 | Not Started | 0% |
| 14-20 | Not Started | 0% |

---

*Strategy documentation last updated: 2026-04-09*
*Bot version: Mokito 1.0*
