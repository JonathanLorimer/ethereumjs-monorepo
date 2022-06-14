/// <reference types="node" />
import { DB, BatchDBOp } from './db';
export declare type Checkpoint = {
    keyValueMap: Map<string, Buffer | null>;
    root: Buffer;
};
/**
 * DB is a thin wrapper around the underlying levelup db,
 * which validates inputs and sets encoding type.
 */
export declare class CheckpointDB implements DB {
    checkpoints: Checkpoint[];
    db: DB;
    /**
     * Initialize a DB instance.
     */
    constructor(db: DB);
    /**
     * Is the DB during a checkpoint phase?
     */
    get isCheckpoint(): boolean;
    /**
     * Adds a new checkpoint to the stack
     * @param root
     */
    checkpoint(root: Buffer): void;
    /**
     * Commits the latest checkpoint
     */
    commit(): Promise<void>;
    /**
     * Reverts the latest checkpoint
     */
    revert(): Promise<Buffer>;
    /**
     * @inheritdoc
     */
    get(key: Buffer): Promise<Buffer | null>;
    /**
     * @inheritdoc
     */
    put(key: Buffer, val: Buffer): Promise<void>;
    /**
     * @inheritdoc
     */
    del(key: Buffer): Promise<void>;
    /**
     * @inheritdoc
     */
    batch(opStack: BatchDBOp[]): Promise<void>;
    /**
     * @inheritdoc
     */
    copy(): CheckpointDB;
}
