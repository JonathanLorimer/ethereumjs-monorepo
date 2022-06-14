"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthashConsensus = void 0;
const ethash_1 = __importDefault(require("@ethereumjs/ethash"));
/**
 * This class encapsulates Ethash-related consensus functionality when used with the Blockchain class.
 */
class EthashConsensus {
    constructor({ blockchain }) {
        this.blockchain = blockchain;
        this._ethash = new ethash_1.default(this.blockchain.db);
    }
    async validate(block) {
        const valid = await this._ethash.verifyPOW(block);
        if (!valid) {
            throw new Error('invalid POW');
        }
    }
    async genesisInit() { }
    async setup() { }
    async newBlock() { }
}
exports.EthashConsensus = EthashConsensus;
//# sourceMappingURL=ethash.js.map