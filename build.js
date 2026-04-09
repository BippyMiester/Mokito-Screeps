#!/usr/bin/env node
/**
 * Build script for Mokito bot - Proper minification
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

// Minification
console.log('');
console.log('Minimizing...');

let code = fullOutput;

// Protect strings
const strings = [];
let strCount = 0;

function saveString(str) {
  const idx = strCount++;
  strings[idx] = str;
  return `__STR_${idx}__`;
}

// Protect strings (single, double, template)
code = code.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, saveString);
code = code.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, saveString);
code = code.replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, saveString);

// Remove // comments
code = code.replace(/\/\/.*$/gm, '');

// Remove /* */ comments  
code = code.replace(/\/\*[\s\S]*?\*\//g, '');

// Split into lines and process
let lines = code.split('\n');
let result = [];

for (let line of lines) {
  // Trim whitespace
  line = line.trim();
  // Skip empty lines
  if (line) {
    result.push(line);
  }
}

code = result.join('\n');

// Restore strings
code = code.replace(/__STR_(\d+)__/g, (match, idx) => {
  return strings[parseInt(idx)];
});

// Ensure newline at end
if (!code.endsWith('\n')) {
  code += '\n';
}

fs.writeFileSync(MIN_OUTPUT, code);

console.log('✓ main.js created (minified)');
console.log('');

// Verify with ls -la
console.log('File sizes:');
const { execSync } = require('child_process');
const output = execSync('ls -la main*.js', { cwd: __dirname, encoding: 'utf8' });
console.log(output);