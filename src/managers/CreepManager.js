'use strict';

const Harvester = require('../roles/Harvester');
const Upgrader = require('../roles/Upgrader');
const Builder = require('../roles/Builder');
const Repairer = require('../roles/Repairer');
const Runner = require('../roles/Runner');

class CreepManager {
    constructor() {
        this.roles = {
            harvester: new Harvester(),
            upgrader: new Upgrader(),
            builder: new Builder(),
            repairer: new Repairer(),
            runner: new Runner()
        };
    }
    
    run() {
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            
            if (creep.spawning) continue;
            
            const role = creep.memory.role;
            if (role && this.roles[role]) {
                this.roles[role].run(creep);
            }
        }
    }
}

module.exports = CreepManager;
