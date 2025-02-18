/// <reference types="node" />
import { Account, Address } from '@ethereumjs/util';
import { Block } from '@ethereumjs/block';
import Blockchain from '@ethereumjs/blockchain';
import Common from '@ethereumjs/common';
import { VmState } from '../vmState';
import Message from './message';
import EVM from './evm';
import { Log } from './types';
import { TransientStorage } from '../state';
/**
 * Environment data which is made available to EVM bytecode.
 */
export interface Env {
    blockchain: Blockchain;
    address: Address;
    caller: Address;
    callData: Buffer;
    callValue: bigint;
    code: Buffer;
    isStatic: boolean;
    depth: number;
    gasPrice: bigint;
    origin: Address;
    block: Block;
    contract: Account;
    codeAddress: Address; /** Different than address for DELEGATECALL and CALLCODE */
    auth?: Address; /** EIP-3074 AUTH parameter */
}
/**
 * Immediate (unprocessed) result of running an EVM bytecode.
 */
export interface RunResult {
    logs: Log[];
    returnValue?: Buffer;
    /**
     * A map from the accounts that have self-destructed to the addresses to send their funds to
     */
    selfdestruct: {
        [k: string]: Buffer;
    };
}
/**
 * External interface made available to EVM bytecode. Modeled after
 * the ewasm EEI [spec](https://github.com/ewasm/design/blob/master/eth_interface.md).
 * It includes methods for accessing/modifying state, calling or creating contracts, access
 * to environment data among other things.
 * The EEI instance also keeps artifacts produced by the bytecode such as logs
 * and to-be-selfdestructed addresses.
 */
