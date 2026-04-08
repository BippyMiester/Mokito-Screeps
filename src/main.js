'use strict';

// Bot: Mokito
// Entry point for Screeps

const Mokito = require('./core/Mokito');

// Initialize on first run
if (!global.Mokito) {
    global.Mokito = new Mokito();
    console.log('*** Greetings from Mokito! ***');
    console.log('Current Game Tick:', Game.time);
}

// Main game loop
module.exports.loop = function() {
    global.Mokito.run();
};
