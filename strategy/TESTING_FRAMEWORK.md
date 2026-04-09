# Testing Framework Documentation

## Overview

This document outlines the comprehensive testing strategy for the Mokito Screeps bot. Since Screeps runs in a unique environment (game simulation), traditional testing approaches need adaptation.

## Testing Philosophy

### Why Test?
- Screeps code runs in a persistent game world
- Bugs can cause permanent damage (lost resources, dead creeps)
- Early detection prevents costly in-game mistakes
- Refactoring needs confidence that nothing breaks

### Testing Challenges
- No traditional DOM or Node.js environment
- Game state is persistent and shared
- Creep behavior depends on room state
- Timing and tick-based execution

## Testing Strategy

### 1. Static Analysis (Immediate Implementation)

**ESLint Configuration**
```javascript
// .eslintrc.js
module.exports = {
  env: {
    es6: true,
    node: true,
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 2020,
  },
  globals: {
    // Screeps game objects
    Game: 'readonly',
    Memory: 'writable',
    PathFinder: 'readonly',
    // Room objects
    FIND_SOURCES: 'readonly',
    FIND_MY_CREEPS: 'readonly',
    // ... etc
  },
  rules: {
    'no-console': ['warn', { allow: ['log'] }],
    'no-unused-vars': 'error',
    'no-undef': 'error',
  },
};
```

**Purpose:** Catch syntax errors, undefined variables, unused code
**When to Run:** On every commit, before build

### 2. Unit Tests (Future Implementation)

**Mocking the Screeps Environment**
```javascript
// test/mocks/screeps-mock.js

// Mock Game object
global.Game = {
  time: 0,
  creeps: {},
  rooms: {},
  spawns: {},
  cpu: {
    getUsed: () => 0,
    tickLimit: 20,
  },
};

// Mock Memory
global.Memory = {
  creeps: {},
  rooms: {},
};

// Mock constants
global.FIND_SOURCES = 105;
global.WORK = 'work';
global.MOVE = 'move';
// ... etc
```

**Example Unit Test**
```javascript
// test/roles/Harvester.test.js

describe('Harvester', () => {
  beforeEach(() => {
    // Reset mocks
    Game.creeps = {};
    Memory.creeps = {};
  });

  test('should switch to delivering when full', () => {
    const creep = {
      memory: { delivering: false },
      store: { 
        getFreeCapacity: () => 0,
        [RESOURCE_ENERGY]: 50 
      },
      say: jest.fn(),
    };
    
    const harvester = new Harvester();
    harvester.run(creep);
    
    expect(creep.memory.delivering).toBe(true);
  });
});
```

**Libraries Needed:**
- Jest (test runner)
- screeps-server-mock (official mock)
- @types/screeps (TypeScript definitions)

**When to Run:** Before major refactors, on PRs

### 3. Integration Tests (Advanced)

**Private Server Testing**
```javascript
// test/integration/spawn.test.js

describe('Spawn Integration', () => {
  test('should spawn first harvester', async () => {
    // Start private server
    const server = new ScreepsServer();
    await server.start();
    
    // Upload code
    await server.upload('main.js', compiledCode);
    
    // Run ticks
    for (let i = 0; i < 10; i++) {
      await server.tick();
    }
    
    // Check spawn
    const creeps = server.getCreeps();
    expect(creeps.length).toBeGreaterThan(0);
    expect(creeps[0].name).toMatch(/Harvester/);
  });
});
```

**Tools:**
- screeps-server (official test server)
- Docker container for isolation
- GitHub Actions for CI

**When to Run:** Before releases, on PRs to master

### 4. Performance Tests (Critical)

**CPU Usage Monitoring**
```javascript
// Automated CPU check
if (Game.cpu.getUsed() > Game.cpu.tickLimit * 0.8) {
  console.log('WARNING: High CPU usage');
  // Alert system
}
```

**Benchmarks:**
- Creep behavior tick time
- Pathfinding efficiency
- Memory serialization cost

