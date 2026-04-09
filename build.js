#!/usr/bin/env node
/**
 * Build script for Mokito bot using terser
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

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

// Write full version
fs.writeFileSync(FULL_OUTPUT, fullOutput);
console.log('');
console.log('✓ main-full.js created');

// Minify with terser
console.log('');
console.log('Minimizing with terser...');

minify(fullOutput, {
  compress: {
    drop_console: false,  // Keep console.log
    drop_debugger: true,
    dead_code: true,
    unused: true,
  },
  mangle: {
    keep_classnames: false,
    keep_fnames: false,
  },
  format: {
    comments: false,  // Remove all comments
    beautify: false,
    semicolons: true,
  },
}).then(result => {
  if (result.error) {
    console.error('Minification error:', result.error);
    process.exit(1);
  }
  
  fs.writeFileSync(MIN_OUTPUT, result.code);
  
  console.log('✓ main.js created (minified)');
  console.log('');
  
  // Show file sizes
  const { execSync } = require('child_process');
  const output = execSync('ls -la main*.js', { cwd: __dirname, encoding: 'utf8' });
  console.log('File sizes:');
  console.log(output);
}).catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
