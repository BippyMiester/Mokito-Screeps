#!/usr/bin/env node
/**
 * Set Screeps server tick rate
 * Usage: node cli/set-tickrate.js <milliseconds>
 * Example: node cli/set-tickrate.js 250
 */

const net = require('net');

const CLI_PORT = 21026;
const CLI_HOST = 'localhost';
const tickRate = process.argv[2] || 250;

console.log('Connecting to Screeps CLI on port ' + CLI_PORT + '...');

const client = net.createConnection({ port: CLI_PORT, host: CLI_HOST }, () => {
    console.log('✅ Connected to Screeps CLI');
    console.log('🔄 Setting tick rate to ' + tickRate + 'ms...\n');
    
    // Send the command to set tick duration
    client.write('system.setTickDuration(' + tickRate + ')\n');
});

let responseBuffer = '';

client.on('data', (data) => {
    responseBuffer += data.toString();
    console.log(data.toString().trim());
});

client.on('end', () => {
    console.log('\n✅ Tick rate set to ' + tickRate + 'ms');
});

client.on('error', (err) => {
    console.error('\n❌ Error connecting to Screeps CLI:');
    console.error('   Make sure the Screeps server is running on port ' + CLI_PORT);
    console.error('   Error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.log('\n⏰ Timeout - closing connection');
    client.end();
    process.exit(0);
}, 10000);
