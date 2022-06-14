"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeReceipt = exports.rewardAccount = exports.calculateMinerReward = void 0;
const debug_1 = require("debug");
const trie_1 = require("@ethereumjs/trie");
const util_1 = require("@ethereumjs/util");
const rlp_1 = __importDefault(require("rlp"));
const block_1 = require("@ethereumjs/block");
const common_1 = require("@ethereumjs/common");
const bloom_1 = __importDefault(require("./bloom"));
const dao_fork_accounts_config_json_1 = __importDefault(require("./config/dao_fork_accounts_config.json"));
const debug = (0, debug_1.debug)('vm:block');
/* DAO account list */
const DAOAccountList = dao_fork_accounts_config_json_1.default.DAOAccounts;
const DAORefundContract = dao_fork_accounts_config_json_1.default.DAORefundContract;
/**
 * @ignore
 */
async function runBlock(opts) {
    const state = this.vmState;
    const { root } = opts;
    let { block } = opts;
    const generateFields = !!opts.generate;
    /**
     * The `beforeBlock` event.
     *
     * @event Event: beforeBlock
     * @type {Object}
     * @property {Block} block emits the block that is about to be processed
     */
    await this._emit('beforeBlock', block);
    if (this._hardforkByBlockNumber || this._hardforkByTD || opts.hardforkByTD) {
        this._common.setHardforkByBlockNumber(block.header.number, opts.hardforkByTD ?? this._hardforkByTD);
    }
    if (this.DEBUG) {
        debug('-'.repeat(100));
        debug(`Running block hash=${block.hash().toString('hex')} number=${block.header.number} hardfork=${this._common.hardfork()}`);
    }
    // Set state root if provided
    if (root) {
        if (this.DEBUG) {
            debug(`Set provided state root ${root.toString('hex')}`);
        }
        await state.setStateRoot(root);
    }
    // check for DAO support and if we should apply the DAO fork
    if (this._common.hardforkIsActiveOnBlock(common_1.Hardfork.Dao, block.header.number) &&
        block.header.number === this._common.hardforkBlock(common_1.Hardfork.Dao)) {
        if (this.DEBUG) {
            debug(`Apply DAO hardfork`);
        }
        await _applyDAOHardfork(state);
    }
    // Checkpoint state
    await state.checkpoint();
    if (this.DEBUG) {
        debug(`block checkpoint`);
    }
    let result;
    try {
        result = await applyBlock.bind(this)(block, opts);
        if (this.DEBUG) {
            debug(`Received block results gasUsed=${result.gasUsed} bloom=${(0, util_1.short)(result.bloom.bitvector)} (${result.bloom.bitvector.length} bytes) receiptRoot=${result.receiptRoot.toString('hex')} receipts=${result.receipts.length} txResults=${result.results.length}`);
        }
    }
    catch (err) {
        await state.revert();
        if (this.DEBUG) {
            debug(`block checkpoint reverted`);
        }
        throw err;
    }
    // Persist state
    await state.commit();
    if (this.DEBUG) {
        debug(`block checkpoint committed`);
    }
    const stateRoot = await state.getStateRoot();
    // Given the generate option, either set resulting header
    // values to the current block, or validate the resulting
    // header values against the current block.
    if (generateFields) {
        const bloom = result.bloom.bitvector;
        const gasUsed = result.gasUsed;
        const receiptTrie = result.receiptRoot;
        const transactionsTrie = await _genTxTrie(block);
        const generatedFields = { stateRoot, bloom, gasUsed, receiptTrie, transactionsTrie };
        const blockData = {
            ...block,
            header: { ...block.header, ...generatedFields },
        };
        block = block_1.Block.fromBlockData(blockData, { common: this._common });
    }
    else {
        if (result.receiptRoot && !result.receiptRoot.equals(block.header.receiptTrie)) {
            if (this.DEBUG) {
                debug(`Invalid receiptTrie received=${result.receiptRoot.toString('hex')} expected=${block.header.receiptTrie.toString('hex')}`);
            }
            const msg = _errorMsg('invalid receiptTrie', this, block);
            throw new Error(msg);
        }
        if (!result.bloom.bitvector.equals(block.header.logsBloom)) {
            if (this.DEBUG) {
                debug(`Invalid bloom received=${result.bloom.bitvector.toString('hex')} expected=${block.header.logsBloom.toString('hex')}`);
            }
            const msg = _errorMsg('invalid bloom', this, block);
            throw new Error(msg);
        }
        if (result.gasUsed !== block.header.gasUsed) {
            if (this.DEBUG) {
                debug(`Invalid gasUsed received=${result.gasUsed} expected=${block.header.gasUsed}`);
            }
            const msg = _errorMsg('invalid gasUsed', this, block);
            throw new Error(msg);
        }
        if (!stateRoot.equals(block.header.stateRoot)) {
            if (this.DEBUG) {
                debug(`Invalid stateRoot received=${stateRoot.toString('hex')} expected=${block.header.stateRoot.toString('hex')}`);
            }
            const msg = _errorMsg('invalid block stateRoot', this, block);
            throw new Error(msg);
        }
    }
    const results = {
        receipts: result.receipts,
        results: result.results,
        stateRoot,
        gasUsed: result.gasUsed,
        logsBloom: result.bloom.bitvector,
        receiptRoot: result.receiptRoot,
    };
    const afterBlockEvent = { ...results, block };
    /**
     * The `afterBlock` event
     *
     * @event Event: afterBlock
     * @type {AfterBlockEvent}
     * @property {AfterBlockEvent} result emits the results of processing a block
     */
    await this._emit('afterBlock', afterBlockEvent);
    if (this.DEBUG) {
        debug(`Running block finished hash=${block.hash().toString('hex')} number=${block.header.number} hardfork=${this._common.hardfork()}`);
    }
    return results;
}
exports.default = runBlock;
/**
 * Validates and applies a block, computing the results of
 * applying its transactions. This method doesn't modify the
 * block itself. It computes the block rewards and puts
 * them on state (but doesn't persist the changes).
 * @param {Block} block
 * @param {RunBlockOpts} opts
 */
