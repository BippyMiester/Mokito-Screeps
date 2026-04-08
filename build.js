#!/usr/bin/env node
/**
 * Build script for Mokito bot
 * Combines all source files into a single main.js file
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const OUTPUT_FILE = path.join(__dirname, 'main.js');

console.log('Building Mokito bot...');
console.log('');

// Build order - dependencies first
const buildOrder = [
    // Roles first (lowest level)
    'src/roles/Harvester.js',
    'src/roles/Runner.js',
    'src/roles/Upgrader.js',
    'src/roles/Builder.js',
    'src/roles/Repairer.js',
    'src/roles/RemoteHarvester.js',
    'src/roles/Hauler.js',
    'src/roles/Claimer.js',
    // Managers - dependencies before dependents
    'src/managers/SourceManager.js',
    'src/managers/MemoryManager.js',
    'src/managers/ConstructionManager.js',
    'src/managers/SpawnManager.js',
    'src/managers/RoomManager.js',
    'src/managers/CreepManager.js',
    // Core
    'src/core/Mokito.js',
    // Entry point
    'src/main.js'
];

let output = "'use strict';\n\n";
output += "// ============================================\n";
output += "// Mokito Bot - Combined Build\n";
output += "// Built: " + new Date().toISOString() + "\n";
output += "// ============================================\n\n";

const classNames = [];

for (const file of buildOrder) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
        console.error('  ! Not found: ' + file);
        continue;
    }
    
    const relativePath = path.relative(SRC_DIR, filePath);
    console.log('  + ' + relativePath);
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove 'use strict'
    content = content.replace(/^'use strict';\s*/m, '');
    
    // Remove module.exports and require statements
    content = content.replace(/module\.exports\s*=\s*[^;]+;/g, '');
    content = content.replace(/const\s+(\w+)\s*=\s*require\(['"][^'"]+['"]\);?/g, 
        function(match, className) {
            // Track class names for main.js
            classNames.push(className);
            return '';
        });
    
    // Keep only class definitions and code
    output += "\n// --- " + path.basename(file) + " ---\n";
    output += content.trim() + "\n";
}

// Final output - export the loop function
output += "\n// --- Bootstrap ---\n";
output += "module.exports.loop = function() {\n";
output += "    if (!global.MokitoInstance) {\n";
output += "        global.MokitoInstance = new Mokito();\n";
output += "        console.log('*** Greetings from Mokito! ***');\n";
output += "        console.log('Current Game Tick:', Game.time);\n";
output += "    }\n";
output += "    global.MokitoInstance.run();\n";
output += "};\n";

// Write output
fs.writeFileSync(OUTPUT_FILE, output);

console.log('');
console.log('Build complete!');
console.log('');
console.log('   Output: ' + OUTPUT_FILE);
console.log('   Size: ' + (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2) + ' KB');
console.log('   Modules: ' + buildOrder.length);
console.log('');
console.log('To deploy: node deploy.js');
