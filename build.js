#!/usr/bin/env node
/**
 * Build script for Mokito bot
 * Removes comments and excess whitespace while preserving code structure
 */

const fs = require('fs');
const path = require('path');

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

for (const file of buildOrder) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    console.error('  ! Not found: ' + file);
    continue;
  }
  
  console.log('  + ' + file);
  
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/^'use strict';\s*/m, '');
  content = content.replace(/module\.exports\s*=\s*[^;]+;/g, '');
  content = content.replace(/const\s+(\w+)\s*=\s*require\(['"][^'"]+['"]\);?/g, '');
  
  fullOutput += "\n" + content.trim() + "\n";
}

// Bootstrap
fullOutput += "\nmodule.exports.loop = function() {\n";
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

// Safe minification - only remove comments and empty lines
console.log('');
console.log('Minimizing...');

let minCode = fullOutput;

// Step 1: Protect strings by replacing with placeholders
const strings = [];
let strIdx = 0;
const stringPlaceholder = () => `__STR${strIdx++}__`;

// Protect single-quoted strings
minCode = minCode.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, (m) => {
  strings.push(m);
  return stringPlaceholder();
});

// Protect double-quoted strings  
minCode = minCode.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, (m) => {
  strings.push(m);
  return stringPlaceholder();
});

// Protect template literals
minCode = minCode.replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, (m) => {
  strings.push(m);
  return stringPlaceholder();
});

// Step 2: Remove single-line comments
minCode = minCode.replace(/\/\/.*$/gm, '');

// Step 3: Remove multi-line comments
minCode = minCode.replace(/\/\*[\s\S]*?\*\//g, '');

// Step 4: Remove empty lines and trim whitespace
const lines = minCode.split('\n');
const processedLines = [];

for (const line of lines) {
  const trimmed = line.trim();
  // Keep non-empty lines
  if (trimmed) {
    processedLines.push(trimmed);
  }
}

minCode = processedLines.join('\n');

// Step 5: Restore strings
minCode = minCode.replace(/__STR(\d+)__/g, (match, idx) => {
  return strings[parseInt(idx)];
});

// Ensure file ends with newline
if (!minCode.endsWith('\n')) {
  minCode += '\n';
}

fs.writeFileSync(MIN_OUTPUT, minCode);
console.log('✓ main.js created (minified)');
console.log('');
console.log('   main-full.js: ' + (fs.statSync(FULL_OUTPUT).size / 1024).toFixed(2) + ' KB');
console.log('   main.js:      ' + (fs.statSync(MIN_OUTPUT).size / 1024).toFixed(2) + ' KB');
console.log('   Compression:  ' + ((1 - fs.statSync(MIN_OUTPUT).size / fs.statSync(FULL_OUTPUT).size) * 100).toFixed(1) + '%');