"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockBuilder = void 0;
const util_1 = require("@ethereumjs/util");
const trie_1 = require("@ethereumjs/trie");
const rlp_1 = __importDefault(require("rlp"));
const block_1 = require("@ethereumjs/block");
const common_1 = require("@ethereumjs/common");
const bloom_1 = __importDefault(require("./bloom"));
const runBlock_1 = require("./runBlock");
class BlockBuilder {
    constructor(vm, opts) {
        /**
         * The cumulative gas used by the transactions added to the block.
         */
        this.gasUsed = BigInt(0);
        this.transactions = [];
        this.transactionResults = [];
        this.checkpointed = false;
        this.reverted = false;
        this.built = false;
        this.vm = vm;
        this.blockOpts = { putBlockIntoBlockchain: true, ...opts.blockOpts, common: this.vm._common };
        this.headerData = {
            ...opts.headerData,
            parentHash: opts.headerData?.parentHash ?? opts.parentBlock.hash(),
            number: opts.headerData?.number ?? opts.parentBlock.header.number + BigInt(1),
            gasLimit: opts.headerData?.gasLimit ?? opts.parentBlock.header.gasLimit,
        };
        if (this.vm._common.isActivatedEIP(1559) && this.headerData.baseFeePerGas === undefined) {
            this.headerData.baseFeePerGas = opts.parentBlock.header.calcNextBaseFee();
        }
    }
    get transactionReceipts() {
        return this.transactionResults.map((result) => result.receipt);
    }
    /**
     * Throws if the block has already been built or reverted.
     */
    checkStatus() {
        if (this.built) {
            throw new Error('Block has already been built');
        }
        if (this.reverted) {
            throw new Error('State has already been reverted');
        }
    }
    /**
     * Calculates and returns the transactionsTrie for the block.
     */
    async transactionsTrie() {
        const trie = new trie_1.BaseTrie();
        for (const [i, tx] of this.transactions.entries()) {
            await trie.put(Buffer.from(rlp_1.default.encode(i)), tx.serialize());
        }
        return trie.root;
    }
    /**
     * Calculates and returns the logs bloom for the block.
     */
    logsBloom() {
        const bloom = new bloom_1.default();
        for (const txResult of this.transactionResults) {
            // Combine blooms via bitwise OR
            bloom.or(txResult.bloom);
        }
        return bloom.bitvector;
    }
    /**
     * Calculates and returns the receiptTrie for the block.
     */
    async receiptTrie() {
        const receiptTrie = new trie_1.BaseTrie();
        for (const [i, txResult] of this.transactionResults.entries()) {
            const tx = this.transactions[i];
            const encodedReceipt = (0, runBlock_1.encodeReceipt)(txResult.receipt, tx.type);
            await receiptTrie.put(Buffer.from(rlp_1.default.encode(i)), encodedReceipt);
        }
        return receiptTrie.root;
    }
    /**
     * Adds the block miner reward to the coinbase account.
     */
    async rewardMiner() {
        const minerReward = this.vm._common.param('pow', 'minerReward');
        const reward = (0, runBlock_1.calculateMinerReward)(minerReward, 0);
        const coinbase = this.headerData.coinbase
            ? new util_1.Address((0, util_1.toBuffer)(this.headerData.coinbase))
            : util_1.Address.zero();
        await (0, runBlock_1.rewardAccount)(this.vm.vmState, coinbase, reward);
    }
    /**
     * Run and add a transaction to the block being built.
     * Please note that this modifies the state of the VM.
     * Throws if the transaction's gasLimit is greater than
     * the remaining gas in the block.
     */
    async addTransaction(tx) {
        this.checkStatus();
        if (!this.checkpointed) {
            await this.vm.stateManager.checkpoint();
            this.checkpointed = true;
        }
        // According to the Yellow Paper, a transaction's gas limit
        // cannot be greater than the remaining gas in the block
        const blockGasLimit = (0, util_1.toType)(this.headerData.gasLimit, util_1.TypeOutput.BigInt);
        const blockGasRemaining = blockGasLimit - this.gasUsed;
        if (tx.gasLimit > blockGasRemaining) {
            throw new Error('tx has a higher gas limit than the remaining gas in the block');
        }
        const header = {
            ...this.headerData,
            gasUsed: this.gasUsed,
        };
        const blockData = { header, transactions: this.transactions };
        const block = block_1.Block.fromBlockData(blockData, this.blockOpts);
        const result = await this.vm.runTx({ tx, block });
        this.transactions.push(tx);
        this.transactionResults.push(result);
        this.gasUsed += result.gasUsed;
        return result;
    }
    /**
     * Reverts the checkpoint on the StateManager to reset the state from any transactions that have been run.
     */
    async revert() {
        this.checkStatus();
        if (this.checkpointed) {
            await this.vm.stateManager.revert();
            this.reverted = true;
        }
    }
    /**
     * This method returns the finalized block.
     * It also:
     *  - Assigns the reward for miner (PoW)
     *  - Commits the checkpoint on the StateManager
     *  - Sets the tip of the VM's blockchain to this block
     * For PoW, optionally seals the block with params `nonce` and `mixHash`,
     * which is validated along with the block number and difficulty by ethash.
     * For PoA, please pass `blockOption.cliqueSigner` into the buildBlock constructor,
     * as the signer will be awarded the txs amount spent on gas as they are added.
     */
    async build(sealOpts) {
        this.checkStatus();
        const blockOpts = this.blockOpts;
        const consensusType = this.vm._common.consensusType();
        if (consensusType === common_1.ConsensusType.ProofOfWork) {
            await this.rewardMiner();
        }
        const stateRoot = await this.vm.stateManager.getStateRoot();
        const transactionsTrie = await this.transactionsTrie();
        const receiptTrie = await this.receiptTrie();
        const logsBloom = this.logsBloom();
        const gasUsed = this.gasUsed;
        const timestamp = this.headerData.timestamp ?? Math.round(Date.now() / 1000);
        const headerData = {
            ...this.headerData,
            stateRoot,
            transactionsTrie,
            receiptTrie,
            logsBloom,
            gasUsed,
            timestamp,
        };
        if (consensusType === common_1.ConsensusType.ProofOfWork) {
            headerData.nonce = sealOpts?.nonce ?? headerData.nonce;
            headerData.mixHash = sealOpts?.mixHash ?? headerData.mixHash;
        }
        const blockData = { header: headerData, transactions: this.transactions };
        const block = block_1.Block.fromBlockData(blockData, blockOpts);
        if (this.blockOpts.putBlockIntoBlockchain) {
            await this.vm.blockchain.putBlock(block);
        }
        this.built = true;
        if (this.checkpointed) {
            await this.vm.stateManager.commit();
            this.checkpointed = false;
        }
        return block;
    }
}
exports.BlockBuilder = BlockBuilder;
async function buildBlock(opts) {
    return new BlockBuilder(this, opts);
}
exports.default = buildBlock;
//# sourceMappingURL=buildBlock.js.map