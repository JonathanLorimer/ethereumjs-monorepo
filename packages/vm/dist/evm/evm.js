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
exports.VmErrorResult = exports.INVALID_EOF_RESULT = exports.INVALID_BYTECODE_RESULT = exports.COOGResult = exports.OOGResult = void 0;
const util_1 = require("util");
const block_1 = require("@ethereumjs/block");
const blockchain_1 = __importDefault(require("@ethereumjs/blockchain"));
const common_1 = __importStar(require("@ethereumjs/common"));
const statemanager_1 = require("@ethereumjs/statemanager");
const AsyncEventEmitter = require('async-eventemitter');
const debug_1 = require("debug");
const util_2 = require("@ethereumjs/util");
const trie_1 = require("@ethereumjs/trie");
const eei_1 = __importDefault(require("./eei"));
const exceptions_1 = require("../exceptions");
const interpreter_1 = __importDefault(require("./interpreter"));
const message_1 = __importDefault(require("./message"));
const eof_1 = __importDefault(require("./eof"));
const opcodes_1 = require("./opcodes");
const precompiles_1 = require("./precompiles");
const state_1 = require("../state");
const vmState_1 = require("../vmState");
const debug = (0, debug_1.debug)('vm:evm');
const debugGas = (0, debug_1.debug)('vm:evm:gas');
// very ugly way to detect if we are running in a browser
const isBrowser = new Function('try {return this===window;}catch(e){ return false;}');
let mcl;
let mclInitPromise;
if (!isBrowser()) {
    mcl = require('mcl-wasm');
    mclInitPromise = mcl.init(mcl.BLS12_381);
}
function OOGResult(gasLimit) {
    return {
        returnValue: Buffer.alloc(0),
        gasUsed: gasLimit,
        exceptionError: new exceptions_1.VmError(exceptions_1.ERROR.OUT_OF_GAS),
    };
}
exports.OOGResult = OOGResult;
// CodeDeposit OOG Result
function COOGResult(gasUsedCreateCode) {
    return {
        returnValue: Buffer.alloc(0),
        gasUsed: gasUsedCreateCode,
        exceptionError: new exceptions_1.VmError(exceptions_1.ERROR.CODESTORE_OUT_OF_GAS),
    };
}
exports.COOGResult = COOGResult;
function INVALID_BYTECODE_RESULT(gasLimit) {
    return {
        returnValue: Buffer.alloc(0),
        gasUsed: gasLimit,
        exceptionError: new exceptions_1.VmError(exceptions_1.ERROR.INVALID_BYTECODE_RESULT),
    };
}
exports.INVALID_BYTECODE_RESULT = INVALID_BYTECODE_RESULT;
function INVALID_EOF_RESULT(gasLimit) {
    return {
        returnValue: Buffer.alloc(0),
        gasUsed: gasLimit,
        exceptionError: new exceptions_1.VmError(exceptions_1.ERROR.INVALID_EOF_FORMAT),
    };
}
exports.INVALID_EOF_RESULT = INVALID_EOF_RESULT;
function VmErrorResult(error, gasUsed) {
    return {
        returnValue: Buffer.alloc(0),
        gasUsed: gasUsed,
        exceptionError: error,
    };
}
exports.VmErrorResult = VmErrorResult;
/**
 * EVM is responsible for executing an EVM message fully
 * (including any nested calls and creates), processing the results
 * and storing them to state (or discarding changes in case of exceptions).
 * @ignore
 */
