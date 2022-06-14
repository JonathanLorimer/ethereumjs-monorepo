"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LevelDB = exports.ENCODING_OPTS = void 0;
const memory_level_1 = require("memory-level");
exports.ENCODING_OPTS = { keyEncoding: 'buffer', valueEncoding: 'buffer' };
/**
 * LevelDB is a thin wrapper around the underlying levelup db,
 * which validates inputs and sets encoding type.
 */
class LevelDB {
    /**
     * Initialize a DB instance. If `leveldb` is not provided, DB
     * defaults to an [in-memory store](https://github.com/Level/memdown).
     * @param leveldb - An abstract-leveldown compliant store
     */
    constructor(leveldb) {
        this._leveldb = leveldb ?? new memory_level_1.MemoryLevel(exports.ENCODING_OPTS);
    }
    /**
     * @inheritdoc
     */
    async get(key) {
        let value = null;
        try {
            value = await this._leveldb.get(key, exports.ENCODING_OPTS);
        }
        catch (error) {
            if (error.notFound) {
                // not found, returning null
            }
            else {
                throw error;
            }
        }
        return value;
    }
    /**
     * @inheritdoc
     */
    async put(key, val) {
        await this._leveldb.put(key, val, exports.ENCODING_OPTS);
    }
    /**
     * @inheritdoc
     */
    async del(key) {
        await this._leveldb.del(key, exports.ENCODING_OPTS);
    }
    /**
     * @inheritdoc
     */
    async batch(opStack) {
        await this._leveldb.batch(opStack, exports.ENCODING_OPTS);
    }
    /**
     * @inheritdoc
     */
    copy() {
        return new LevelDB(this._leveldb);
    }
}
exports.LevelDB = LevelDB;
//# sourceMappingURL=db.js.map