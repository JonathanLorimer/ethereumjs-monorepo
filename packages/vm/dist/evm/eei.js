"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const debug_1 = require("debug");
const util_1 = require("@ethereumjs/util");
const common_1 = require("@ethereumjs/common");
const exceptions_1 = require("../exceptions");
const message_1 = __importDefault(require("./message"));
const opcodes_1 = require("./opcodes");
const debugGas = (0, debug_1.debug)('vm:eei:gas');
function trap(err) {
    throw new exceptions_1.VmError(err);
}
/**
 * External interface made available to EVM bytecode. Modeled after
 * the ewasm EEI [spec](https://github.com/ewasm/design/blob/master/eth_interface.md).
 * It includes methods for accessing/modifying state, calling or creating contracts, access
 * to environment data among other things.
 * The EEI instance also keeps artifacts produced by the bytecode such as logs
 * and to-be-selfdestructed addresses.
 */
class EEI {
    constructor(env, state, evm, common, gasLeft, transientStorage) {
        this._env = env;
        this._state = state;
        this._evm = evm;
        this._lastReturned = Buffer.alloc(0);
        this._common = common;
        this._gasLeft = gasLeft;
        this._result = {
            logs: [],
            returnValue: undefined,
            selfdestruct: {},
        };
        this._transientStorage = transientStorage;
    }
    /**
     * Subtracts an amount from the gas counter.
     * @param amount - Amount of gas to consume
     * @param context - Usage context for debugging
     * @throws if out of gas
     */
    useGas(amount, context) {
        this._gasLeft -= amount;
        if (this._evm.DEBUG) {
            debugGas(`${context ? context + ': ' : ''}used ${amount} gas (-> ${this._gasLeft})`);
        }
        if (this._gasLeft < BigInt(0)) {
            this._gasLeft = BigInt(0);
            trap(exceptions_1.ERROR.OUT_OF_GAS);
        }
    }
    /**
     * Adds a positive amount to the gas counter.
     * @param amount - Amount of gas refunded
     * @param context - Usage context for debugging
     */
    refundGas(amount, context) {
        if (this._evm.DEBUG) {
            debugGas(`${context ? context + ': ' : ''}refund ${amount} gas (-> ${this._evm._refund})`);
        }
        this._evm._refund += amount;
    }
    /**
     * Reduces amount of gas to be refunded by a positive value.
     * @param amount - Amount to subtract from gas refunds
     * @param context - Usage context for debugging
     */
    subRefund(amount, context) {
        if (this._evm.DEBUG) {
            debugGas(`${context ? context + ': ' : ''}sub gas refund ${amount} (-> ${this._evm._refund})`);
        }
        this._evm._refund -= amount;
        if (this._evm._refund < BigInt(0)) {
            this._evm._refund = BigInt(0);
            trap(exceptions_1.ERROR.REFUND_EXHAUSTED);
        }
    }
    /**
     * Increments the internal gasLeft counter. Used for adding callStipend.
     * @param amount - Amount to add
     */
    addStipend(amount) {
        if (this._evm.DEBUG) {
            debugGas(`add stipend ${amount} (-> ${this._gasLeft})`);
        }
        this._gasLeft += amount;
    }
    /**
     * Returns address of currently executing account.
     */
    getAddress() {
        return this._env.address;
    }
    /**
     * Returns balance of the given account.
     * @param address - Address of account
     */
    async getExternalBalance(address) {
        // shortcut if current account
        if (address.equals(this._env.address)) {
            return this._env.contract.balance;
        }
        // otherwise load account then return balance
        const account = await this._state.getAccount(address);
        return account.balance;
    }
    /**
     * Returns balance of self.
     */
    getSelfBalance() {
        return this._env.contract.balance;
    }
    /**
     * Returns caller address. This is the address of the account
     * that is directly responsible for this execution.
     */
    getCaller() {
        return (0, util_1.bufferToBigInt)(this._env.caller.buf);
    }
    /**
     * Returns the deposited value by the instruction/transaction
     * responsible for this execution.
     */
    getCallValue() {
        return this._env.callValue;
    }
    /**
     * Returns input data in current environment. This pertains to the input
     * data passed with the message call instruction or transaction.
     */
    getCallData() {
        return this._env.callData;
    }
    /**
     * Returns size of input data in current environment. This pertains to the
     * input data passed with the message call instruction or transaction.
     */
    getCallDataSize() {
        return BigInt(this._env.callData.length);
    }
    /**
     * Returns the size of code running in current environment.
     */
    getCodeSize() {
        return BigInt(this._env.code.length);
    }
    /**
     * Returns the code running in current environment.
     */
    getCode() {
        return this._env.code;
    }
    /**
     * Returns true if the current call must be executed statically.
     */
    isStatic() {
        return this._env.isStatic;
    }
    /**
     * Get size of an account’s code.
     * @param address - Address of account
     */
    async getExternalCodeSize(address) {
        const addr = new util_1.Address((0, opcodes_1.addressToBuffer)(address));
        const code = await this._state.getContractCode(addr);
        return BigInt(code.length);
    }
    /**
     * Returns code of an account.
     * @param address - Address of account
     */
    async getExternalCode(address) {
        const addr = new util_1.Address((0, opcodes_1.addressToBuffer)(address));
        return this._state.getContractCode(addr);
    }
    /**
     * Returns size of current return data buffer. This contains the return data
     * from the last executed call, callCode, callDelegate, callStatic or create.
     * Note: create only fills the return data buffer in case of a failure.
     */
    getReturnDataSize() {
        return BigInt(this._lastReturned.length);
    }
    /**
     * Returns the current return data buffer. This contains the return data
     * from last executed call, callCode, callDelegate, callStatic or create.
     * Note: create only fills the return data buffer in case of a failure.
     */
    getReturnData() {
        return this._lastReturned;
    }
    /**
     * Returns price of gas in current environment.
     */
    getTxGasPrice() {
        return this._env.gasPrice;
    }
    /**
     * Returns the execution's origination address. This is the
     * sender of original transaction; it is never an account with
     * non-empty associated code.
     */
    getTxOrigin() {
        return (0, util_1.bufferToBigInt)(this._env.origin.buf);
    }
    /**
     * Returns the block’s number.
     */
    getBlockNumber() {
        return this._env.block.header.number;
    }
    /**
     * Returns the block's beneficiary address.
     */
    getBlockCoinbase() {
        let coinbase;
        if (this._common.consensusAlgorithm() === common_1.ConsensusAlgorithm.Clique) {
            coinbase = this._env.block.header.cliqueSigner();
        }
        else {
            coinbase = this._env.block.header.coinbase;
        }
        return (0, util_1.bufferToBigInt)(coinbase.toBuffer());
    }
    /**
     * Returns the block's timestamp.
     */
    getBlockTimestamp() {
        return this._env.block.header.timestamp;
    }
    /**
     * Returns the block's difficulty.
     */
    getBlockDifficulty() {
        return this._env.block.header.difficulty;
    }
    /**
     * Returns the block's prevRandao field.
     */
    getBlockPrevRandao() {
        return (0, util_1.bufferToBigInt)(this._env.block.header.prevRandao);
    }
    /**
     * Returns the block's gas limit.
     */
    getBlockGasLimit() {
        return this._env.block.header.gasLimit;
    }
    /**
     * Returns the chain ID for current chain. Introduced for the
     * CHAINID opcode proposed in [EIP-1344](https://eips.ethereum.org/EIPS/eip-1344).
     */
    getChainId() {
        return this._common.chainId();
    }
    /**
     * Returns the Base Fee of the block as proposed in [EIP-3198](https;//eips.etheruem.org/EIPS/eip-3198)
     */
    getBlockBaseFee() {
        const baseFee = this._env.block.header.baseFeePerGas;
        if (baseFee === undefined) {
            // Sanity check
            throw new Error('Block has no Base Fee');
        }
        return baseFee;
    }
    /**
     * Returns Gets the hash of one of the 256 most recent complete blocks.
     * @param num - Number of block
     */
    async getBlockHash(num) {
        const block = await this._env.blockchain.getBlock(Number(num));
        return (0, util_1.bufferToBigInt)(block.hash());
    }
    /**
     * Store 256-bit a value in memory to persistent storage.
     */
    async storageStore(key, value) {
        await this._state.putContractStorage(this._env.address, key, value);
        const account = await this._state.getAccount(this._env.address);
        this._env.contract = account;
    }
    /**
     * Loads a 256-bit value to memory from persistent storage.
     * @param key - Storage key
     * @param original - If true, return the original storage value (default: false)
     */
    async storageLoad(key, original = false) {
        if (original) {
            return this._state.getOriginalContractStorage(this._env.address, key);
        }
        else {
            return this._state.getContractStorage(this._env.address, key);
        }
    }
    /**
     * Store 256-bit a value in memory to transient storage.
     * @param key - Storage key
     * @param value - Storage value
     */
    transientStorageStore(key, value) {
        return this._transientStorage.put(this._env.address, key, value);
    }
    /**
     * Loads a 256-bit value to memory from transient storage.
     * @param key - Storage key
     */
    transientStorageLoad(key) {
        return this._transientStorage.get(this._env.address, key);
    }
    /**
     * Returns the current gasCounter.
     */
    getGasLeft() {
        return this._gasLeft;
    }
    /**
     * Set the returning output data for the execution.
     * @param returnData - Output data to return
     */
    finish(returnData) {
        this._result.returnValue = returnData;
        trap(exceptions_1.ERROR.STOP);
    }
    /**
     * Set the returning output data for the execution. This will halt the
     * execution immediately and set the execution result to "reverted".
     * @param returnData - Output data to return
     */
    revert(returnData) {
        this._result.returnValue = returnData;
        trap(exceptions_1.ERROR.REVERT);
    }
    /**
     * Mark account for later deletion and give the remaining balance to the
     * specified beneficiary address. This will cause a trap and the
     * execution will be aborted immediately.
     * @param toAddress - Beneficiary address
     */
    async selfDestruct(toAddress) {
        return this._selfDestruct(toAddress);
    }
    async _selfDestruct(toAddress) {
        // only add to refund if this is the first selfdestruct for the address
        if (!this._result.selfdestruct[this._env.address.buf.toString('hex')]) {
            this.refundGas(this._common.param('gasPrices', 'selfdestructRefund'));
        }
        this._result.selfdestruct[this._env.address.buf.toString('hex')] = toAddress.buf;
        // Add to beneficiary balance
        const toAccount = await this._state.getAccount(toAddress);
        toAccount.balance += this._env.contract.balance;
        await this._state.putAccount(toAddress, toAccount);
        // Subtract from contract balance
        await this._state.modifyAccountFields(this._env.address, {
            balance: BigInt(0),
        });
        trap(exceptions_1.ERROR.STOP);
    }
    /**
     * Creates a new log in the current environment.
     */
    log(data, numberOfTopics, topics) {
        if (numberOfTopics < 0 || numberOfTopics > 4) {
            trap(exceptions_1.ERROR.OUT_OF_RANGE);
        }
        if (topics.length !== numberOfTopics) {
            trap(exceptions_1.ERROR.INTERNAL_ERROR);
        }
        const log = [this._env.address.buf, topics, data];
        this._result.logs.push(log);
    }
    /**
     * Sends a message with arbitrary data to a given address path.
     */
    async call(gasLimit, address, value, data) {
        const msg = new message_1.default({
            caller: this._env.address,
            gasLimit,
            to: address,
            value,
            data,
            isStatic: this._env.isStatic,
            depth: this._env.depth + 1,
        });
        return this._baseCall(msg);
    }
    /**
     * Sends a message with arbitrary data to a given address path.
     */
    async authcall(gasLimit, address, value, data) {
        const msg = new message_1.default({
            caller: this._env.auth,
            gasLimit,
            to: address,
            value,
            data,
            isStatic: this._env.isStatic,
            depth: this._env.depth + 1,
            authcallOrigin: this._env.address,
        });
        return this._baseCall(msg);
    }
    /**
     * Message-call into this account with an alternative account's code.
     */
    async callCode(gasLimit, address, value, data) {
        const msg = new message_1.default({
            caller: this._env.address,
            gasLimit,
            to: this._env.address,
            codeAddress: address,
            value,
            data,
            isStatic: this._env.isStatic,
            depth: this._env.depth + 1,
        });
        return this._baseCall(msg);
    }
    /**
     * Sends a message with arbitrary data to a given address path, but disallow
     * state modifications. This includes log, create, selfdestruct and call with
     * a non-zero value.
     */
    async callStatic(gasLimit, address, value, data) {
        const msg = new message_1.default({
            caller: this._env.address,
            gasLimit,
            to: address,
            value,
            data,
            isStatic: true,
            depth: this._env.depth + 1,
        });
        return this._baseCall(msg);
    }
    /**
     * Message-call into this account with an alternative account’s code, but
     * persisting the current values for sender and value.
     */
    async callDelegate(gasLimit, address, value, data) {
        const msg = new message_1.default({
            caller: this._env.caller,
            gasLimit,
            to: this._env.address,
            codeAddress: address,
            value,
            data,
            isStatic: this._env.isStatic,
            delegatecall: true,
            depth: this._env.depth + 1,
        });
        return this._baseCall(msg);
    }
    async _baseCall(msg) {
        const selfdestruct = { ...this._result.selfdestruct };
        msg.selfdestruct = selfdestruct;
        // empty the return data buffer
        this._lastReturned = Buffer.alloc(0);
        // Check if account has enough ether and max depth not exceeded
        if (this._env.depth >= Number(this._common.param('vm', 'stackLimit')) ||
            (msg.delegatecall !== true && this._env.contract.balance < msg.value)) {
            return BigInt(0);
        }
        const results = await this._evm.runCall({ message: msg });
        if (results.execResult.logs) {
            this._result.logs = this._result.logs.concat(results.execResult.logs);
        }
        // this should always be safe
        this.useGas(results.execResult.gasUsed, 'CALL, STATICCALL, DELEGATECALL, CALLCODE');
        // Set return value
        if (results.execResult.returnValue &&
            (!results.execResult.exceptionError ||
                results.execResult.exceptionError.error === exceptions_1.ERROR.REVERT)) {
            this._lastReturned = results.execResult.returnValue;
        }
        if (!results.execResult.exceptionError) {
            Object.assign(this._result.selfdestruct, selfdestruct);
            // update stateRoot on current contract
            const account = await this._state.getAccount(this._env.address);
            this._env.contract = account;
        }
        return this._getReturnCode(results);
    }
    /**
     * Creates a new contract with a given value.
     */
    async create(gasLimit, value, data, salt) {
        const selfdestruct = { ...this._result.selfdestruct };
        const caller = this._env.address;
        const depth = this._env.depth + 1;
        // empty the return data buffer
        this._lastReturned = Buffer.alloc(0);
        // Check if account has enough ether and max depth not exceeded
        if (this._env.depth >= Number(this._common.param('vm', 'stackLimit')) ||
            this._env.contract.balance < value) {
            return BigInt(0);
        }
        // EIP-2681 check
        if (this._env.contract.nonce >= util_1.MAX_UINT64) {
            return BigInt(0);
        }
        this._env.contract.nonce += BigInt(1);
        await this._state.putAccount(this._env.address, this._env.contract);
        if (this._common.isActivatedEIP(3860)) {
            if (data.length > Number(this._common.param('vm', 'maxInitCodeSize'))) {
                return BigInt(0);
            }
        }
        const message = new message_1.default({
            caller,
            gasLimit,
            value,
            data,
            salt,
            depth,
            selfdestruct,
        });
        const results = await this._evm.runCall({ message });
        if (results.execResult.logs) {
            this._result.logs = this._result.logs.concat(results.execResult.logs);
        }
        // this should always be safe
        this.useGas(results.execResult.gasUsed, 'CREATE');
        // Set return buffer in case revert happened
        if (results.execResult.exceptionError &&
            results.execResult.exceptionError.error === exceptions_1.ERROR.REVERT) {
            this._lastReturned = results.execResult.returnValue;
        }
        if (!results.execResult.exceptionError ||
            results.execResult.exceptionError.error === exceptions_1.ERROR.CODESTORE_OUT_OF_GAS) {
            Object.assign(this._result.selfdestruct, selfdestruct);
            // update stateRoot on current contract
            const account = await this._state.getAccount(this._env.address);
            this._env.contract = account;
            if (results.createdAddress) {
                // push the created address to the stack
                return (0, util_1.bufferToBigInt)(results.createdAddress.buf);
            }
        }
        return this._getReturnCode(results);
    }
    /**
     * Creates a new contract with a given value. Generates
     * a deterministic address via CREATE2 rules.
     */
    async create2(gasLimit, value, data, salt) {
        return this.create(gasLimit, value, data, salt);
    }
    /**
     * Returns true if account is empty or non-existent (according to EIP-161).
     * @param address - Address of account
     */
    async isAccountEmpty(address) {
        return this._state.accountIsEmpty(address);
    }
    /**
     * Returns true if account exists in the state trie (it can be empty). Returns false if the account is `null`.
     * @param address - Address of account
     */
    async accountExists(address) {
        return this._state.accountExists(address);
    }
    _getReturnCode(results) {
        // This preserves the previous logic, but seems to contradict the EEI spec
        // https://github.com/ewasm/design/blob/38eeded28765f3e193e12881ea72a6ab807a3371/eth_interface.md
        if (results.execResult.exceptionError) {
            return BigInt(0);
        }
        else {
            return BigInt(1);
        }
    }
}
exports.default = EEI;
//# sourceMappingURL=eei.js.map