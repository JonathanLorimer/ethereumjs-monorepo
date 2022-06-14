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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("@ethereumjs/util");
const blockchain_1 = __importDefault(require("@ethereumjs/blockchain"));
const common_1 = __importStar(require("@ethereumjs/common"));
const statemanager_1 = require("@ethereumjs/statemanager");
const runTx_1 = __importDefault(require("./runTx"));
const runBlock_1 = __importDefault(require("./runBlock"));
const buildBlock_1 = __importDefault(require("./buildBlock"));
const evm_1 = __importDefault(require("./evm/evm"));
const AsyncEventEmitter = require('async-eventemitter');
const util_2 = require("util");
const vmState_1 = require("./vmState");
const precompiles_1 = require("./evm/precompiles");
/**
 * Execution engine which can be used to run a blockchain, individual
 * blocks, individual transactions, or snippets of EVM bytecode.
 *
 * This class is an AsyncEventEmitter, please consult the README to learn how to use it.
 */
class VM extends AsyncEventEmitter {
    /**
     * Instantiates a new {@link VM} Object.
     *
     * @deprecated The direct usage of this constructor is discouraged since
     * non-finalized async initialization might lead to side effects. Please
     * use the async {@link VM.create} constructor instead (same API).
     * @param opts
     */
    constructor(opts = {}) {
        super();
        this._isInitialized = false;
        /**
         * VM is run in DEBUG mode (default: false)
         * Taken from DEBUG environment variable
         *
         * Safeguards on debug() calls are added for
         * performance reasons to avoid string literal evaluation
         * @hidden
         */
        this.DEBUG = false;
        this._opts = opts;
        if (opts.common) {
            // Supported EIPs
            const supportedEIPs = [
                1153, 1559, 2315, 2537, 2565, 2718, 2929, 2930, 3074, 3198, 3529, 3540, 3541, 3607, 3651,
                3670, 3855, 3860, 4399,
            ];
            for (const eip of opts.common.eips()) {
                if (!supportedEIPs.includes(eip)) {
                    throw new Error(`EIP-${eip} is not supported by the VM`);
                }
            }
            this._common = opts.common;
        }
        else {
            const DEFAULT_CHAIN = common_1.Chain.Mainnet;
            this._common = new common_1.default({ chain: DEFAULT_CHAIN });
        }
        const supportedHardforks = [
            common_1.Hardfork.Chainstart,
            common_1.Hardfork.Homestead,
            common_1.Hardfork.Dao,
            common_1.Hardfork.TangerineWhistle,
            common_1.Hardfork.SpuriousDragon,
            common_1.Hardfork.Byzantium,
            common_1.Hardfork.Constantinople,
            common_1.Hardfork.Petersburg,
            common_1.Hardfork.Istanbul,
            common_1.Hardfork.MuirGlacier,
            common_1.Hardfork.Berlin,
            common_1.Hardfork.London,
            common_1.Hardfork.ArrowGlacier,
            common_1.Hardfork.MergeForkIdTransition,
            common_1.Hardfork.Merge,
        ];
        if (!supportedHardforks.includes(this._common.hardfork())) {
            throw new Error(`Hardfork ${this._common.hardfork()} not set as supported in supportedHardforks`);
        }
        if (opts.stateManager) {
            this.stateManager = opts.stateManager;
        }
        else {
            this.stateManager = new statemanager_1.DefaultStateManager({
                common: this._common,
            });
        }
        this.vmState = new vmState_1.VmState({ common: this._common, stateManager: this.stateManager });
        this.blockchain = opts.blockchain ?? new blockchain_1.default({ common: this._common });
        this.evm = new evm_1.default({
            common: this._common,
            vmState: this.vmState,
            blockchain: this.blockchain,
        });
        if (opts.hardforkByBlockNumber !== undefined && opts.hardforkByTD !== undefined) {
            throw new Error(`The hardforkByBlockNumber and hardforkByTD options can't be used in conjunction`);
        }
        this._hardforkByBlockNumber = opts.hardforkByBlockNumber ?? false;
        this._hardforkByTD = (0, util_1.toType)(opts.hardforkByTD, util_1.TypeOutput.BigInt);
        // Safeguard if "process" is not available (browser)
        if (process !== undefined && process.env.DEBUG) {
            this.DEBUG = true;
        }
        // We cache this promisified function as it's called from the main execution loop, and
        // promisifying each time has a huge performance impact.
        this._emit = (0, util_2.promisify)(this.emit.bind(this));
    }
    /**
     * VM async constructor. Creates engine instance and initializes it.
     *
     * @param opts VM engine constructor options
     */
    static async create(opts = {}) {
        const vm = new this(opts);
        await vm.init();
        return vm;
    }
    async init() {
        if (this._isInitialized)
            return;
        await this.blockchain._init();
        if (!this._opts.stateManager) {
            if (this._opts.activateGenesisState) {
                await this.vmState.generateCanonicalGenesis(this.blockchain.genesisState());
            }
        }
        if (this._opts.activatePrecompiles && !this._opts.stateManager) {
            await this.vmState.checkpoint();
            // put 1 wei in each of the precompiles in order to make the accounts non-empty and thus not have them deduct `callNewAccount` gas.
            for (const [addressStr] of (0, precompiles_1.getActivePrecompiles)(this._common)) {
                const address = new util_1.Address(Buffer.from(addressStr, 'hex'));
                const account = await this.vmState.getAccount(address);
                // Only do this if it is not overridden in genesis
                // Note: in the case that custom genesis has storage fields, this is preserved
                if (account.isEmpty()) {
                    const newAccount = util_1.Account.fromAccountData({ balance: 1, stateRoot: account.stateRoot });
                    await this.vmState.putAccount(address, newAccount);
                }
            }
            await this.vmState.commit();
        }
        this._isInitialized = true;
    }
    /**
     * Processes the `block` running all of the transactions it contains and updating the miner's account
     *
     * This method modifies the state. If `generate` is `true`, the state modifications will be
     * reverted if an exception is raised. If it's `false`, it won't revert if the block's header is
     * invalid. If an error is thrown from an event handler, the state may or may not be reverted.
     *
     * @param {RunBlockOpts} opts - Default values for options:
     *  - `generate`: false
     */
    async runBlock(opts) {
        return runBlock_1.default.bind(this)(opts);
    }
    /**
     * Process a transaction. Run the vm. Transfers eth. Checks balances.
     *
     * This method modifies the state. If an error is thrown, the modifications are reverted, except
     * when the error is thrown from an event handler. In the latter case the state may or may not be
     * reverted.
     *
     * @param {RunTxOpts} opts
     */
    async runTx(opts) {
        return runTx_1.default.bind(this)(opts);
    }
    /**
     * Build a block on top of the current state
     * by adding one transaction at a time.
     *
     * Creates a checkpoint on the StateManager and modifies the state
     * as transactions are run. The checkpoint is committed on {@link BlockBuilder.build}
     * or discarded with {@link BlockBuilder.revert}.
     *
     * @param {BuildBlockOpts} opts
     * @returns An instance of {@link BlockBuilder} with methods:
     * - {@link BlockBuilder.addTransaction}
     * - {@link BlockBuilder.build}
     * - {@link BlockBuilder.revert}
     */
    async buildBlock(opts) {
        return buildBlock_1.default.bind(this)(opts);
    }
    /**
     * Returns a copy of the {@link VM} instance.
     */
    async copy() {
        return VM.create({
            stateManager: this.stateManager.copy(),
            blockchain: this.blockchain.copy(),
            common: this._common.copy(),
        });
    }
    /**
     * Return a compact error string representation of the object
     */
    errorStr() {
        let hf = '';
        try {
            hf = this._common.hardfork();
        }
        catch (e) {
            hf = 'error';
        }
        const errorStr = `vm hf=${hf}`;
        return errorStr;
    }
}
exports.default = VM;
//# sourceMappingURL=index.js.map