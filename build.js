#!/usr/bin/env node
/**
 * Build script for Mokito bot - Safe minimization
 * ONLY removes comments and extra whitespace, preserves ALL code
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

// Create minimized version - simplest possible approach
console.log('');
console.log('Minimizing...');

let minCode = fullOutput;

// Simple minification: remove comments and extra whitespace
// Keep all other code exactly as-is

// First, protect strings
const strings = [];
let strIdx = 0;

function protectStrings(code) {
    // Match single quotes, double quotes, and template literals
    const regex = /(['"`])((?:\1|[^\1\\]|\\.)*?)\1/g;
    return code.replace(regex, (match) => {
        const placeholder = `__STR_${strIdx}_`;
        strings[strIdx] = match;
        strIdx++;
        return placeholder;
    });
}

function restoreStrings(code) {
    return code.replace(/__STR_(\d+)_/g, (match, idx) => {
        return strings[parseInt(idx)];
    });
}

// Protect strings
minCode = protectStrings(minCode);

// Remove // comments
minCode = minCode.replace(/\/\/.*$/gm, '');
// Remove /* */ comments
minCode = minCode.replace(/\/\*[\s\S]*?\*\//g, '');

// Collapse multiple whitespace to single space (but preserve structure)
minCode = minCode.replace(/[ \t]+/g, ' ');
// Remove whitespace at line starts
minCode = minCode.replace(/^[ \t]+/gm, '');
// Remove empty lines
minCode = minCode.replace(/\n+/g, '\n');

// Restore strings
minCode = restoreStrings(minCode);

// Final cleanup
minCode = minCode.trim();
if (!minCode.endsWith('\n')) {
    minCode += '\n';
}

fs.writeFileSync(MIN_OUTPUT, minCode);
console.log('✓ main.js created (minimized)');

console.log('');
console.log('Build complete!');
console.log('');
console.log('   main-full.js: ' + (fs.statSync(FULL_OUTPUT).size / 1024).toFixed(2) + ' KB');
console.log('   main.js:      ' + (fs.statSync(MIN_OUTPUT).size / 1024).toFixed(2) + ' KB');
console.log('   Compression:  ' + ((1 - fs.statSync(MIN_OUTPUT).size / fs.statSync(FULL_OUTPUT).size) * 100).toFixed(1) + '%');
console.log('');
console.log('Note: Screeps API names are preserved');