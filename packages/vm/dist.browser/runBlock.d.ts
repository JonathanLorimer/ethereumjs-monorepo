/// <reference types="node" />
import { Account, Address } from '@ethereumjs/util';
import { Block } from '@ethereumjs/block';
import VM from './index';
import type { RunTxResult } from './runTx';
import type { TxReceipt } from './types';
import { VmState } from './vmState';
/**
 * Options for running a block.
 */
export interface RunBlockOpts {
    /**
     * The @ethereumjs/block to process
     */
    block: Block;
    /**
     * Root of the state trie
     */
    root?: Buffer;
    /**
     * Whether to generate the stateRoot and other related fields.
     * If `true`, `runBlock` will set the fields `stateRoot`, `receiptTrie`, `gasUsed`, and `bloom` (logs bloom) after running the block.
     * If `false`, `runBlock` throws if any fields do not match.
     * Defaults to `false`.
     */
    generate?: boolean;
    /**
     * If true, will skip "Block validation":
     * Block validation validates the header (with respect to the blockchain),
     * the transactions, the transaction trie and the uncle hash.
     */
    skipBlockValidation?: boolean;
    /**
     * If true, skips the nonce check
     */
    skipNonce?: boolean;
    /**
     * If true, skips the balance check
     */
    skipBalance?: boolean;
    /**
     * For merge transition support, pass the chain TD up to the block being run
     */
    hardforkByTD?: bigint;
}
/**
 * Result of {@link runBlock}
 */
export interface RunBlockResult {
    /**
     * Receipts generated for transactions in the block
     */
    receipts: TxReceipt[];
    /**
     * Results of executing the transactions in the block
     */
    results: RunTxResult[];
    /**
     * The stateRoot after executing the block
     */
    stateRoot: Buffer;
    /**
     * The gas used after executing the block
     */
    gasUsed: bigint;
    /**
     * The bloom filter of the LOGs (events) after executing the block
     */
    logsBloom: Buffer;
    /**
     * The receipt root after executing the block
     */
    receiptRoot: Buffer;
}
export interface AfterBlockEvent extends RunBlockResult {
    block: Block;
}
/**
 * @ignore
 */
export default function runBlock(this: VM, opts: RunBlockOpts): Promise<RunBlockResult>;
export declare function calculateMinerReward(minerReward: bigint, ommersNum: number): bigint;
export declare function rewardAccount(state: VmState, address: Address, reward: bigint): Promise<Account>;
/**
 * Returns the encoded tx receipt.
 */
export declare function encodeReceipt(receipt: TxReceipt, txType: number): Buffer;
