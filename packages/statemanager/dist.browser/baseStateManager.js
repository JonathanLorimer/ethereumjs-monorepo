"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseStateManager = void 0;
const common_1 = __importStar(require("@ethereumjs/common"));
const debug_1 = require("debug");
/**
 * Abstract BaseStateManager class for the non-storage-backend
 * related functionality parts of a StateManager like keeping
 * track of accessed storage (`EIP-2929`) or touched accounts
 * (`EIP-158`).
 *
 * This is not a full StateManager implementation in itself but
 * can be used to ease implementing an own StateManager.
 *
 * Note that the implementation is pretty new (October 2021)
 * and we cannot guarantee a stable interface yet.
 */
class BaseStateManager {
    /**
     * Needs to be called from the subclass constructor
     */
    constructor(opts) {
        /**
         * StateManager is run in DEBUG mode (default: false)
         * Taken from DEBUG environment variable
         *
         * Safeguards on debug() calls are added for
         * performance reasons to avoid string literal evaluation
         * @hidden
         */
        this.DEBUG = false;
        let common = opts.common;
        if (!common) {
            common = new common_1.default({ chain: common_1.Chain.Mainnet, hardfork: common_1.Hardfork.Petersburg });
        }
        this._common = common;
        // Safeguard if "process" is not available (browser)
        if (process !== undefined && process.env.DEBUG) {
            this.DEBUG = true;
        }
        this._debug = (0, debug_1.debug)('statemanager:statemanager');
    }
    /**
     * Gets the account associated with `address`. Returns an empty account if the account does not exist.
     * @param address - Address of the `account` to get
     */
    async getAccount(address) {
        const account = await this._cache.getOrLoad(address);
        return account;
    }
    /**
     * Saves an account into state under the provided `address`.
     * @param address - Address under which to store `account`
     * @param account - The account to store
     */
    async putAccount(address, account) {
        if (this.DEBUG) {
            this._debug(`Save account address=${address} nonce=${account.nonce} balance=${account.balance} contract=${account.isContract() ? 'yes' : 'no'} empty=${account.isEmpty() ? 'yes' : 'no'}`);
        }
        this._cache.put(address, account);
    }
    /**
     * Gets the account associated with `address`, modifies the given account
     * fields, then saves the account into state. Account fields can include
     * `nonce`, `balance`, `stateRoot`, and `codeHash`.
     * @param address - Address of the account to modify
     * @param accountFields - Object containing account fields and values to modify
     */
    async modifyAccountFields(address, accountFields) {
        const account = await this.getAccount(address);
        account.nonce = accountFields.nonce ?? account.nonce;
        account.balance = accountFields.balance ?? account.balance;
        account.stateRoot = accountFields.stateRoot ?? account.stateRoot;
        account.codeHash = accountFields.codeHash ?? account.codeHash;
        await this.putAccount(address, account);
    }
    /**
     * Deletes an account from state under the provided `address`. The account will also be removed from the state trie.
     * @param address - Address of the account which should be deleted
     */
    async deleteAccount(address) {
        if (this.DEBUG) {
            this._debug(`Delete account ${address}`);
        }
        this._cache.del(address);
    }
    async accountIsEmpty(address) {
        const account = await this.getAccount(address);
        return account.isEmpty();
    }
    /**
     * Checkpoints the current state of the StateManager instance.
     * State changes that follow can then be committed by calling
     * `commit` or `reverted` by calling rollback.
     *
     * Partial implementation, called from the subclass.
     */
    async checkpoint() {
        this._cache.checkpoint();
    }
    /**
     * Commits the current change-set to the instance since the
     * last call to checkpoint.
     *
     * Partial implementation, called from the subclass.
     */
    async commit() {
        // setup cache checkpointing
        this._cache.commit();
    }
    /**
     * Reverts the current change-set to the instance since the
     * last call to checkpoint.
     *
     * Partial implementation , called from the subclass.
     */
    async revert() {
        // setup cache checkpointing
        this._cache.revert();
    }
    async flush() {
        await this._cache.flush();
    }
}
exports.BaseStateManager = BaseStateManager;
//# sourceMappingURL=baseStateManager.js.map