class EVM extends AsyncEventEmitter {
    constructor(opts) {
        super();
        /**
         * EVM is run in DEBUG mode (default: false)
         * Taken from DEBUG environment variable
         *
         * Safeguards on debug() calls are added for
         * performance reasons to avoid string literal evaluation
         * @hidden
         */
        this.DEBUG = false;
        this._refund = BigInt(0);
        this._transientStorage = new state_1.TransientStorage();
        if (opts.common) {
            this._common = opts.common;
        }
        else {
            const DEFAULT_CHAIN = common_1.Chain.Mainnet;
            this._common = new common_1.default({ chain: DEFAULT_CHAIN });
        }
        // Supported EIPs
        const supportedEIPs = [
            1153, 1559, 2315, 2537, 2565, 2718, 2929, 2930, 3074, 3198, 3529, 3540, 3541, 3607, 3651,
            3670, 3855, 3860, 4399,
        ];
        for (const eip of this._common.eips()) {
            if (!supportedEIPs.includes(eip)) {
                throw new Error(`EIP-${eip} is not supported by the EVM`);
            }
        }
        if (opts.vmState) {
            this._state = opts.vmState;
        }
        else {
            const trie = new trie_1.SecureTrie();
            const stateManager = new statemanager_1.DefaultStateManager({
                trie,
                common: this._common,
            });
            this._state = new vmState_1.VmState({ common: this._common, stateManager });
        }
        this._blockchain = opts.blockchain ?? new blockchain_1.default({ common: this._common });
        this._allowUnlimitedContractSize = opts.allowUnlimitedContractSize ?? false;
        this._customOpcodes = opts.customOpcodes;
        this._customPrecompiles = opts.customPrecompiles;
        this._common.on('hardforkChanged', () => {
            this.getActiveOpcodes();
        });
        // Initialize the opcode data
        this.getActiveOpcodes();
        this._precompiles = (0, precompiles_1.getActivePrecompiles)(this._common, this._customPrecompiles);
        if (this._common.isActivatedEIP(2537)) {
            if (isBrowser()) {
                throw new Error('EIP-2537 is currently not supported in browsers');
            }
            else {
                this._mcl = mcl;
            }
        }
        // Safeguard if "process" is not available (browser)
        if (process !== undefined && process.env.DEBUG) {
            this.DEBUG = true;
        }
        // We cache this promisified function as it's called from the main execution loop, and
        // promisifying each time has a huge performance impact.
        this._emit = (0, util_1.promisify)(this.emit.bind(this));
    }
    get precompiles() {
        return this._precompiles;
    }
    /**
     * EVM async constructor. Creates engine instance and initializes it.
     *
     * @param opts EVM engine constructor options
     */
    static async create(opts) {
        const evm = new this(opts);
        await evm.init();
        return evm;
    }
    async init() {
        if (this._isInitialized) {
            return;
        }
        if (this._common.isActivatedEIP(2537)) {
            if (isBrowser()) {
                throw new Error('EIP-2537 is currently not supported in browsers');
            }
            else {
                const mcl = this._mcl;
                await mclInitPromise; // ensure that mcl is initialized.
                mcl.setMapToMode(mcl.IRTF); // set the right map mode; otherwise mapToG2 will return wrong values.
                mcl.verifyOrderG1(1); // subgroup checks for G1
                mcl.verifyOrderG2(1); // subgroup checks for G2
            }
        }
        this._isInitialized = true;
    }
    /**
     * Returns a list with the currently activated opcodes
     * available for VM execution
     */
    getActiveOpcodes() {
        const data = (0, opcodes_1.getOpcodesForHF)(this._common, this._customOpcodes);
        this._opcodes = data.opcodes;
        this._dynamicGasHandlers = data.dynamicGasHandlers;
        this._handlers = data.handlers;
        return data.opcodes;
    }
    async _executeCall(message) {
        const account = await this._state.getAccount(message.authcallOrigin ?? message.caller);
        let errorMessage;
        // Reduce tx value from sender
        if (!message.delegatecall) {
            try {
                await this._reduceSenderBalance(account, message);
            }
            catch (e) {
                errorMessage = e;
            }
        }
        // Load `to` account
        const toAccount = await this._state.getAccount(message.to);
        // Add tx value to the `to` account
        if (!message.delegatecall) {
            try {
                await this._addToBalance(toAccount, message);
            }
            catch (e) {
                errorMessage = e;
            }
        }
        // Load code
        await this._loadCode(message);
        let exit = false;
        if (!message.code || message.code.length === 0) {
            exit = true;
            if (this.DEBUG) {
                debug(`Exit early on no code`);
            }
        }
        if (errorMessage) {
            exit = true;
            if (this.DEBUG) {
                debug(`Exit early on value transfer overflowed`);
            }
        }
        if (exit) {
            return {
                execResult: {
                    gasUsed: BigInt(0),
                    exceptionError: errorMessage,
                    returnValue: Buffer.alloc(0),
                },
            };
        }
        let result;
        if (message.isCompiled) {
            if (this.DEBUG) {
                debug(`Run precompile`);
            }
            result = await this.runPrecompile(message.code, message.data, message.gasLimit);
        }
        else {
            if (this.DEBUG) {
                debug(`Start bytecode processing...`);
            }
            result = await this.runInterpreter(message);
        }
        return {
            execResult: result,
        };
    }
    async _executeCreate(message) {
        const account = await this._state.getAccount(message.caller);
        // Reduce tx value from sender
        await this._reduceSenderBalance(account, message);
        if (this._common.isActivatedEIP(3860)) {
            if (message.data.length > Number(this._common.param('vm', 'maxInitCodeSize'))) {
                return {
                    createdAddress: message.to,
                    execResult: {
                        returnValue: Buffer.alloc(0),
                        exceptionError: new exceptions_1.VmError(exceptions_1.ERROR.INITCODE_SIZE_VIOLATION),
                        gasUsed: message.gasLimit,
                    },
                };
            }
        }
        message.code = message.data;
        message.data = Buffer.alloc(0);
        message.to = await this._generateAddress(message);
        if (this.DEBUG) {
            debug(`Generated CREATE contract address ${message.to}`);
        }
        let toAccount = await this._state.getAccount(message.to);
        // Check for collision
        if ((toAccount.nonce && toAccount.nonce > BigInt(0)) ||
            !toAccount.codeHash.equals(util_2.KECCAK256_NULL)) {
            if (this.DEBUG) {
                debug(`Returning on address collision`);
            }
            return {
                createdAddress: message.to,
                execResult: {
                    returnValue: Buffer.alloc(0),
                    exceptionError: new exceptions_1.VmError(exceptions_1.ERROR.CREATE_COLLISION),
                    gasUsed: message.gasLimit,
                },
            };
        }
        await this._state.clearContractStorage(message.to);
        const newContractEvent = {
            address: message.to,
            code: message.code,
        };
        await this._emit('newContract', newContractEvent);
        toAccount = await this._state.getAccount(message.to);
        // EIP-161 on account creation and CREATE execution
        if (this._common.gteHardfork(common_1.Hardfork.SpuriousDragon)) {
            toAccount.nonce += BigInt(1);
        }
        // Add tx value to the `to` account
        let errorMessage;
        try {
            await this._addToBalance(toAccount, message);
        }
        catch (e) {
            errorMessage = e;
        }
        let exit = false;
        if (!message.code || message.code.length === 0) {
            exit = true;
            if (this.DEBUG) {
                debug(`Exit early on no code`);
            }
        }
        if (errorMessage) {
            exit = true;
            if (this.DEBUG) {
                debug(`Exit early on value transfer overflowed`);
            }
        }
        if (exit) {
            return {
                createdAddress: message.to,
                execResult: {
                    gasUsed: BigInt(0),
                    exceptionError: errorMessage,
                    returnValue: Buffer.alloc(0),
                },
            };
        }
        if (this.DEBUG) {
            debug(`Start bytecode processing...`);
        }
        let result = await this.runInterpreter(message);
        // fee for size of the return value
        let totalGas = result.gasUsed;
        let returnFee = BigInt(0);
        if (!result.exceptionError) {
            returnFee =
                BigInt(result.returnValue.length) * BigInt(this._common.param('gasPrices', 'createData'));
            totalGas = totalGas + returnFee;
            if (this.DEBUG) {
                debugGas(`Add return value size fee (${returnFee} to gas used (-> ${totalGas}))`);
            }
        }
        // Check for SpuriousDragon EIP-170 code size limit
        let allowedCodeSize = true;
        if (!result.exceptionError &&
            this._common.gteHardfork(common_1.Hardfork.SpuriousDragon) &&
            result.returnValue.length > Number(this._common.param('vm', 'maxCodeSize'))) {
            allowedCodeSize = false;
        }
        // If enough gas and allowed code size
        let CodestoreOOG = false;
        if (totalGas <= message.gasLimit && (this._allowUnlimitedContractSize || allowedCodeSize)) {
            if (this._common.isActivatedEIP(3541) && result.returnValue[0] === eof_1.default.FORMAT) {
                if (!this._common.isActivatedEIP(3540)) {
                    result = { ...result, ...INVALID_BYTECODE_RESULT(message.gasLimit) };
                }
                // Begin EOF1 contract code checks
                // EIP-3540 EOF1 header check
                const eof1CodeAnalysisResults = eof_1.default.codeAnalysis(result.returnValue);
                if (!eof1CodeAnalysisResults?.code) {
                    result = {
                        ...result,
                        ...INVALID_EOF_RESULT(message.gasLimit),
                    };
                }
                else if (this._common.isActivatedEIP(3670)) {
                    // EIP-3670 EOF1 opcode check
                    const codeStart = eof1CodeAnalysisResults.data > 0 ? 10 : 7;
                    // The start of the code section of an EOF1 compliant contract will either be
                    // index 7 (if no data section is present) or index 10 (if a data section is present)
                    // in the bytecode of the contract
                    if (!eof_1.default.validOpcodes(result.returnValue.slice(codeStart, codeStart + eof1CodeAnalysisResults.code))) {
                        result = {
                            ...result,
                            ...INVALID_EOF_RESULT(message.gasLimit),
                        };
                    }
                    else {
                        result.gasUsed = totalGas;
                    }
                }
            }
            else {
                result.gasUsed = totalGas;
            }
        }
        else {
            if (this._common.gteHardfork(common_1.Hardfork.Homestead)) {
                if (this.DEBUG) {
                    debug(`Not enough gas or code size not allowed (>= Homestead)`);
                }
                result = { ...result, ...OOGResult(message.gasLimit) };
            }
            else {
                // we are in Frontier
                if (this.DEBUG) {
                    debug(`Not enough gas or code size not allowed (Frontier)`);
                }
                if (totalGas - returnFee <= message.gasLimit) {
                    // we cannot pay the code deposit fee (but the deposit code actually did run)
                    result = { ...result, ...COOGResult(totalGas - returnFee) };
                    CodestoreOOG = true;
                }
                else {
                    result = { ...result, ...OOGResult(message.gasLimit) };
                }
            }
        }
        // Save code if a new contract was created
        if (!result.exceptionError && result.returnValue && result.returnValue.toString() !== '') {
            await this._state.putContractCode(message.to, result.returnValue);
            if (this.DEBUG) {
                debug(`Code saved on new contract creation`);
            }
        }
        else if (CodestoreOOG) {
            // This only happens at Frontier. But, let's do a sanity check;
            if (!this._common.gteHardfork(common_1.Hardfork.Homestead)) {
                // Pre-Homestead behavior; put an empty contract.
                // This contract would be considered "DEAD" in later hard forks.
                // It is thus an unecessary default item, which we have to save to dik
                // It does change the state root, but it only wastes storage.
                //await this._state.putContractCode(message.to, result.returnValue)
                const account = await this._state.getAccount(message.to);
                await this._state.putAccount(message.to, account);
            }
        }
        return {
            createdAddress: message.to,
            execResult: result,
        };
    }
    /**
     * Starts the actual bytecode processing for a CALL or CREATE, providing
     * it with the {@link EEI}.
     */
    async runInterpreter(message, opts = {}) {
        const env = {
            blockchain: this._blockchain,
            address: message.to ?? util_2.Address.zero(),
            caller: message.caller ?? util_2.Address.zero(),
            callData: message.data ?? Buffer.from([0]),
            callValue: message.value ?? BigInt(0),
            code: message.code,
            isStatic: message.isStatic ?? false,
            depth: message.depth ?? 0,
            gasPrice: this._tx.gasPrice,
            origin: this._tx.origin ?? message.caller ?? util_2.Address.zero(),
            block: this._block ?? new block_1.Block(),
            contract: await this._state.getAccount(message.to ?? util_2.Address.zero()),
            codeAddress: message.codeAddress,
        };
        const eei = new eei_1.default(env, this._state, this, this._common, message.gasLimit, this._transientStorage);
        if (message.selfdestruct) {
            eei._result.selfdestruct = message.selfdestruct;
        }
        const interpreter = new interpreter_1.default(this, eei);
        const interpreterRes = await interpreter.run(message.code, opts);
        let result = eei._result;
        let gasUsed = message.gasLimit - eei._gasLeft;
        if (interpreterRes.exceptionError) {
            if (interpreterRes.exceptionError.error !== exceptions_1.ERROR.REVERT &&
                interpreterRes.exceptionError.error !== exceptions_1.ERROR.INVALID_EOF_FORMAT) {
                gasUsed = message.gasLimit;
            }
            // Clear the result on error
            result = {
                ...result,
                logs: [],
                selfdestruct: {},
            };
        }
        return {
            ...result,
            runState: {
                ...interpreterRes.runState,
                ...result,
                ...eei._env,
            },
            exceptionError: interpreterRes.exceptionError,
            gas: eei._gasLeft,
            gasUsed,
            returnValue: result.returnValue ? result.returnValue : Buffer.alloc(0),
        };
    }
    /**
     * Executes an EVM message, determining whether it's a call or create
     * based on the `to` address. It checkpoints the state and reverts changes
     * if an exception happens during the message execution.
     */
    async runCall(opts) {
        let message = opts.message;
        if (!message) {
            this._block = opts.block ?? block_1.Block.fromBlockData({}, { common: this._common });
            this._tx = {
                gasPrice: opts.gasPrice ?? BigInt(0),
                origin: opts.origin ?? opts.caller ?? util_2.Address.zero(),
            };
            const caller = opts.caller ?? util_2.Address.zero();
            const value = opts.value ?? BigInt(0);
            if (opts.skipBalance) {
                // if skipBalance, add `value` to caller balance to ensure sufficient funds
                const callerAccount = await this._state.getAccount(caller);
                callerAccount.balance += value;
                await this._state.putAccount(caller, callerAccount);
            }
            message = new message_1.default({
                caller,
                gasLimit: opts.gasLimit ?? BigInt(0xffffff),
                to: opts.to,
                value,
                data: opts.data,
                code: opts.code,
                depth: opts.depth,
                isCompiled: opts.isCompiled,
                isStatic: opts.isStatic,
                salt: opts.salt,
                selfdestruct: opts.selfdestruct ?? {},
                delegatecall: opts.delegatecall,
            });
        }
        await this._emit('beforeMessage', message);
        if (!message.to && this._common.isActivatedEIP(2929)) {
            message.code = message.data;
            this._state.addWarmedAddress((await this._generateAddress(message)).buf);
        }
        const oldRefund = this._refund;
        await this._state.checkpoint();
        this._transientStorage.checkpoint();
        if (this.DEBUG) {
            debug('-'.repeat(100));
            debug(`message checkpoint`);
        }
        let result;
        if (this.DEBUG) {
            const { caller, gasLimit, to, value, delegatecall } = message;
            debug(`New message caller=${caller} gasLimit=${gasLimit} to=${to?.toString() ?? 'none'} value=${value} delegatecall=${delegatecall ? 'yes' : 'no'}`);
        }
        if (message.to) {
            if (this.DEBUG) {
                debug(`Message CALL execution (to: ${message.to})`);
            }
            result = await this._executeCall(message);
        }
        else {
            if (this.DEBUG) {
                debug(`Message CREATE execution (to undefined)`);
            }
            result = await this._executeCreate(message);
        }
        if (this.DEBUG) {
            const { gasUsed, exceptionError, returnValue } = result.execResult;
            debug(`Received message execResult: [ gasUsed=${gasUsed} exceptionError=${exceptionError ? `'${exceptionError.error}'` : 'none'} returnValue=0x${(0, util_2.short)(returnValue)} gasRefund=${result.gasRefund ?? 0} ]`);
        }
        const err = result.execResult.exceptionError;
        // This clause captures any error which happened during execution
        // If that is the case, then set the _refund tracker to the old refund value
        if (err) {
            this._refund = oldRefund;
            result.execResult.selfdestruct = {};
        }
        result.gasRefund = this._refund;
        if (err) {
            if (this._common.gteHardfork(common_1.Hardfork.Homestead) || err.error != exceptions_1.ERROR.CODESTORE_OUT_OF_GAS) {
                result.execResult.logs = [];
                await this._state.revert();
                this._transientStorage.revert();
                if (this.DEBUG) {
                    debug(`message checkpoint reverted`);
                }
            }
            else {
                // we are in chainstart and the error was the code deposit error
                // we do like nothing happened.
                await this._state.commit();
                this._transientStorage.commit();
                if (this.DEBUG) {
                    debug(`message checkpoint committed`);
                }
            }
        }
        else {
            await this._state.commit();
            this._transientStorage.commit();
            if (this.DEBUG) {
                debug(`message checkpoint committed`);
            }
        }
        await this._emit('afterMessage', result);
        return result;
    }
    /**
     * Bound to the global VM and therefore
     * shouldn't be used directly from the evm class
     */
    async runCode(opts) {
        this._block = opts.block ?? block_1.Block.fromBlockData({}, { common: this._common });
        this._tx = {
            gasPrice: opts.gasPrice ?? BigInt(0),
            origin: opts.origin ?? opts.caller ?? util_2.Address.zero(),
        };
        const message = new message_1.default({
            code: opts.code,
            data: opts.data,
            gasLimit: opts.gasLimit,
            to: opts.address ?? util_2.Address.zero(),
            caller: opts.caller,
            value: opts.value,
            depth: opts.depth,
            selfdestruct: opts.selfdestruct ?? {},
            isStatic: opts.isStatic,
        });
        return this.runInterpreter(message, { pc: opts.pc });
    }
    /**
     * Returns code for precompile at the given address, or undefined
     * if no such precompile exists.
     */
    getPrecompile(address) {
        return this.precompiles.get(address.buf.toString('hex'));
    }
    /**
     * Executes a precompiled contract with given data and gas limit.
     */
    runPrecompile(code, data, gasLimit) {
        if (typeof code !== 'function') {
            throw new Error('Invalid precompile');
        }
        const opts = {
            data,
            gasLimit,
            _common: this._common,
            _EVM: this,
        };
        return code(opts);
    }
    async _loadCode(message) {
        if (!message.code) {
            const precompile = this.getPrecompile(message.codeAddress);
            if (precompile) {
                message.code = precompile;
                message.isCompiled = true;
            }
            else {
                message.code = await this._state.getContractCode(message.codeAddress);
                message.isCompiled = false;
            }
        }
    }
    async _generateAddress(message) {
        let addr;
        if (message.salt) {
            addr = (0, util_2.generateAddress2)(message.caller.buf, message.salt, message.code);
        }
        else {
            const acc = await this._state.getAccount(message.caller);
            const newNonce = acc.nonce - BigInt(1);
            addr = (0, util_2.generateAddress)(message.caller.buf, (0, util_2.bigIntToBuffer)(newNonce));
        }
        return new util_2.Address(addr);
    }
    async _reduceSenderBalance(account, message) {
        account.balance -= message.value;
        if (account.balance < BigInt(0)) {
            throw new exceptions_1.VmError(exceptions_1.ERROR.INSUFFICIENT_BALANCE);
        }
        const result = this._state.putAccount(message.authcallOrigin ?? message.caller, account);
        if (this.DEBUG) {
            debug(`Reduced sender (${message.caller}) balance (-> ${account.balance})`);
        }
        return result;
    }
    async _addToBalance(toAccount, message) {
        const newBalance = toAccount.balance + message.value;
        if (newBalance > util_2.MAX_INTEGER) {
            throw new exceptions_1.VmError(exceptions_1.ERROR.VALUE_OVERFLOW);
        }
        toAccount.balance = newBalance;
        // putAccount as the nonce may have changed for contract creation
        const result = this._state.putAccount(message.to, toAccount);
        if (this.DEBUG) {
            debug(`Added toAccount (${message.to}) balance (-> ${toAccount.balance})`);
        }
        return result;
    }
    async _touchAccount(address) {
        const account = await this._state.getAccount(address);
        return this._state.putAccount(address, account);
    }
}
exports.default = EVM;
//# sourceMappingURL=evm.js.map