"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CasperConsensus = void 0;
/**
 * This class encapsulates Casper-related consensus functionality when used with the Blockchain class.
 */
class CasperConsensus {
    constructor({ blockchain }) {
        this.blockchain = blockchain;
    }
    async genesisInit() { }
    async setup() { }
    async validate() { }
    async newBlock() { }
}
exports.CasperConsensus = CasperConsensus;
//# sourceMappingURL=casper.js.map