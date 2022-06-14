"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Block = void 0;
const trie_1 = require("@ethereumjs/trie");
const keccak_1 = require("ethereum-cryptography/keccak");
const util_1 = require("@ethereumjs/util");
const rlp_1 = __importDefault(require("rlp"));
const common_1 = require("@ethereumjs/common");
const tx_1 = require("@ethereumjs/tx");
const header_1 = require("./header");
/**
 * An object that represents the block.
 */
class Block {
    /**
     * This constructor takes the values, validates them, assigns them and freezes the object.
     * Use the static factory methods to assist in creating a Block object from varying data types and options.
     */
    constructor(header, transactions = [], uncleHeaders = [], opts = {}) {
        this.transactions = [];
        this.uncleHeaders = [];
        this.txTrie = new trie_1.BaseTrie();
        this.header = header ?? header_1.BlockHeader.fromHeaderData({}, opts);
        this.transactions = transactions;
        this.uncleHeaders = uncleHeaders;
        this._common = this.header._common;
        if (uncleHeaders.length > 0) {
            if (this._common.consensusType() === common_1.ConsensusType.ProofOfAuthority) {
                const msg = this._errorMsg('Block initialization with uncleHeaders on a PoA network is not allowed');
                throw new Error(msg);
            }
            if (this._common.consensusType() === common_1.ConsensusType.ProofOfStake) {
                const msg = this._errorMsg('Block initialization with uncleHeaders on a PoS network is not allowed');
                throw new Error(msg);
            }
        }
        const freeze = opts?.freeze ?? true;
        if (freeze) {
            Object.freeze(this);
        }
    }
    /**
     * Static constructor to create a block from a block data dictionary
     *
     * @param blockData
     * @param opts
     */
    static fromBlockData(blockData = {}, opts) {
        const { header: headerData, transactions: txsData, uncleHeaders: uhsData } = blockData;
        const header = header_1.BlockHeader.fromHeaderData(headerData, opts);
        // parse transactions
        const transactions = [];
        for (const txData of txsData ?? []) {
            const tx = tx_1.TransactionFactory.fromTxData(txData, {
                ...opts,
                // Use header common in case of hardforkByBlockNumber being activated
                common: header._common,
            });
            transactions.push(tx);
        }
        // parse uncle headers
        const uncleHeaders = [];
        const uncleOpts = {
            hardforkByBlockNumber: true,
            ...opts,
            // Use header common in case of hardforkByBlockNumber being activated
            common: header._common,
            // Disable this option here (all other options carried over), since this overwrites the provided Difficulty to an incorrect value
            calcDifficultyFromHeader: undefined,
            // Uncles are obsolete post-merge (no use for hardforkByTD)
            hardforkByTD: undefined,
        };
        for (const uhData of uhsData ?? []) {
            const uh = header_1.BlockHeader.fromHeaderData(uhData, uncleOpts);
            uncleHeaders.push(uh);
        }
        return new Block(header, transactions, uncleHeaders, opts);
    }
    /**
     * Static constructor to create a block from a RLP-serialized block
     *
     * @param serialized
     * @param opts
     */
    static fromRLPSerializedBlock(serialized, opts) {
        const values = (0, util_1.arrToBufArr)(rlp_1.default.decode(Uint8Array.from(serialized)));
        if (!Array.isArray(values)) {
            throw new Error('Invalid serialized block input. Must be array');
        }
        return Block.fromValuesArray(values, opts);
    }
    /**
     * Static constructor to create a block from an array of Buffer values
     *
     * @param values
     * @param opts
     */
    static fromValuesArray(values, opts) {
        if (values.length > 3) {
            throw new Error('invalid block. More values than expected were received');
        }
        const [headerData, txsData, uhsData] = values;
        const header = header_1.BlockHeader.fromValuesArray(headerData, opts);
        // parse transactions
        const transactions = [];
        for (const txData of txsData || []) {
            transactions.push(tx_1.TransactionFactory.fromBlockBodyData(txData, {
                ...opts,
                // Use header common in case of hardforkByBlockNumber being activated
                common: header._common,
            }));
        }
        // parse uncle headers
        const uncleHeaders = [];
        const uncleOpts = {
            hardforkByBlockNumber: true,
            ...opts,
            // Use header common in case of hardforkByBlockNumber being activated
            common: header._common,
            // Disable this option here (all other options carried over), since this overwrites the provided Difficulty to an incorrect value
            calcDifficultyFromHeader: undefined,
        };
        if (uncleOpts.hardforkByTD) {
            delete uncleOpts.hardforkByBlockNumber;
        }
        for (const uncleHeaderData of uhsData || []) {
            uncleHeaders.push(header_1.BlockHeader.fromValuesArray(uncleHeaderData, uncleOpts));
        }
        return new Block(header, transactions, uncleHeaders, opts);
    }
    /**
     * Returns a Buffer Array of the raw Buffers of this block, in order.
     */
    raw() {
        return [
            this.header.raw(),
            this.transactions.map((tx) => tx.supports(tx_1.Capability.EIP2718TypedTransaction) ? tx.serialize() : tx.raw()),
            this.uncleHeaders.map((uh) => uh.raw()),
        ];
    }
    /**
     * Returns the hash of the block.
     */
    hash() {
        return this.header.hash();
    }
    /**
     * Determines if this block is the genesis block.
     */
    isGenesis() {
        return this.header.isGenesis();
    }
    /**
     * Returns the rlp encoding of the block.
     */
    serialize() {
        return Buffer.from(rlp_1.default.encode((0, util_1.bufArrToArr)(this.raw())));
    }
    /**
     * Generates transaction trie for validation.
     */
    async genTxTrie() {
        const { transactions, txTrie } = this;
        for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];
            const key = Buffer.from(rlp_1.default.encode(i));
            const value = tx.serialize();
            await txTrie.put(key, value);
        }
    }
    /**
     * Validates the transaction trie by generating a trie
     * and do a check on the root hash.
     */
    async validateTransactionsTrie() {
        let result;
        if (this.transactions.length === 0) {
            result = this.header.transactionsTrie.equals(util_1.KECCAK256_RLP);
            return result;
        }
        if (this.txTrie.root.equals(util_1.KECCAK256_RLP)) {
            await this.genTxTrie();
        }
        result = this.txTrie.root.equals(this.header.transactionsTrie);
        return result;
    }
    validateTransactions(stringError = false) {
        const errors = [];
        this.transactions.forEach((tx, i) => {
            const errs = tx.validate(true);
            if (this._common.isActivatedEIP(1559)) {
                if (tx.supports(tx_1.Capability.EIP1559FeeMarket)) {
                    tx = tx;
                    if (tx.maxFeePerGas < this.header.baseFeePerGas) {
                        errs.push('tx unable to pay base fee (EIP-1559 tx)');
                    }
                }
                else {
                    tx = tx;
                    if (tx.gasPrice < this.header.baseFeePerGas) {
                        errs.push('tx unable to pay base fee (non EIP-1559 tx)');
                    }
                }
            }
            if (errs.length > 0) {
                errors.push(`errors at tx ${i}: ${errs.join(', ')}`);
            }
        });
        return stringError ? errors : errors.length === 0;
    }
    /**
     * Performs the following consistency checks on the block:
     *
     * - Value checks on the header fields
     * - Signature and gasLimit validation for included txs
     * - Validation of the tx trie
     * - Consistency checks and header validation of included uncles
     *
     * Throws if invalid.
     *
     * @param blockchain - validate against an @ethereumjs/blockchain
     * @param onlyHeader - if should only validate the header (skips validating txTrie and unclesHash) (default: false)
     */
    async validate(blockchain, onlyHeader = false) {
        await this.header.validate(blockchain);
        await this.validateUncles(blockchain);
        await this.validateData(onlyHeader);
    }
    /**
     * Validates the block data, throwing if invalid.
     * This can be checked on the Block itself without needing access to any parent block
     * It checks:
     * - All transactions are valid
     * - The transactions trie is valid
     * - The uncle hash is valid
     * @param onlyHeader if only passed the header, skip validating txTrie and unclesHash (default: false)
     */
    async validateData(onlyHeader = false) {
        const txErrors = this.validateTransactions(true);
        if (txErrors.length > 0) {
            const msg = this._errorMsg(`invalid transactions: ${txErrors.join(' ')}`);
            throw new Error(msg);
        }
        if (onlyHeader) {
            return;
        }
        const validateTxTrie = await this.validateTransactionsTrie();
        if (!validateTxTrie) {
            const msg = this._errorMsg('invalid transaction trie');
            throw new Error(msg);
        }
        if (!this.validateUnclesHash()) {
            const msg = this._errorMsg('invalid uncle hash');
            throw new Error(msg);
        }
    }
    /**
     * Validates the uncle's hash.
     */
    validateUnclesHash() {
        const uncles = this.uncleHeaders.map((uh) => uh.raw());
        const raw = rlp_1.default.encode((0, util_1.bufArrToArr)(uncles));
        return Buffer.from((0, keccak_1.keccak256)(raw)).equals(this.header.uncleHash);
    }
    /**
     * Consistency checks and header validation for uncles included,
     * in the block, if any.
     *
     * Throws if invalid.
     *
     * The rules of uncles are the following:
     * Uncle Header is a valid header.
     * Uncle Header is an orphan, i.e. it is not one of the headers of the canonical chain.
     * Uncle Header has a parentHash which points to the canonical chain. This parentHash is within the last 7 blocks.
     * Uncle Header is not already included as uncle in another block.
     * Header has at most 2 uncles.
     * Header does not count an uncle twice.
     *
     * @param blockchain - additionally validate against an @ethereumjs/blockchain instance
     */
    async validateUncles(blockchain) {
        if (this.isGenesis()) {
            return;
        }
        // Header has at most 2 uncles
        if (this.uncleHeaders.length > 2) {
            const msg = this._errorMsg('too many uncle headers');
            throw new Error(msg);
        }
        // Header does not count an uncle twice.
        const uncleHashes = this.uncleHeaders.map((header) => header.hash().toString('hex'));
        if (!(new Set(uncleHashes).size === uncleHashes.length)) {
            const msg = this._errorMsg('duplicate uncles');
            throw new Error(msg);
        }
        await this._validateUncleHeaders(this.uncleHeaders, blockchain);
    }
    /**
     * Returns the canonical difficulty for this block.
     *
     * @param parentBlock - the parent of this `Block`
     */
    canonicalDifficulty(parentBlock) {
        return this.header.canonicalDifficulty(parentBlock.header);
    }
    /**
     * Checks that the block's `difficulty` matches the canonical difficulty.
     *
     * @param parentBlock - the parent of this `Block`
     */
    validateDifficulty(parentBlock) {
        return this.header.validateDifficulty(parentBlock.header);
    }
    /**
     * Validates if the block gasLimit remains in the
     * boundaries set by the protocol.
     *
     * @param parentBlock - the parent of this `Block`
     */
    validateGasLimit(parentBlock) {
        return this.header.validateGasLimit(parentBlock.header);
    }
    /**
     * Returns the block in JSON format.
     */
    toJSON() {
        return {
            header: this.header.toJSON(),
            transactions: this.transactions.map((tx) => tx.toJSON()),
            uncleHeaders: this.uncleHeaders.map((uh) => uh.toJSON()),
        };
    }
    /**
     * The following rules are checked in this method:
     * Uncle Header is a valid header.
     * Uncle Header is an orphan, i.e. it is not one of the headers of the canonical chain.
     * Uncle Header has a parentHash which points to the canonical chain. This parentHash is within the last 7 blocks.
     * Uncle Header is not already included as uncle in another block.
     * @param uncleHeaders - list of uncleHeaders
     * @param blockchain - pointer to the blockchain
     */
    async _validateUncleHeaders(uncleHeaders, blockchain) {
        if (uncleHeaders.length == 0) {
            return;
        }
        // Each Uncle Header is a valid header
        await Promise.all(uncleHeaders.map((uh) => uh.validate(blockchain, this.header.number)));
        // Check how many blocks we should get in order to validate the uncle.
        // In the worst case, we get 8 blocks, in the best case, we only get 1 block.
        const canonicalBlockMap = [];
        let lowestUncleNumber = this.header.number;
        uncleHeaders.map((header) => {
            if (header.number < lowestUncleNumber) {
                lowestUncleNumber = header.number;
            }
        });
        // Helper variable: set hash to `true` if hash is part of the canonical chain
        const canonicalChainHashes = {};
        // Helper variable: set hash to `true` if uncle hash is included in any canonical block
        const includedUncles = {};
        // Due to the header validation check above, we know that `getBlocks` is between 1 and 8 inclusive.
        const getBlocks = Number(this.header.number - lowestUncleNumber + BigInt(1));
        // See Geth: https://github.com/ethereum/go-ethereum/blob/b63bffe8202d46ea10ac8c4f441c582642193ac8/consensus/ethash/consensus.go#L207
        // Here we get the necessary blocks from the chain.
        let parentHash = this.header.parentHash;
        for (let i = 0; i < getBlocks; i++) {
            const parentBlock = await this._getBlockByHash(blockchain, parentHash);
            if (!parentBlock) {
                const msg = this._errorMsg('could not find parent block');
                throw new Error(msg);
            }
            canonicalBlockMap.push(parentBlock);
            // mark block hash as part of the canonical chain
            canonicalChainHashes[parentBlock.hash().toString('hex')] = true;
            // for each of the uncles, mark the uncle as included
            parentBlock.uncleHeaders.map((uh) => {
                includedUncles[uh.hash().toString('hex')] = true;
            });
            parentHash = parentBlock.header.parentHash;
        }
        // Here we check:
        // Uncle Header is an orphan, i.e. it is not one of the headers of the canonical chain.
        // Uncle Header is not already included as uncle in another block.
        // Uncle Header has a parentHash which points to the canonical chain.
        uncleHeaders.map((uh) => {
            const uncleHash = uh.hash().toString('hex');
            const parentHash = uh.parentHash.toString('hex');
            if (!canonicalChainHashes[parentHash]) {
                const msg = this._errorMsg('The parent hash of the uncle header is not part of the canonical chain');
                throw new Error(msg);
            }
            if (includedUncles[uncleHash]) {
                const msg = this._errorMsg('The uncle is already included in the canonical chain');
                throw new Error(msg);
            }
            if (canonicalChainHashes[uncleHash]) {
                const msg = this._errorMsg('The uncle is a canonical block');
                throw new Error(msg);
            }
        });
    }
    async _getBlockByHash(blockchain, hash) {
        try {
            const block = await blockchain.getBlock(hash);
            return block;
        }
        catch (error) {
            if (error.code === 'LEVEL_NOT_FOUND') {
                return undefined;
            }
            else {
                throw error;
            }
        }
    }
    /**
     * Return a compact error string representation of the object
     */
    errorStr() {
        let hash = '';
        try {
            hash = (0, util_1.bufferToHex)(this.hash());
        }
        catch (e) {
            hash = 'error';
        }
        let hf = '';
        try {
            hf = this._common.hardfork();
        }
        catch (e) {
            hf = 'error';
        }
        let errorStr = `block number=${this.header.number} hash=${hash} `;
        errorStr += `hf=${hf} baseFeePerGas=${this.header.baseFeePerGas ?? 'none'} `;
        errorStr += `txs=${this.transactions.length} uncles=${this.uncleHeaders.length}`;
        return errorStr;
    }
    /**
     * Internal helper function to create an annotated error message
     *
     * @param msg Base error message
     * @hidden
     */
    _errorMsg(msg) {
        return `${msg} (${this.errorStr()})`;
    }
}
exports.Block = Block;
//# sourceMappingURL=block.js.map