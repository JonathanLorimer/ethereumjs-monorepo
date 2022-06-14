/// <reference types="node" />
import { AbstractLevel } from 'abstract-level';
export declare const ENCODING_OPTS: {
    keyEncoding: string;
    valueEncoding: string;
};
export declare type BatchDBOp = PutBatch | DelBatch;
export interface PutBatch {
    type: 'put';
    key: Buffer;
    value: Buffer;
}
export interface DelBatch {
    type: 'del';
    key: Buffer;
}
export interface DB {
    /**
     * Retrieves a raw value from leveldb.
     * @param key
     * @returns A Promise that resolves to `Buffer` if a value is found or `null` if no value is found.
     */
    get(key: Buffer): Promise<Buffer | null>;
    /**
     * Writes a value directly to leveldb.
     * @param key The key as a `Buffer`
     * @param value The value to be stored
     */
    put(key: Buffer, val: Buffer): Promise<void>;
    /**
     * Removes a raw value in the underlying leveldb.
     * @param keys
     */
    del(key: Buffer): Promise<void>;
    /**
     * Performs a batch operation on db.
     * @param opStack A stack of levelup operations
     */
    batch(opStack: BatchDBOp[]): Promise<void>;
    /**
     * Returns a copy of the DB instance, with a reference
     * to the **same** underlying leveldb instance.
     */
    copy(): DB;
}
/**
 * LevelDB is a thin wrapper around the underlying levelup db,
 * which validates inputs and sets encoding type.
 */
export declare class LevelDB implements DB {
    _leveldb: AbstractLevel<string | Buffer | Uint8Array, string | Buffer, string | Buffer>;
    /**
     * Initialize a DB instance. If `leveldb` is not provided, DB
     * defaults to an [in-memory store](https://github.com/Level/memdown).
     * @param leveldb - An abstract-leveldown compliant store
     */
    constructor(leveldb?: AbstractLevel<string | Buffer | Uint8Array, string | Buffer, string | Buffer> | null);
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
    copy(): DB;
}
