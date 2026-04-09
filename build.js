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

// Minification - collapse to single line
console.log('');
console.log('Minimizing...');

let code = fullOutput;

// Step 1: Protect all strings by replacing with placeholders
const strings = [];
let strIdx = 0;
const placeholder = () => `__S${strIdx++}__`;

// Protect template literals first (they can contain newlines)
code = code.replace(/`[^`]*`/g, (match) => {
  strings.push(match);
  return placeholder();
});

// Protect single-quoted strings
code = code.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, (match) => {
  strings.push(match);
  return placeholder();
});

// Protect double-quoted strings
code = code.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, (match) => {
  strings.push(match);
  return placeholder();
});

// Step 2: Remove comments
code = code.replace(/\/\/.*$/gm, '');
code = code.replace(/\/\*[\s\S]*?\*\//g, '');

// Step 3: Replace all whitespace with single spaces
code = code.replace(/\s+/g, ' ');

// Step 4: Remove spaces around operators and punctuation where safe
code = code.replace(/\s*([{}();,?:+\-*/%=<>!&|])\s*/g, '$1');
code = code.replace(/\s*===\s*/g, '===');
code = code.replace(/\s*!==\s*/g, '!==');
code = code.replace(/\s*&&\s*/g, '&&');
code = code.replace(/\s*\|\|\s*/g, '||');
code = code.replace(/\s*=>\s*/g, '=>');

// Step 5: Trim
code = code.trim();

// Step 6: Restore strings
code = code.replace(/__S(\d+)__/g, (match, idx) => strings[parseInt(idx)]);

// Step 7: Write to file
fs.writeFileSync(MIN_OUTPUT, code);

console.log('✓ main.js created (minified to single line)');
console.log('');

// Verify with ls -la
console.log('File sizes:');
const { execSync } = require('child_process');
const output = execSync('ls -la main*.js', { cwd: __dirname, encoding: 'utf8' });
console.log(output);