async function applyBlock(block, opts) {
    // Validate block
    if (!opts.skipBlockValidation) {
        if (block.header.gasLimit >= BigInt('0x8000000000000000')) {
            const msg = _errorMsg('Invalid block with gas limit greater than (2^63 - 1)', this, block);
            throw new Error(msg);
        }
        else {
            if (this.DEBUG) {
                debug(`Validate block`);
            }
            await block.validate(this.blockchain);
        }
    }
    // Apply transactions
    if (this.DEBUG) {
        debug(`Apply transactions`);
    }
    const blockResults = await applyTransactions.bind(this)(block, opts);
    // Pay ommers and miners
    if (block._common.consensusType() === common_1.ConsensusType.ProofOfWork) {
        await assignBlockRewards.bind(this)(block);
    }
    return blockResults;
}
/**
 * Applies the transactions in a block, computing the receipts
 * as well as gas usage and some relevant data. This method is
 * side-effect free (it doesn't modify the block nor the state).
 * @param {Block} block
 * @param {RunBlockOpts} opts
 */
async function applyTransactions(block, opts) {
    const bloom = new bloom_1.default();
    // the total amount of gas used processing these transactions
    let gasUsed = BigInt(0);
    const receiptTrie = new trie_1.BaseTrie();
    const receipts = [];
    const txResults = [];
    /*
     * Process transactions
     */
    for (let txIdx = 0; txIdx < block.transactions.length; txIdx++) {
        const tx = block.transactions[txIdx];
        let maxGasLimit;
        if (this._common.isActivatedEIP(1559)) {
            maxGasLimit = block.header.gasLimit * this._common.param('gasConfig', 'elasticityMultiplier');
        }
        else {
            maxGasLimit = block.header.gasLimit;
        }
        const gasLimitIsHigherThanBlock = maxGasLimit < tx.gasLimit + gasUsed;
        if (gasLimitIsHigherThanBlock) {
            const msg = _errorMsg('tx has a higher gas limit than the block', this, block);
            throw new Error(msg);
        }
        // Run the tx through the VM
        const { skipBalance, skipNonce } = opts;
        const txRes = await this.runTx({
            tx,
            block,
            skipBalance,
            skipNonce,
            blockGasUsed: gasUsed,
        });
        txResults.push(txRes);
        if (this.DEBUG) {
            debug('-'.repeat(100));
        }
        // Add to total block gas usage
        gasUsed += txRes.gasUsed;
        if (this.DEBUG) {
            debug(`Add tx gas used (${txRes.gasUsed}) to total block gas usage (-> ${gasUsed})`);
        }
        // Combine blooms via bitwise OR
        bloom.or(txRes.bloom);
        // Add receipt to trie to later calculate receipt root
        receipts.push(txRes.receipt);
        const encodedReceipt = encodeReceipt(txRes.receipt, tx.type);
        await receiptTrie.put(Buffer.from(rlp_1.default.encode(txIdx)), encodedReceipt);
    }
    return {
        bloom,
        gasUsed,
        receiptRoot: receiptTrie.root,
        receipts,
        results: txResults,
    };
}
/**
 * Calculates block rewards for miner and ommers and puts
 * the updated balances of their accounts to state.
 */