export default class EEI {
    _env: Env;
    _result: RunResult;
    _state: VmState;
    _evm: EVM;
    _lastReturned: Buffer;
    _common: Common;
    _gasLeft: bigint;
    _transientStorage: TransientStorage;
    constructor(env: Env, state: VmState, evm: EVM, common: Common, gasLeft: bigint, transientStorage: TransientStorage);
    /**
     * Subtracts an amount from the gas counter.
     * @param amount - Amount of gas to consume
     * @param context - Usage context for debugging
     * @throws if out of gas
     */
    useGas(amount: bigint, context?: string): void;
    /**
     * Adds a positive amount to the gas counter.
     * @param amount - Amount of gas refunded
     * @param context - Usage context for debugging
     */
    refundGas(amount: bigint, context?: string): void;
    /**
     * Reduces amount of gas to be refunded by a positive value.
     * @param amount - Amount to subtract from gas refunds
     * @param context - Usage context for debugging
     */
    subRefund(amount: bigint, context?: string): void;
    /**
     * Increments the internal gasLeft counter. Used for adding callStipend.
     * @param amount - Amount to add
     */
    addStipend(amount: bigint): void;
    /**
     * Returns address of currently executing account.
     */
    getAddress(): Address;
    /**
     * Returns balance of the given account.
     * @param address - Address of account
     */
    getExternalBalance(address: Address): Promise<bigint>;
    /**
     * Returns balance of self.
     */
    getSelfBalance(): bigint;
    /**
     * Returns caller address. This is the address of the account
     * that is directly responsible for this execution.
     */
    getCaller(): bigint;
    /**
     * Returns the deposited value by the instruction/transaction
     * responsible for this execution.
     */
    getCallValue(): bigint;
    /**
     * Returns input data in current environment. This pertains to the input
     * data passed with the message call instruction or transaction.
     */
    getCallData(): Buffer;
    /**
     * Returns size of input data in current environment. This pertains to the
     * input data passed with the message call instruction or transaction.
     */
    getCallDataSize(): bigint;
    /**
     * Returns the size of code running in current environment.
     */
    getCodeSize(): bigint;
    /**
     * Returns the code running in current environment.
     */
    getCode(): Buffer;
    /**
     * Returns true if the current call must be executed statically.
     */
    isStatic(): boolean;
    /**
     * Get size of an account’s code.
     * @param address - Address of account
     */
    getExternalCodeSize(address: bigint): Promise<bigint>;
    /**
     * Returns code of an account.
     * @param address - Address of account
     */
    getExternalCode(address: bigint): Promise<Buffer>;
    /**
     * Returns size of current return data buffer. This contains the return data
     * from the last executed call, callCode, callDelegate, callStatic or create.
     * Note: create only fills the return data buffer in case of a failure.
     */
    getReturnDataSize(): bigint;
    /**
     * Returns the current return data buffer. This contains the return data
     * from last executed call, callCode, callDelegate, callStatic or create.
     * Note: create only fills the return data buffer in case of a failure.
     */
    getReturnData(): Buffer;
    /**
     * Returns price of gas in current environment.
     */
    getTxGasPrice(): bigint;
    /**
     * Returns the execution's origination address. This is the
     * sender of original transaction; it is never an account with
     * non-empty associated code.
     */
    getTxOrigin(): bigint;
    /**
     * Returns the block’s number.
     */
    getBlockNumber(): bigint;
    /**
     * Returns the block's beneficiary address.
     */
    getBlockCoinbase(): bigint;
    /**
     * Returns the block's timestamp.
     */
    getBlockTimestamp(): bigint;
    /**
     * Returns the block's difficulty.
     */
    getBlockDifficulty(): bigint;
    /**
     * Returns the block's prevRandao field.
     */
    getBlockPrevRandao(): bigint;
    /**
     * Returns the block's gas limit.
     */
    getBlockGasLimit(): bigint;
    /**
     * Returns the chain ID for current chain. Introduced for the
     * CHAINID opcode proposed in [EIP-1344](https://eips.ethereum.org/EIPS/eip-1344).
     */
    getChainId(): bigint;
    /**
     * Returns the Base Fee of the block as proposed in [EIP-3198](https;//eips.etheruem.org/EIPS/eip-3198)
     */
    getBlockBaseFee(): bigint;
    /**
     * Returns Gets the hash of one of the 256 most recent complete blocks.
     * @param num - Number of block
     */
    getBlockHash(num: bigint): Promise<bigint>;
    /**
     * Store 256-bit a value in memory to persistent storage.
     */
    storageStore(key: Buffer, value: Buffer): Promise<void>;
    /**
     * Loads a 256-bit value to memory from persistent storage.
     * @param key - Storage key
     * @param original - If true, return the original storage value (default: false)
     */
    storageLoad(key: Buffer, original?: boolean): Promise<Buffer>;
    /**
     * Store 256-bit a value in memory to transient storage.
     * @param key - Storage key
     * @param value - Storage value
     */
    transientStorageStore(key: Buffer, value: Buffer): void;
    /**
     * Loads a 256-bit value to memory from transient storage.
     * @param key - Storage key
     */
    transientStorageLoad(key: Buffer): Buffer;
    /**
     * Returns the current gasCounter.
     */
    getGasLeft(): bigint;
    /**
     * Set the returning output data for the execution.
     * @param returnData - Output data to return
     */
    finish(returnData: Buffer): void;
    /**
     * Set the returning output data for the execution. This will halt the
     * execution immediately and set the execution result to "reverted".
     * @param returnData - Output data to return
     */
    revert(returnData: Buffer): void;
    /**
     * Mark account for later deletion and give the remaining balance to the
     * specified beneficiary address. This will cause a trap and the
     * execution will be aborted immediately.
     * @param toAddress - Beneficiary address
     */
    selfDestruct(toAddress: Address): Promise<void>;
    _selfDestruct(toAddress: Address): Promise<void>;
    /**
     * Creates a new log in the current environment.
     */
    log(data: Buffer, numberOfTopics: number, topics: Buffer[]): void;
    /**
     * Sends a message with arbitrary data to a given address path.
     */
    call(gasLimit: bigint, address: Address, value: bigint, data: Buffer): Promise<bigint>;
    /**
     * Sends a message with arbitrary data to a given address path.
     */
    authcall(gasLimit: bigint, address: Address, value: bigint, data: Buffer): Promise<bigint>;
    /**
     * Message-call into this account with an alternative account's code.
     */
    callCode(gasLimit: bigint, address: Address, value: bigint, data: Buffer): Promise<bigint>;
    /**
     * Sends a message with arbitrary data to a given address path, but disallow
     * state modifications. This includes log, create, selfdestruct and call with
     * a non-zero value.
     */
    callStatic(gasLimit: bigint, address: Address, value: bigint, data: Buffer): Promise<bigint>;
    /**
     * Message-call into this account with an alternative account’s code, but
     * persisting the current values for sender and value.
     */
    callDelegate(gasLimit: bigint, address: Address, value: bigint, data: Buffer): Promise<bigint>;
    _baseCall(msg: Message): Promise<bigint>;
    /**
     * Creates a new contract with a given value.
     */
    create(gasLimit: bigint, value: bigint, data: Buffer, salt?: Buffer): Promise<bigint>;
    /**
     * Creates a new contract with a given value. Generates
     * a deterministic address via CREATE2 rules.
     */
    create2(gasLimit: bigint, value: bigint, data: Buffer, salt: Buffer): Promise<bigint>;
    /**
     * Returns true if account is empty or non-existent (according to EIP-161).
     * @param address - Address of account
     */
    isAccountEmpty(address: Address): Promise<boolean>;
    /**
     * Returns true if account exists in the state trie (it can be empty). Returns false if the account is `null`.
     * @param address - Address of account
     */
    accountExists(address: Address): Promise<boolean>;
    private _getReturnCode;
}
