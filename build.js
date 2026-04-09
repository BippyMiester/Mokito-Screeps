#!/usr/bin/env node
/**
 * Build script for Mokito bot - Creates readable and minimized versions
 * Safe minification that preserves critical method names
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const FULL_OUTPUT = path.join(__dirname, 'main-full.js');
const MIN_OUTPUT = path.join(__dirname, 'main.js');

console.log('Building Mokito bot...');
console.log('');

const buildOrder = [
    'src/roles/Harvester.js',
    'src/roles/Runner.js',
    'src/roles/Upgrader.js',
    'src/roles/Builder.js',
    'src/roles/Repairer.js',
    'src/roles/RemoteHarvester.js',
    'src/roles/Hauler.js',
    'src/roles/Claimer.js',
    'src/roles/Defender.js',
    'src/roles/Attacker.js',
    'src/roles/Healer.js',
    'src/roles/Scout.js',
    'src/managers/SourceManager.js',
    'src/managers/MemoryManager.js',
    'src/managers/ConstructionManager.js',
    'src/managers/SpawnManager.js',
    'src/managers/RoomManager.js',
    'src/managers/CreepManager.js',
    'src/core/Mokito.js'
    // Note: src/main.js is handled separately
];

let fullOutput = "'use strict';\n\n";
fullOutput += "// ============================================\n";
fullOutput += "// Mokito Bot - Full Readable Build\n";
fullOutput += "// Built: " + new Date().toISOString() + "\n";
fullOutput += "// ============================================\n\n";

for (const file of buildOrder) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
        console.error('  ! Not found: ' + file);
        continue;
    }
    
    const relativePath = path.relative(SRC_DIR, filePath);
    console.log('  + ' + relativePath);
    
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/^'use strict';\s*/m, '');
    content = content.replace(/module\.exports\s*=\s*[^;]+;/g, '');
    content = content.replace(/const\s+(\w+)\s*=\s*require\(['"][^'"]+['"]\);?/g, '');
    
    fullOutput += "\n// --- " + path.basename(file) + " ---\n";
    fullOutput += content.trim() + "\n";
}

// Bootstrap - single entry point
fullOutput += "\n// --- Bootstrap ---\n";
fullOutput += "module.exports.loop = function() {\n";
fullOutput += "    if (!global.MokitoInstance) {\n";
fullOutput += "        global.MokitoInstance = new Mokito();\n";
fullOutput += "        console.log('*** Greetings from Mokito! ***');\n";
fullOutput += "        console.log('Current Game Tick:', Game.time);\n";
fullOutput += "    }\n";
fullOutput += "    global.MokitoInstance.run();\n";
fullOutput += "};\n";

fs.writeFileSync(FULL_OUTPUT, fullOutput);
console.log('');
console.log('✓ main-full.js created');

// Create minimized version
console.log('');
console.log('Minimizing...');

let minCode = fullOutput;

// Remove comments
minCode = minCode.replace(/\/\/.*$/gm, '');
minCode = minCode.replace(/\/\*[\s\S]*?\*\//g, '');

// Class name mapping
const classMap = {
    'Harvester': 'H',
    'Runner': 'R',
    'Upgrader': 'U',
    'Builder': 'B',
    'Repairer': 'Rp',
    'RemoteHarvester': 'RH',
    'Hauler': 'Ha',
    'Claimer': 'C',
    'Defender': 'D',
    'Attacker': 'A',
    'Healer': 'He',
    'Scout': 'S',
    'SpawnManager': 'SM',
    'CreepManager': 'CM',
    'RoomManager': 'RM',
    'ConstructionManager': 'CoM',
    'MemoryManager': 'MeM',
    'SourceManager': 'SoM',
    'Mokito': 'M'
};

// Replace class names
for (const [oldName, newName] of Object.entries(classMap)) {
    const classDeclRegex = new RegExp('class\\s+' + oldName + '\\s*\\{', 'g');
    minCode = minCode.replace(classDeclRegex, 'class ' + newName + ' {');
    
    const newInstanceRegex = new RegExp('new\\s+' + oldName + '\\s*\\(', 'g');
    minCode = minCode.replace(newInstanceRegex, 'new ' + newName + '(');
}

// Property shortening
const propMap = {
    'memory': 'mem',
    'room': 'rm',
    'pos': 'p',
    'controller': 'ctrl',
    'spawn': 'sp',
    'spawning': 'spg',
    'energyAvailable': 'ea',
    'energyCapacityAvailable': 'eca',
    'store': 'st',
    'hits': 'h',
    'hitsMax': 'hm',
    'sourceId': 'sid',
    'targetRoom': 'tr',
    'homeRoom': 'hr',
    'squadId': 'sqid',
    'containerId': 'cid'
};

for (const [oldName, newName] of Object.entries(propMap)) {
    minCode = minCode.replace(new RegExp('\\.' + oldName + '\\b', 'g'), '.' + newName);
}

// Remove whitespace
minCode = minCode.replace(/\n\s*/g, '\n');
minCode = minCode.replace(/\s+/g, ' ');
minCode = minCode.replace(/;\s*}/g, ';}');
minCode = minCode.replace(/{\s*/g, '{');
minCode = minCode.replace(/}\s*/g, '}');
minCode = minCode.replace(/,\s*/g, ',');
minCode = minCode.replace(/;\s*/g, ';');

// Remove spaces around operators
minCode = minCode.replace(/\s*=\s*/g, '=');
minCode = minCode.replace(/\s*===\s*/g, '===');
minCode = minCode.replace(/\s*!==\s*/g, '!==');
minCode = minCode.replace(/\s*\|\|\s*/g, '||');
minCode = minCode.replace(/\s*\u0026\u0026\s*/g, '&&');

// Remove console logs
minCode = minCode.replace(/console\.log\([^)]*\);/g, '');

// Clean up
minCode = minCode.replace(/;+/g, ';');
minCode = minCode.replace(/'use strict';'use strict';/g, "'use strict';");
minCode = minCode.replace(/;\s*$/g, '');

// Ensure bootstrap is correct
if (!minCode.includes('global.MokitoInstance.run()')) {
    minCode = minCode.replace(/global\.M\.run\(\)/g, 'global.MokitoInstance.run()');
}

fs.writeFileSync(MIN_OUTPUT, minCode);
console.log('✓ main.js created (minimized)');

console.log('');
console.log('Build complete!');
console.log('');
console.log('   main-full.js: ' + (fs.statSync(FULL_OUTPUT).size / 1024).toFixed(2) + ' KB');
console.log('   main.js:      ' + (fs.statSync(MIN_OUTPUT).size / 1024).toFixed(2) + ' KB');
console.log('   Compression:  ' + ((1 - fs.statSync(MIN_OUTPUT).size / fs.statSync(FULL_OUTPUT).size) * 100).toFixed(1) + '%');