async function assignBlockRewards(block) {
    if (this.DEBUG) {
        debug(`Assign block rewards`);
    }
    const state = this.vmState;
    const minerReward = this._common.param('pow', 'minerReward');
    const ommers = block.uncleHeaders;
    // Reward ommers
    for (const ommer of ommers) {
        const reward = calculateOmmerReward(ommer.number, block.header.number, minerReward);
        const account = await rewardAccount(state, ommer.coinbase, reward);
        if (this.DEBUG) {
            debug(`Add uncle reward ${reward} to account ${ommer.coinbase} (-> ${account.balance})`);
        }
    }
    // Reward miner
    const reward = calculateMinerReward(minerReward, ommers.length);
    const account = await rewardAccount(state, block.header.coinbase, reward);
    if (this.DEBUG) {
        debug(`Add miner reward ${reward} to account ${block.header.coinbase} (-> ${account.balance})`);
    }
}
function calculateOmmerReward(ommerBlockNumber, blockNumber, minerReward) {
    const heightDiff = blockNumber - ommerBlockNumber;
    let reward = ((BigInt(8) - heightDiff) * minerReward) / BigInt(8);
    if (reward < BigInt(0)) {
        reward = BigInt(0);
    }
    return reward;
}
function calculateMinerReward(minerReward, ommersNum) {
    // calculate nibling reward
    const niblingReward = minerReward / BigInt(32);
    const totalNiblingReward = niblingReward * BigInt(ommersNum);
    const reward = minerReward + totalNiblingReward;
    return reward;
}
exports.calculateMinerReward = calculateMinerReward;
async function rewardAccount(state, address, reward) {
    const account = await state.getAccount(address);
    account.balance += reward;
    await state.putAccount(address, account);
    return account;
}
exports.rewardAccount = rewardAccount;
/**
 * Returns the encoded tx receipt.
 */
function encodeReceipt(receipt, txType) {
    const encoded = Buffer.from(rlp_1.default.encode((0, util_1.bufArrToArr)([
        receipt.stateRoot ??
            (receipt.status === 0
                ? Buffer.from([])
                : Buffer.from('01', 'hex')),
        (0, util_1.bigIntToBuffer)(receipt.gasUsed),
        receipt.bitvector,
        receipt.logs,
    ])));
    if (txType === 0) {
        return encoded;
    }
    // Serialize receipt according to EIP-2718:
    // `typed-receipt = tx-type || receipt-data`
    return Buffer.concat([(0, util_1.intToBuffer)(txType), encoded]);
}
exports.encodeReceipt = encodeReceipt;
/**
 * Apply the DAO fork changes to the VM
 */
async function _applyDAOHardfork(state) {
    const DAORefundContractAddress = new util_1.Address(Buffer.from(DAORefundContract, 'hex'));
    if (!state.accountExists(DAORefundContractAddress)) {
        await state.putAccount(DAORefundContractAddress, new util_1.Account());
    }
    const DAORefundAccount = await state.getAccount(DAORefundContractAddress);
    for (const addr of DAOAccountList) {
        // retrieve the account and add it to the DAO's Refund accounts' balance.
        const address = new util_1.Address(Buffer.from(addr, 'hex'));
        const account = await state.getAccount(address);
        DAORefundAccount.balance += account.balance;
        // clear the accounts' balance
        account.balance = BigInt(0);
        await state.putAccount(address, account);
    }
    // finally, put the Refund Account
    await state.putAccount(DAORefundContractAddress, DAORefundAccount);
}
async function _genTxTrie(block) {
    const trie = new trie_1.BaseTrie();
    for (const [i, tx] of block.transactions.entries()) {
        await trie.put(Buffer.from(rlp_1.default.encode(i)), tx.serialize());
    }
    return trie.root;
}
/**
 * Internal helper function to create an annotated error message
 *
 * @param msg Base error message
 * @hidden
 */
function _errorMsg(msg, vm, block) {
    const blockErrorStr = 'errorStr' in block ? block.errorStr() : 'block';
    const errorMsg = `${msg} (${vm.errorStr()} -> ${blockErrorStr})`;
    return errorMsg;
}
//# sourceMappingURL=runBlock.js.map