**When to Run:** Continuously in production, alerts on thresholds

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linter
      run: npm run lint
    
    - name: Run unit tests
      run: npm test
    
    - name: Build
      run: npm run build
    
    - name: Upload build artifact
      uses: actions/upload-artifact@v2
      with:
        name: main.js
        path: main.js
```

### Deployment Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [ master ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Deploy to Screeps
      run: npm run deploy
      env:
        SCREEPS_EMAIL: ${{ secrets.SCREEPS_EMAIL }}
        SCREEPS_PASSWORD: ${{ secrets.SCREEPS_PASSWORD }}
```

## Testing Roadmap

### Phase 1: Static Analysis (Immediate)
- [ ] Install ESLint
- [ ] Configure .eslintrc.js
- [ ] Fix existing linting errors
- [ ] Add pre-commit hook

### Phase 2: Unit Tests (Week 1-2)
- [ ] Install Jest
- [ ] Create Screeps mocks
- [ ] Write tests for core roles
- [ ] Write tests for managers
- [ ] Achieve 70% coverage

### Phase 3: Integration Tests (Week 3-4)
- [ ] Set up screeps-server
- [ ] Create Docker container
- [ ] Write spawn tests
- [ ] Write room operation tests
- [ ] CI pipeline integration

### Phase 4: Performance (Ongoing)
- [ ] CPU profiling
- [ ] Memory leak detection
- [ ] Performance regression alerts
- [ ] Load testing

## Testing Best Practices

### 1. Test Organization
```
test/
├── unit/
│   ├── roles/
│   │   ├── Harvester.test.js
│   │   ├── Builder.test.js
│   │   └── ...
│   ├── managers/
│   │   ├── SpawnManager.test.js
│   │   └── ...
│   └── mocks/
│       └── screeps-mock.js
├── integration/
│   ├── spawn.test.js
│   ├── room.test.js
│   └── setup.js
└── performance/
    └── cpu-benchmark.test.js
```

### 2. Mocking Guidelines

**Good Mock:**
```javascript
const mockCreep = {
  name: 'Harvester1',
  memory: { role: 'harvester' },
  store: {
    getUsedCapacity: () => 50,
    getFreeCapacity: () => 0,
  },
  pos: { x: 25, y: 25, roomName: 'W1N1' },
  // Only mock what you need
};
```

**Bad Mock:**
```javascript
const mockCreep = Game.creeps['Harvester1']; // Don't use real Game
```

### 3. Test Naming
```javascript
// Good
'should switch to delivering when full'
'should spawn harvester when count < 2'
'should build extensions in diamond pattern'

// Bad
'test1'
'harvester test'
'check if works'
```

### 4. Coverage Goals

| Component | Target Coverage |
|-----------|----------------|
| Roles | 80% |
| Managers | 70% |
| Core | 60% |
| Overall | 70% |

## Manual Testing Checklist

Before any deployment:

- [ ] Bot compiles without errors
- [ ] No console spam
- [ ] Heartbeat displays correctly
- [ ] Emergency spawning works (harvesters < 2)
- [ ] Energy flow is positive
- [ ] Creeps don't get stuck
- [ ] Memory usage is reasonable
- [ ] CPU usage under threshold

## Production Monitoring

### Automated Checks
- CPU usage every 100 ticks
- Memory leak detection
- Creep count vs expected
- Energy income tracking

### Alerts
- Slack webhook for critical errors
- Email for CPU limit exceeded
- Dashboard for performance metrics

## Cost/Benefit Analysis

**Testing Investment:**
- Setup: 2-3 days
- Ongoing maintenance: 1 hour/week
- CI/CD: 1 day setup

**Benefits:**
- Catch bugs before they cost in-game resources
- Safe refactoring
- Team confidence
- Documentation via tests

**ROI:**
- One major bug prevented = weeks of saved resources
- Refactoring speed improved by 3x
- Onboarding new devs easier

## Conclusion

Testing in Screeps is challenging but essential. Start with static analysis, add unit tests for critical paths, and build toward integration testing. The investment pays off in code quality and game performance.

---

*Next Steps: Implement Phase 1 (ESLint + Static Analysis)*
