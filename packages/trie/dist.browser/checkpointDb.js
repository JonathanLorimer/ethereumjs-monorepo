"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckpointDB = void 0;
/**
 * DB is a thin wrapper around the underlying levelup db,
 * which validates inputs and sets encoding type.
 */
class CheckpointDB {
    /**
     * Initialize a DB instance.
     */
    constructor(db) {
        this.db = db;
        // Roots of trie at the moment of checkpoint
        this.checkpoints = [];
    }
    /**
     * Is the DB during a checkpoint phase?
     */
    get isCheckpoint() {
        return this.checkpoints.length > 0;
    }
    /**
     * Adds a new checkpoint to the stack
     * @param root
     */
    checkpoint(root) {
        this.checkpoints.push({ keyValueMap: new Map(), root });
    }
    /**
     * Commits the latest checkpoint
     */
    async commit() {
        const { keyValueMap } = this.checkpoints.pop();
        if (!this.isCheckpoint) {
            // This was the final checkpoint, we should now commit and flush everything to disk
            const batchOp = [];
            keyValueMap.forEach(function (value, key) {
                if (value === null) {
                    batchOp.push({
                        type: 'del',
                        key: Buffer.from(key, 'binary'),
                    });
                }
                else {
                    batchOp.push({
                        type: 'put',
                        key: Buffer.from(key, 'binary'),
                        value,
                    });
                }
            });
            await this.batch(batchOp);
        }
        else {
            // dump everything into the current (higher level) cache
            const currentKeyValueMap = this.checkpoints[this.checkpoints.length - 1].keyValueMap;
            keyValueMap.forEach((value, key) => currentKeyValueMap.set(key, value));
        }
    }
    /**
     * Reverts the latest checkpoint
     */
    async revert() {
        const { root } = this.checkpoints.pop();
        return root;
    }
    /**
     * @inheritdoc
     */
    async get(key) {
        // Lookup the value in our cache. We return the latest checkpointed value (which should be the value on disk)
        for (let index = this.checkpoints.length - 1; index >= 0; index--) {
            const value = this.checkpoints[index].keyValueMap.get(key.toString('binary'));
            if (value !== undefined) {
                return value;
            }
        }
        // Nothing has been found in cache, look up from disk
        const value = await this.db.get(key);
        if (this.isCheckpoint) {
            // Since we are a checkpoint, put this value in cache, so future `get` calls will not look the key up again from disk.
            this.checkpoints[this.checkpoints.length - 1].keyValueMap.set(key.toString('binary'), value);
        }
        return value;
    }
    /**
     * @inheritdoc
     */
    async put(key, val) {
        if (this.isCheckpoint) {
            // put value in cache
            this.checkpoints[this.checkpoints.length - 1].keyValueMap.set(key.toString('binary'), val);
        }
        else {
            await this.db.put(key, val);
        }
    }
    /**
     * @inheritdoc
     */
    async del(key) {
        if (this.isCheckpoint) {
            // delete the value in the current cache
            this.checkpoints[this.checkpoints.length - 1].keyValueMap.set(key.toString('binary'), null);
        }
        else {
            // delete the value on disk
            await this.db.del(key);
        }
    }
    /**
     * @inheritdoc
     */
    async batch(opStack) {
        if (this.isCheckpoint) {
            for (const op of opStack) {
                if (op.type === 'put') {
                    await this.put(op.key, op.value);
                }
                else if (op.type === 'del') {
                    await this.del(op.key);
                }
            }
        }
        else {
            await this.db.batch(opStack);
        }
    }
    /**
     * @inheritdoc
     */
    copy() {
        return new CheckpointDB(this.db);
    }
}
exports.CheckpointDB = CheckpointDB;
//# sourceMappingURL=checkpointDb.js.map