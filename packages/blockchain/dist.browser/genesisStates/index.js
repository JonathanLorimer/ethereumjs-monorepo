"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.genesisStateRoot = void 0;
const trie_1 = require("@ethereumjs/trie");
const keccak_1 = require("ethereum-cryptography/keccak");
const util_1 = require("@ethereumjs/util");
const rlp_1 = __importDefault(require("rlp"));
/**
 * Derives the stateRoot of the genesis block based on genesis allocations
 */
async function genesisStateRoot(genesisState) {
    const trie = new trie_1.SecureTrie();
    for (const [key, value] of Object.entries(genesisState)) {
        const address = (0, util_1.isHexPrefixed)(key) ? (0, util_1.toBuffer)(key) : Buffer.from(key, 'hex');
        const account = new util_1.Account();
        if (typeof value === 'string') {
            account.balance = BigInt(value);
        }
        else {
            const [balance, code, storage] = value;
            if (balance) {
                account.balance = BigInt(balance);
            }
            if (code) {
                account.codeHash = Buffer.from((0, keccak_1.keccak256)((0, util_1.toBuffer)(code)));
            }
            if (storage) {
                const storageTrie = new trie_1.SecureTrie();
                for (const [k, val] of storage) {
                    const storageKey = (0, util_1.isHexPrefixed)(k) ? (0, util_1.toBuffer)(k) : Buffer.from(k, 'hex');
                    const storageVal = Buffer.from(rlp_1.default.encode(Uint8Array.from((0, util_1.unpadBuffer)((0, util_1.isHexPrefixed)(val) ? (0, util_1.toBuffer)(val) : Buffer.from(val, 'hex')))));
                    await storageTrie.put(storageKey, storageVal);
                }
                account.stateRoot = storageTrie.root;
            }
        }
        await trie.put(address, account.serialize());
    }
    return trie.root;
}
exports.genesisStateRoot = genesisStateRoot;
//# sourceMappingURL=index.js.map