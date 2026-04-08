#!/usr/bin/env node
/**
 * Screeps Server Reset Script
 * Connects to CLI on port 21026 and resets all data
 * 
 * Usage: node cli/reset-server.js
 */

const net = require('net');

const CLI_PORT = 21026;
const CLI_HOST = 'localhost';

console.log('Connecting to Screeps CLI on port ' + CLI_PORT + '...');

const client = net.createConnection({ port: CLI_PORT, host: CLI_HOST }, () => {
    console.log('✅ Connected to Screeps CLI');
    console.log('🔄 Sending reset command...\n');
    
    // Send the reset command
    client.write('system.resetAllData()\n');
});

let responseBuffer = '';

client.on('data', (data) => {
    responseBuffer += data.toString();
    console.log(data.toString().trim());
});

client.on('end', () => {
    console.log('\n✅ Reset command sent successfully');
    console.log('🔄 Server should restart automatically');
});

client.on('error', (err) => {
    console.error('\n❌ Error connecting to Screeps CLI:');
    console.error('   Make sure the Screeps server is running on port ' + CLI_PORT);
    console.error('   Error:', err.message);
    process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
    console.log('\n⏰ Timeout - closing connection');
    client.end();
    process.exit(0);
}, 10000);
