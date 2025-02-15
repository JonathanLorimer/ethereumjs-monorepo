"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockHeader = void 0;
const common_1 = __importStar(require("@ethereumjs/common"));
const keccak_1 = require("ethereum-cryptography/keccak");
const util_1 = require("@ethereumjs/util");
const rlp_1 = __importDefault(require("rlp"));
const clique_1 = require("./clique");
const DEFAULT_GAS_LIMIT = BigInt('0xffffffffffffff');
/**
 * An object that represents the block header.
 */
class BlockHeader {
    /**
     * This constructor takes the values, validates them, assigns them and freezes the object.
     *
     * @deprecated Use the public static factory methods to assist in creating a Header object from
     * varying data types. For a default empty header, use {@link BlockHeader.fromHeaderData}.
     *
     */
    constructor(headerData, options = {}) {
        this.cache = {
            hash: undefined,
        };
        if (options.common) {
            this._common = options.common.copy();
        }
        else {
            this._common = new common_1.default({
                chain: common_1.Chain.Mainnet, // default
            });
        }
        if (options.hardforkByBlockNumber !== undefined && options.hardforkByTD !== undefined) {
            throw new Error(`The hardforkByBlockNumber and hardforkByTD options can't be used in conjunction`);
        }
        const defaults = {
            parentHash: (0, util_1.zeros)(32),
            uncleHash: util_1.KECCAK256_RLP_ARRAY,
            coinbase: util_1.Address.zero(),
            stateRoot: (0, util_1.zeros)(32),
            transactionsTrie: util_1.KECCAK256_RLP,
            receiptTrie: util_1.KECCAK256_RLP,
            logsBloom: (0, util_1.zeros)(256),
            difficulty: BigInt(0),
            number: BigInt(0),
            gasLimit: DEFAULT_GAS_LIMIT,
            gasUsed: BigInt(0),
            timestamp: BigInt(0),
            extraData: Buffer.from([]),
            mixHash: (0, util_1.zeros)(32),
            nonce: (0, util_1.zeros)(8),
            baseFeePerGas: undefined,
        };
        const parentHash = (0, util_1.toType)(headerData.parentHash, util_1.TypeOutput.Buffer) ?? defaults.parentHash;
        const uncleHash = (0, util_1.toType)(headerData.uncleHash, util_1.TypeOutput.Buffer) ?? defaults.uncleHash;
        const coinbase = headerData.coinbase
            ? new util_1.Address((0, util_1.toType)(headerData.coinbase, util_1.TypeOutput.Buffer))
            : defaults.coinbase;
        const stateRoot = (0, util_1.toType)(headerData.stateRoot, util_1.TypeOutput.Buffer) ?? defaults.stateRoot;
        const transactionsTrie = (0, util_1.toType)(headerData.transactionsTrie, util_1.TypeOutput.Buffer) ?? defaults.transactionsTrie;
        const receiptTrie = (0, util_1.toType)(headerData.receiptTrie, util_1.TypeOutput.Buffer) ?? defaults.receiptTrie;
        const logsBloom = (0, util_1.toType)(headerData.logsBloom, util_1.TypeOutput.Buffer) ?? defaults.logsBloom;
        const difficulty = (0, util_1.toType)(headerData.difficulty, util_1.TypeOutput.BigInt) ?? defaults.difficulty;
        const number = (0, util_1.toType)(headerData.number, util_1.TypeOutput.BigInt) ?? defaults.number;
        const gasLimit = (0, util_1.toType)(headerData.gasLimit, util_1.TypeOutput.BigInt) ?? defaults.gasLimit;
        const gasUsed = (0, util_1.toType)(headerData.gasUsed, util_1.TypeOutput.BigInt) ?? defaults.gasUsed;
        const timestamp = (0, util_1.toType)(headerData.timestamp, util_1.TypeOutput.BigInt) ?? defaults.timestamp;
        const extraData = (0, util_1.toType)(headerData.extraData, util_1.TypeOutput.Buffer) ?? defaults.extraData;
        const mixHash = (0, util_1.toType)(headerData.mixHash, util_1.TypeOutput.Buffer) ?? defaults.mixHash;
        const nonce = (0, util_1.toType)(headerData.nonce, util_1.TypeOutput.Buffer) ?? defaults.nonce;
        let baseFeePerGas = (0, util_1.toType)(headerData.baseFeePerGas, util_1.TypeOutput.BigInt) ?? defaults.baseFeePerGas;
        const hardforkByBlockNumber = options.hardforkByBlockNumber ?? false;
        if (hardforkByBlockNumber || options.hardforkByTD !== undefined) {
            this._common.setHardforkByBlockNumber(number, options.hardforkByTD);
        }
        if (this._common.isActivatedEIP(1559)) {
            if (baseFeePerGas === undefined) {
                const londonHfBlock = this._common.hardforkBlock(common_1.Hardfork.London);
                const isInitialEIP1559Block = number === londonHfBlock;
                if (isInitialEIP1559Block) {
                    baseFeePerGas = this._common.param('gasConfig', 'initialBaseFee');
                }
                else {
                    // Minimum possible value for baseFeePerGas is 7,
                    // so we use it as the default if the field is missing.
                    baseFeePerGas = BigInt(7);
                }
            }
        }
        else {
            if (baseFeePerGas) {
                throw new Error('A base fee for a block can only be set with EIP1559 being activated');
            }
        }
        this.parentHash = parentHash;
        this.uncleHash = uncleHash;
        this.coinbase = coinbase;
        this.stateRoot = stateRoot;
        this.transactionsTrie = transactionsTrie;
        this.receiptTrie = receiptTrie;
        this.logsBloom = logsBloom;
        this.difficulty = difficulty;
        this.number = number;
        this.gasLimit = gasLimit;
        this.gasUsed = gasUsed;
        this.timestamp = timestamp;
        this.extraData = extraData;
        this.mixHash = mixHash;
        this.nonce = nonce;
        this.baseFeePerGas = baseFeePerGas;
        this._validateHeaderFields();
        this._validateDAOExtraData();
        // Now we have set all the values of this Header, we possibly have set a dummy
        // `difficulty` value (defaults to 0). If we have a `calcDifficultyFromHeader`
        // block option parameter, we instead set difficulty to this value.
        if (options.calcDifficultyFromHeader &&
            this._common.consensusAlgorithm() === common_1.ConsensusAlgorithm.Ethash) {
            this.difficulty = this.canonicalDifficulty(options.calcDifficultyFromHeader);
        }
        // If cliqueSigner is provided, seal block with provided privateKey.
        if (options.cliqueSigner) {
            // Ensure extraData is at least length CLIQUE_EXTRA_VANITY + CLIQUE_EXTRA_SEAL
            const minExtraDataLength = clique_1.CLIQUE_EXTRA_VANITY + clique_1.CLIQUE_EXTRA_SEAL;
            if (this.extraData.length < minExtraDataLength) {
                const remainingLength = minExtraDataLength - this.extraData.length;
                this.extraData = Buffer.concat([this.extraData, Buffer.alloc(remainingLength)]);
            }
            this.extraData = this.cliqueSealBlock(options.cliqueSigner);
        }
        const freeze = options?.freeze ?? true;
        if (freeze) {
            Object.freeze(this);
        }
    }
    /**
     * EIP-4399: After merge to PoS, `mixHash` supplanted as `prevRandao`
     *
     * Note: this is Merge-related functionality and considered `experimental`,
     * use with care.
     */
    get prevRandao() {
        if (!this._common.isActivatedEIP(4399)) {
            const msg = this._errorMsg('The prevRandao parameter can only be accessed when EIP-4399 is activated');
            throw new Error(msg);
        }
        return this.mixHash;
    }
    /**
     * Static constructor to create a block header from a header data dictionary
     *
     * @param headerData
     * @param opts
     */
    static fromHeaderData(headerData = {}, opts = {}) {
        return new BlockHeader(headerData, opts);
    }
    /**
     * Static constructor to create a block header from a RLP-serialized header
     *
     * @param headerData
     * @param opts
     */
    static fromRLPSerializedHeader(serialized, opts = {}) {
        const values = (0, util_1.arrToBufArr)(rlp_1.default.decode(Uint8Array.from(serialized)));
        if (!Array.isArray(values)) {
            throw new Error('Invalid serialized header input. Must be array');
        }
        return BlockHeader.fromValuesArray(values, opts);
    }
    /**
     * Static constructor to create a block header from an array of Buffer values
     *
     * @param values
     * @param opts
     */
    static fromValuesArray(values, opts = {}) {
        const [parentHash, uncleHash, coinbase, stateRoot, transactionsTrie, receiptTrie, logsBloom, difficulty, number, gasLimit, gasUsed, timestamp, extraData, mixHash, nonce, baseFeePerGas,] = values;
        if (values.length > 16) {
            throw new Error('invalid header. More values than expected were received');
        }
        if (values.length < 15) {
            throw new Error('invalid header. Less values than expected were received');
        }
        return new BlockHeader({
            parentHash,
            uncleHash,
            coinbase,
            stateRoot,
            transactionsTrie,
            receiptTrie,
            logsBloom,
            difficulty,
            number,
            gasLimit,
            gasUsed,
            timestamp,
            extraData,
            mixHash,
            nonce,
            baseFeePerGas,
        }, opts);
    }
    /**
     * Validates correct buffer lengths, throws if invalid.
     */
    _validateHeaderFields() {
        const { parentHash, uncleHash, stateRoot, transactionsTrie, receiptTrie, difficulty, extraData, mixHash, nonce, } = this;
        if (parentHash.length !== 32) {
            const msg = this._errorMsg(`parentHash must be 32 bytes, received ${parentHash.length} bytes`);
            throw new Error(msg);
        }
        if (stateRoot.length !== 32) {
            const msg = this._errorMsg(`stateRoot must be 32 bytes, received ${stateRoot.length} bytes`);
            throw new Error(msg);
        }
        if (transactionsTrie.length !== 32) {
            const msg = this._errorMsg(`transactionsTrie must be 32 bytes, received ${transactionsTrie.length} bytes`);
            throw new Error(msg);
        }
        if (receiptTrie.length !== 32) {
            const msg = this._errorMsg(`receiptTrie must be 32 bytes, received ${receiptTrie.length} bytes`);
            throw new Error(msg);
        }
        if (mixHash.length !== 32) {
            const msg = this._errorMsg(`mixHash must be 32 bytes, received ${mixHash.length} bytes`);
            throw new Error(msg);
        }
        if (nonce.length !== 8) {
            // Hack to check for Kovan due to non-standard nonce length (65 bytes)
            if (this._common.networkId() === BigInt(42)) {
                if (nonce.length !== 65) {
                    const msg = this._errorMsg(`nonce must be 65 bytes on kovan, received ${nonce.length} bytes`);
                    throw new Error(msg);
                }
            }
            else {
                const msg = this._errorMsg(`nonce must be 8 bytes, received ${nonce.length} bytes`);
                throw new Error(msg);
            }
        }
        // Validation for PoS blocks (EIP-3675)
        if (this._common.consensusType() === common_1.ConsensusType.ProofOfStake) {
            let error = false;
            let errorMsg = '';
            if (!uncleHash.equals(util_1.KECCAK256_RLP_ARRAY)) {
                errorMsg += `, uncleHash: ${uncleHash.toString('hex')} (expected: ${util_1.KECCAK256_RLP_ARRAY.toString('hex')})`;
                error = true;
            }
            if (difficulty !== BigInt(0)) {
                errorMsg += `, difficulty: ${difficulty} (expected: 0)`;
                error = true;
            }
            if (extraData.length > 32) {
                errorMsg += `, extraData: ${extraData.toString('hex')} (cannot exceed 32 bytes length, received ${extraData.length} bytes)`;
                error = true;
            }
            if (!nonce.equals((0, util_1.zeros)(8))) {
                errorMsg += `, nonce: ${nonce.toString('hex')} (expected: ${(0, util_1.zeros)(8).toString('hex')})`;
                error = true;
            }
            if (error) {
                const msg = this._errorMsg(`Invalid PoS block${errorMsg}`);
                throw new Error(msg);
            }
        }
    }
    /**
     * Returns the canonical difficulty for this block.
     *
     * @param parentBlockHeader - the header from the parent `Block` of this header
     */
    canonicalDifficulty(parentBlockHeader) {
        if (this._common.consensusType() !== common_1.ConsensusType.ProofOfWork) {
            const msg = this._errorMsg('difficulty calculation is only supported on PoW chains');
            throw new Error(msg);
        }
        if (this._common.consensusAlgorithm() !== common_1.ConsensusAlgorithm.Ethash) {
            const msg = this._errorMsg('difficulty calculation currently only supports the ethash algorithm');
            throw new Error(msg);
        }
        const hardfork = this._common.hardfork();
        const blockTs = this.timestamp;
        const { timestamp: parentTs, difficulty: parentDif } = parentBlockHeader;
        const minimumDifficulty = this._common.paramByHardfork('pow', 'minimumDifficulty', hardfork);
        const offset = parentDif / this._common.paramByHardfork('pow', 'difficultyBoundDivisor', hardfork);
        let num = this.number;
        // We use a ! here as TS cannot follow this hardfork-dependent logic, but it always gets assigned
        let dif;
        if (this._common.hardforkGteHardfork(hardfork, common_1.Hardfork.Byzantium)) {
            // max((2 if len(parent.uncles) else 1) - ((timestamp - parent.timestamp) // 9), -99) (EIP100)
            const uncleAddend = parentBlockHeader.uncleHash.equals(util_1.KECCAK256_RLP_ARRAY) ? 1 : 2;
            let a = BigInt(uncleAddend) - (blockTs - parentTs) / BigInt(9);
            const cutoff = BigInt(-99);
            // MAX(cutoff, a)
            if (cutoff > a) {
                a = cutoff;
            }
            dif = parentDif + offset * a;
        }
        if (this._common.hardforkGteHardfork(hardfork, common_1.Hardfork.Byzantium)) {
            // Get delay as parameter from common
            num = num - this._common.param('pow', 'difficultyBombDelay');
            if (num < BigInt(0)) {
                num = BigInt(0);
            }
        }
        else if (this._common.hardforkGteHardfork(hardfork, common_1.Hardfork.Homestead)) {
            // 1 - (block_timestamp - parent_timestamp) // 10
            let a = BigInt(1) - (blockTs - parentTs) / BigInt(10);
            const cutoff = BigInt(-99);
            // MAX(cutoff, a)
            if (cutoff > a) {
                a = cutoff;
            }
            dif = parentDif + offset * a;
        }
        else {
            // pre-homestead
            if (parentTs + this._common.paramByHardfork('pow', 'durationLimit', hardfork) > blockTs) {
                dif = offset + parentDif;
            }
            else {
                dif = parentDif - offset;
            }
        }
        const exp = num / BigInt(100000) - BigInt(2);
        if (exp >= 0) {
            // eslint-disable-next-line
            dif = dif + BigInt(2) ** exp;
        }
        if (dif < minimumDifficulty) {
            dif = minimumDifficulty;
        }
        return dif;
    }
    /**
     * Checks that the block's `difficulty` matches the canonical difficulty.
     *
     * @param parentBlockHeader - the header from the parent `Block` of this header
     */
    validateDifficulty(parentBlockHeader) {
        return this.canonicalDifficulty(parentBlockHeader) === this.difficulty;
    }
    /**
     * For poa, validates `difficulty` is correctly identified as INTURN or NOTURN.
     * Returns false if invalid.
     */
    validateCliqueDifficulty(blockchain) {
        this._requireClique('validateCliqueDifficulty');
        if (this.difficulty !== clique_1.CLIQUE_DIFF_INTURN && this.difficulty !== clique_1.CLIQUE_DIFF_NOTURN) {
            const msg = this._errorMsg(`difficulty for clique block must be INTURN (2) or NOTURN (1), received: ${this.difficulty}`);
            throw new Error(msg);
        }
        if ('cliqueActiveSigners' in blockchain.consensus === false) {
            const msg = this._errorMsg('PoA blockchain requires method blockchain.consensus.cliqueActiveSigners() to validate clique difficulty');
            throw new Error(msg);
        }
        const signers = blockchain.consensus.cliqueActiveSigners();
        if (signers.length === 0) {
            // abort if signers are unavailable
            return true;
        }
        const signerIndex = signers.findIndex((address) => address.equals(this.cliqueSigner()));
        const inTurn = this.number % BigInt(signers.length) === BigInt(signerIndex);
        if ((inTurn && this.difficulty === clique_1.CLIQUE_DIFF_INTURN) ||
            (!inTurn && this.difficulty === clique_1.CLIQUE_DIFF_NOTURN)) {
            return true;
        }
        return false;
    }
    /**
     * Validates if the block gasLimit remains in the
     * boundaries set by the protocol.
     *
     * @param parentBlockHeader - the header from the parent `Block` of this header
     */
    validateGasLimit(parentBlockHeader) {
        let parentGasLimit = parentBlockHeader.gasLimit;
        // EIP-1559: assume double the parent gas limit on fork block
        // to adopt to the new gas target centered logic
        const londonHardforkBlock = this._common.hardforkBlock(common_1.Hardfork.London);
        if (londonHardforkBlock && this.number === londonHardforkBlock) {
            const elasticity = this._common.param('gasConfig', 'elasticityMultiplier');
            parentGasLimit = parentGasLimit * elasticity;
        }
        const gasLimit = this.gasLimit;
        const hardfork = this._common.hardfork();
        const a = parentGasLimit / this._common.paramByHardfork('gasConfig', 'gasLimitBoundDivisor', hardfork);
        const maxGasLimit = parentGasLimit + a;
        const minGasLimit = parentGasLimit - a;
        const result = gasLimit < maxGasLimit &&
            gasLimit > minGasLimit &&
            gasLimit >= this._common.paramByHardfork('gasConfig', 'minGasLimit', hardfork);
        return result;
    }
    /**
     * Validates the block header, throwing if invalid. It is being validated against the reported `parentHash`.
     * It verifies the current block against the `parentHash`:
     * - The `parentHash` is part of the blockchain (it is a valid header)
     * - Current block number is parent block number + 1
     * - Current block has a strictly higher timestamp
     * - Additional PoW checks ->
     *   - Current block has valid difficulty and gas limit
     *   - In case that the header is an uncle header, it should not be too old or young in the chain.
     * - Additional PoA clique checks ->
     *   - Various extraData checks
     *   - Checks on coinbase and mixHash
     *   - Current block has a timestamp diff greater or equal to PERIOD
     *   - Current block has difficulty correctly marked as INTURN or NOTURN
     * @param blockchain - validate against an @ethereumjs/blockchain
     * @param height - If this is an uncle header, this is the height of the block that is including it
     */
    async validate(blockchain, height) {
        if (this.isGenesis()) {
            return;
        }
        const hardfork = this._common.hardfork();
        // Consensus type dependent checks
        if (this._common.consensusAlgorithm() === common_1.ConsensusAlgorithm.Ethash) {
            // PoW/Ethash
            if (this.extraData.length > this._common.paramByHardfork('vm', 'maxExtraDataSize', hardfork)) {
                const msg = this._errorMsg('invalid amount of extra data');
                throw new Error(msg);
            }
        }
        if (this._common.consensusAlgorithm() === common_1.ConsensusAlgorithm.Clique) {
            // PoA/Clique
            const minLength = clique_1.CLIQUE_EXTRA_VANITY + clique_1.CLIQUE_EXTRA_SEAL;
            if (!this.cliqueIsEpochTransition()) {
                // ExtraData length on epoch transition
                if (this.extraData.length !== minLength) {
                    const msg = this._errorMsg(`extraData must be ${minLength} bytes on non-epoch transition blocks, received ${this.extraData.length} bytes`);
                    throw new Error(msg);
                }
            }
            else {
                const signerLength = this.extraData.length - minLength;
                if (signerLength % 20 !== 0) {
                    const msg = this._errorMsg(`invalid signer list length in extraData, received signer length of ${signerLength} (not divisible by 20)`);
                    throw new Error(msg);
                }
                // coinbase (beneficiary) on epoch transition
                if (!this.coinbase.isZero()) {
                    const msg = this._errorMsg(`coinbase must be filled with zeros on epoch transition blocks, received ${this.coinbase}`);
                    throw new Error(msg);
                }
            }
            // MixHash format
            if (!this.mixHash.equals(Buffer.alloc(32))) {
                const msg = this._errorMsg(`mixHash must be filled with zeros, received ${this.mixHash}`);
                throw new Error(msg);
            }
            if (!this.validateCliqueDifficulty(blockchain)) {
                const msg = this._errorMsg(`invalid clique difficulty`);
                throw new Error(msg);
            }
        }
        const parentHeader = await this._getHeaderByHash(blockchain, this.parentHash);
        if (!parentHeader) {
            const msg = this._errorMsg('could not find parent header');
            throw new Error(msg);
        }
        const { number } = this;
        if (number !== parentHeader.number + BigInt(1)) {
            const msg = this._errorMsg('invalid number');
            throw new Error(msg);
        }
        if (this.timestamp <= parentHeader.timestamp) {
            const msg = this._errorMsg('invalid timestamp');
            throw new Error(msg);
        }
        if (this._common.consensusAlgorithm() === common_1.ConsensusAlgorithm.Clique) {
            const period = this._common.consensusConfig().period;
            // Timestamp diff between blocks is lower than PERIOD (clique)
            if (parentHeader.timestamp + BigInt(period) > this.timestamp) {
                const msg = this._errorMsg('invalid timestamp diff (lower than period)');
                throw new Error(msg);
            }
        }
        if (this._common.consensusType() === 'pow') {
            if (!this.validateDifficulty(parentHeader)) {
                const msg = this._errorMsg('invalid difficulty');
                throw new Error(msg);
            }
        }
        if (!this.validateGasLimit(parentHeader)) {
            const msg = this._errorMsg('invalid gas limit');
            throw new Error(msg);
        }
        if (height) {
            const dif = height - parentHeader.number;
            if (!(dif < BigInt(8) && dif > BigInt(1))) {
                const msg = this._errorMsg('uncle block has a parent that is too old or too young');
                throw new Error(msg);
            }
        }
        // check if the block used too much gas
        if (this.gasUsed > this.gasLimit) {
            const msg = this._errorMsg('Invalid block: too much gas used');
            throw new Error(msg);
        }
        if (this._common.isActivatedEIP(1559)) {
            if (!this.baseFeePerGas) {
                const msg = this._errorMsg('EIP1559 block has no base fee field');
                throw new Error(msg);
            }
            const londonHfBlock = this._common.hardforkBlock(common_1.Hardfork.London);
            const isInitialEIP1559Block = londonHfBlock && this.number === londonHfBlock;
            if (isInitialEIP1559Block) {
                const initialBaseFee = this._common.param('gasConfig', 'initialBaseFee');
                if (this.baseFeePerGas !== initialBaseFee) {
                    const msg = this._errorMsg('Initial EIP1559 block does not have initial base fee');
                    throw new Error(msg);
                }
            }
            else {
                // check if the base fee is correct
                const expectedBaseFee = parentHeader.calcNextBaseFee();
                if (this.baseFeePerGas !== expectedBaseFee) {
                    const msg = this._errorMsg('Invalid block: base fee not correct');
                    throw new Error(msg);
                }
            }
        }
    }
    /**
     * Calculates the base fee for a potential next block
     */
    calcNextBaseFee() {
        if (!this._common.isActivatedEIP(1559)) {
            const msg = this._errorMsg('calcNextBaseFee() can only be called with EIP1559 being activated');
            throw new Error(msg);
        }
        let nextBaseFee;
        const elasticity = this._common.param('gasConfig', 'elasticityMultiplier');
        const parentGasTarget = this.gasLimit / elasticity;
        if (parentGasTarget === this.gasUsed) {
            nextBaseFee = this.baseFeePerGas;
        }
        else if (this.gasUsed > parentGasTarget) {
            const gasUsedDelta = this.gasUsed - parentGasTarget;
            const baseFeeMaxChangeDenominator = this._common.param('gasConfig', 'baseFeeMaxChangeDenominator');
            const calculatedDelta = (this.baseFeePerGas * gasUsedDelta) / parentGasTarget / baseFeeMaxChangeDenominator;
            nextBaseFee =
                (calculatedDelta > BigInt(1) ? calculatedDelta : BigInt(1)) + this.baseFeePerGas;
        }
        else {
            const gasUsedDelta = parentGasTarget - this.gasUsed;
            const baseFeeMaxChangeDenominator = this._common.param('gasConfig', 'baseFeeMaxChangeDenominator');
            const calculatedDelta = (this.baseFeePerGas * gasUsedDelta) / parentGasTarget / baseFeeMaxChangeDenominator;
            nextBaseFee =
                this.baseFeePerGas - calculatedDelta > BigInt(0)
                    ? this.baseFeePerGas - calculatedDelta
                    : BigInt(0);
        }
        return nextBaseFee;
    }
    /**
     * Returns a Buffer Array of the raw Buffers in this header, in order.
     */
    raw() {
        const rawItems = [
            this.parentHash,
            this.uncleHash,
            this.coinbase.buf,
            this.stateRoot,
            this.transactionsTrie,
            this.receiptTrie,
            this.logsBloom,
            (0, util_1.bigIntToUnpaddedBuffer)(this.difficulty),
            (0, util_1.bigIntToUnpaddedBuffer)(this.number),
            (0, util_1.bigIntToUnpaddedBuffer)(this.gasLimit),
            (0, util_1.bigIntToUnpaddedBuffer)(this.gasUsed),
            (0, util_1.bigIntToUnpaddedBuffer)(this.timestamp ?? BigInt(0)),
            this.extraData,
            this.mixHash,
            this.nonce,
        ];
        if (this._common.isActivatedEIP(1559)) {
            rawItems.push((0, util_1.bigIntToUnpaddedBuffer)(this.baseFeePerGas));
        }
        return rawItems;
    }
    /**
     * Returns the hash of the block header.
     */
    hash() {
        if (Object.isFrozen(this)) {
            if (!this.cache.hash) {
                this.cache.hash = Buffer.from((0, keccak_1.keccak256)(rlp_1.default.encode((0, util_1.bufArrToArr)(this.raw()))));
            }
            return this.cache.hash;
        }
        return Buffer.from((0, keccak_1.keccak256)(rlp_1.default.encode((0, util_1.bufArrToArr)(this.raw()))));
    }
    /**
     * Checks if the block header is a genesis header.
     */
    isGenesis() {
        return this.number === BigInt(0);
    }
    _requireClique(name) {
        if (this._common.consensusAlgorithm() !== common_1.ConsensusAlgorithm.Clique) {
            const msg = this._errorMsg(`BlockHeader.${name}() call only supported for clique PoA networks`);
            throw new Error(msg);
        }
    }
    /**
     * PoA clique signature hash without the seal.
     */
    cliqueSigHash() {
        this._requireClique('cliqueSigHash');
        const raw = this.raw();
        raw[12] = this.extraData.slice(0, this.extraData.length - clique_1.CLIQUE_EXTRA_SEAL);
        return Buffer.from((0, keccak_1.keccak256)(rlp_1.default.encode((0, util_1.bufArrToArr)(raw))));
    }
    /**
     * Checks if the block header is an epoch transition
     * header (only clique PoA, throws otherwise)
     */
    cliqueIsEpochTransition() {
        this._requireClique('cliqueIsEpochTransition');
        const epoch = BigInt(this._common.consensusConfig().epoch);
        // Epoch transition block if the block number has no
        // remainder on the division by the epoch length
        return this.number % epoch === BigInt(0);
    }
    /**
     * Returns extra vanity data
     * (only clique PoA, throws otherwise)
     */
    cliqueExtraVanity() {
        this._requireClique('cliqueExtraVanity');
        return this.extraData.slice(0, clique_1.CLIQUE_EXTRA_VANITY);
    }
    /**
     * Returns extra seal data
     * (only clique PoA, throws otherwise)
     */
    cliqueExtraSeal() {
        this._requireClique('cliqueExtraSeal');
        return this.extraData.slice(-clique_1.CLIQUE_EXTRA_SEAL);
    }
    /**
     * Seal block with the provided signer.
     * Returns the final extraData field to be assigned to `this.extraData`.
     * @hidden
     */
    cliqueSealBlock(privateKey) {
        this._requireClique('cliqueSealBlock');
        const signature = (0, util_1.ecsign)(this.cliqueSigHash(), privateKey);
        const signatureB = Buffer.concat([
            signature.r,
            signature.s,
            (0, util_1.bigIntToBuffer)(signature.v - BigInt(27)),
        ]);
        const extraDataWithoutSeal = this.extraData.slice(0, this.extraData.length - clique_1.CLIQUE_EXTRA_SEAL);
        const extraData = Buffer.concat([extraDataWithoutSeal, signatureB]);
        return extraData;
    }
    /**
     * Returns a list of signers
     * (only clique PoA, throws otherwise)
     *
     * This function throws if not called on an epoch
     * transition block and should therefore be used
     * in conjunction with {@link BlockHeader.cliqueIsEpochTransition}
     */
    cliqueEpochTransitionSigners() {
        this._requireClique('cliqueEpochTransitionSigners');
        if (!this.cliqueIsEpochTransition()) {
            const msg = this._errorMsg('Signers are only included in epoch transition blocks (clique)');
            throw new Error(msg);
        }
        const start = clique_1.CLIQUE_EXTRA_VANITY;
        const end = this.extraData.length - clique_1.CLIQUE_EXTRA_SEAL;
        const signerBuffer = this.extraData.slice(start, end);
        const signerList = [];
        const signerLength = 20;
        for (let start = 0; start <= signerBuffer.length - signerLength; start += signerLength) {
            signerList.push(signerBuffer.slice(start, start + signerLength));
        }
        return signerList.map((buf) => new util_1.Address(buf));
    }
    /**
     * Verifies the signature of the block (last 65 bytes of extraData field)
     * (only clique PoA, throws otherwise)
     *
     *  Method throws if signature is invalid
     */
    cliqueVerifySignature(signerList) {
        this._requireClique('cliqueVerifySignature');
        const signerAddress = this.cliqueSigner();
        const signerFound = signerList.find((signer) => {
            return signer.equals(signerAddress);
        });
        return !!signerFound;
    }
    /**
     * Returns the signer address
     */
    cliqueSigner() {
        this._requireClique('cliqueSigner');
        const extraSeal = this.cliqueExtraSeal();
        // Reasonable default for default blocks
        if (extraSeal.length === 0) {
            return util_1.Address.zero();
        }
        const r = extraSeal.slice(0, 32);
        const s = extraSeal.slice(32, 64);
        const v = (0, util_1.bufferToBigInt)(extraSeal.slice(64, 65)) + BigInt(27);
        const pubKey = (0, util_1.ecrecover)(this.cliqueSigHash(), v, r, s);
        return util_1.Address.fromPublicKey(pubKey);
    }
    /**
     * Returns the rlp encoding of the block header.
     */
    serialize() {
        return Buffer.from(rlp_1.default.encode((0, util_1.bufArrToArr)(this.raw())));
    }
    /**
     * Returns the block header in JSON format.
     */
    toJSON() {
        const jsonDict = {
            parentHash: '0x' + this.parentHash.toString('hex'),
            uncleHash: '0x' + this.uncleHash.toString('hex'),
            coinbase: this.coinbase.toString(),
            stateRoot: '0x' + this.stateRoot.toString('hex'),
            transactionsTrie: '0x' + this.transactionsTrie.toString('hex'),
            receiptTrie: '0x' + this.receiptTrie.toString('hex'),
            logsBloom: '0x' + this.logsBloom.toString('hex'),
            difficulty: (0, util_1.bigIntToHex)(this.difficulty),
            number: (0, util_1.bigIntToHex)(this.number),
            gasLimit: (0, util_1.bigIntToHex)(this.gasLimit),
            gasUsed: (0, util_1.bigIntToHex)(this.gasUsed),
            timestamp: (0, util_1.bigIntToHex)(this.timestamp),
            extraData: '0x' + this.extraData.toString('hex'),
            mixHash: '0x' + this.mixHash.toString('hex'),
            nonce: '0x' + this.nonce.toString('hex'),
        };
        if (this._common.isActivatedEIP(1559)) {
            jsonDict.baseFeePerGas = (0, util_1.bigIntToHex)(this.baseFeePerGas);
        }
        return jsonDict;
    }
    async _getHeaderByHash(blockchain, hash) {
        try {
            const header = (await blockchain.getBlock(hash)).header;
            return header;
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
     * Validates extra data is DAO_ExtraData for DAO_ForceExtraDataRange blocks after DAO
     * activation block (see: https://blog.slock.it/hard-fork-specification-24b889e70703)
     */
    _validateDAOExtraData() {
        if (!this._common.hardforkIsActiveOnBlock(common_1.Hardfork.Dao, this.number)) {
            return;
        }
        const DAOActivationBlock = this._common.hardforkBlock(common_1.Hardfork.Dao);
        if (!DAOActivationBlock ||
            DAOActivationBlock === BigInt(0) ||
            this.number < DAOActivationBlock) {
            return;
        }
        const DAO_ExtraData = Buffer.from('64616f2d686172642d666f726b', 'hex');
        const DAO_ForceExtraDataRange = BigInt(9);
        const drift = this.number - DAOActivationBlock;
        if (drift <= DAO_ForceExtraDataRange && !this.extraData.equals(DAO_ExtraData)) {
            const msg = this._errorMsg("extraData should be 'dao-hard-fork'");
            throw new Error(msg);
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
        let errorStr = `block header number=${this.number} hash=${hash} `;
        errorStr += `hf=${hf} baseFeePerGas=${this.baseFeePerGas ?? 'none'}`;
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
exports.BlockHeader = BlockHeader;
//# sourceMappingURL=header.js.map