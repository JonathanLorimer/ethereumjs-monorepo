"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ETH = void 0;
const snappyjs_1 = __importDefault(require("snappyjs"));
const util_1 = require("@ethereumjs/util");
const rlp_1 = __importDefault(require("rlp"));
const util_2 = require("../util");
const protocol_1 = require("./protocol");
class ETH extends protocol_1.Protocol {
    constructor(version, peer, send) {
        super(peer, send, protocol_1.EthProtocol.ETH, version, ETH.MESSAGE_CODES);
        this._status = null;
        this._peerStatus = null;
        // Eth64
        this._hardfork = 'chainstart';
        this._latestBlock = BigInt(0);
        this._forkHash = '';
        this._nextForkBlock = BigInt(0);
        // Set forkHash and nextForkBlock
        if (this._version >= 64) {
            const c = this._peer._common;
            this._hardfork = c.hardfork() ? c.hardfork() : this._hardfork;
            // Set latestBlock minimally to start block of fork to have some more
            // accurate basis if no latestBlock is provided along status send
            this._latestBlock = c.hardforkBlock(this._hardfork) ?? BigInt(0);
            this._forkHash = c.forkHash(this._hardfork);
            // Next fork block number or 0 if none available
            this._nextForkBlock = c.nextHardforkBlock(this._hardfork) ?? BigInt(0);
        }
    }
    _handleMessage(code, data) {
        const payload = (0, util_1.arrToBufArr)(rlp_1.default.decode((0, util_1.bufArrToArr)(data)));
        const messageName = this.getMsgPrefix(code);
        const debugMsg = `Received ${messageName} message from ${this._peer._socket.remoteAddress}:${this._peer._socket.remotePort}`;
        if (code !== ETH.MESSAGE_CODES.STATUS) {
            const logData = (0, util_2.formatLogData)(data.toString('hex'), this._verbose);
            this.debug(messageName, `${debugMsg}: ${logData}`);
        }
        switch (code) {
            case ETH.MESSAGE_CODES.STATUS: {
                (0, util_2.assertEq)(this._peerStatus, null, 'Uncontrolled status message', this.debug.bind(this), 'STATUS');
                this._peerStatus = payload;
                const peerStatusMsg = `${this._peerStatus ? this._getStatusString(this._peerStatus) : ''}`;
                this.debug(messageName, `${debugMsg}: ${peerStatusMsg}`);
                this._handleStatus();
                break;
            }
            case ETH.MESSAGE_CODES.NEW_BLOCK_HASHES:
            case ETH.MESSAGE_CODES.TX:
            case ETH.MESSAGE_CODES.GET_BLOCK_HEADERS:
            case ETH.MESSAGE_CODES.BLOCK_HEADERS:
            case ETH.MESSAGE_CODES.GET_BLOCK_BODIES:
            case ETH.MESSAGE_CODES.BLOCK_BODIES:
            case ETH.MESSAGE_CODES.NEW_BLOCK:
                if (this._version >= ETH.eth62.version)
                    break;
                return;
            case ETH.MESSAGE_CODES.GET_NODE_DATA:
            case ETH.MESSAGE_CODES.NODE_DATA:
            case ETH.MESSAGE_CODES.GET_RECEIPTS:
            case ETH.MESSAGE_CODES.RECEIPTS:
                if (this._version >= ETH.eth63.version)
                    break;
                return;
            case ETH.MESSAGE_CODES.NEW_POOLED_TRANSACTION_HASHES:
            case ETH.MESSAGE_CODES.GET_POOLED_TRANSACTIONS:
            case ETH.MESSAGE_CODES.POOLED_TRANSACTIONS:
                if (this._version >= ETH.eth65.version)
                    break;
                return;
            default:
                return;
        }
        this.emit('message', code, payload);
    }
    /**
     * Eth 64 Fork ID validation (EIP-2124)
     * @param forkId Remote fork ID
     */
    _validateForkId(forkId) {
        const c = this._peer._common;
        const peerForkHash = (0, util_1.bufferToHex)(forkId[0]);
        const peerNextFork = (0, util_1.bufferToBigInt)(forkId[1]);
        if (this._forkHash === peerForkHash) {
            // There is a known next fork
            if (peerNextFork > BigInt(0)) {
                if (this._latestBlock >= peerNextFork) {
                    const msg = 'Remote is advertising a future fork that passed locally';
                    this.debug('STATUS', msg);
                    throw new Error(msg);
                }
            }
        }
        const peerFork = c.hardforkForForkHash(peerForkHash);
        if (peerFork === null) {
            const msg = 'Unknown fork hash';
            this.debug('STATUS', msg);
            throw new Error(msg);
        }
        if (!c.hardforkGteHardfork(peerFork.name, this._hardfork)) {
            const nextHardforkBlock = c.nextHardforkBlock(peerFork.name);
            if (peerNextFork === null || !nextHardforkBlock || nextHardforkBlock !== peerNextFork) {
                const msg = 'Outdated fork status, remote needs software update';
                this.debug('STATUS', msg);
                throw new Error(msg);
            }
        }
    }
    _handleStatus() {
        if (this._status === null || this._peerStatus === null)
            return;
        clearTimeout(this._statusTimeoutId);
        (0, util_2.assertEq)(this._status[0], this._peerStatus[0], 'Protocol version mismatch', this.debug.bind(this), 'STATUS');
        (0, util_2.assertEq)(this._status[1], this._peerStatus[1], 'NetworkId mismatch', this.debug.bind(this), 'STATUS');
        (0, util_2.assertEq)(this._status[4], this._peerStatus[4], 'Genesis block mismatch', this.debug.bind(this), 'STATUS');
        const status = {
            networkId: this._peerStatus[1],
            td: Buffer.from(this._peerStatus[2]),
            bestHash: Buffer.from(this._peerStatus[3]),
            genesisHash: Buffer.from(this._peerStatus[4]),
        };
        if (this._version >= 64) {
            (0, util_2.assertEq)(this._peerStatus[5].length, 2, 'Incorrect forkId msg format', this.debug.bind(this), 'STATUS');
            this._validateForkId(this._peerStatus[5]);
            status['forkId'] = this._peerStatus[5];
        }
        this.emit('status', status);
        if (this._firstPeer === '') {
            this._addFirstPeerDebugger();
        }
    }
    getVersion() {
        return this._version;
    }
    _forkHashFromForkId(forkId) {
        return `0x${forkId.toString('hex')}`;
    }
    _nextForkFromForkId(forkId) {
        return (0, util_2.buffer2int)(forkId);
    }
    _getStatusString(status) {
        let sStr = `[V:${(0, util_2.buffer2int)(status[0])}, NID:${(0, util_2.buffer2int)(status[1])}, TD:${status[2].length === 0 ? 0 : (0, util_2.buffer2int)(status[2])}`;
        sStr += `, BestH:${(0, util_2.formatLogId)(status[3].toString('hex'), this._verbose)}, GenH:${(0, util_2.formatLogId)(status[4].toString('hex'), this._verbose)}`;
        if (this._version >= 64) {
            sStr += `, ForkHash: ${status[5] ? '0x' + status[5][0].toString('hex') : '-'}`;
            sStr += `, ForkNext: ${status[5][1].length > 0 ? (0, util_2.buffer2int)(status[5][1]) : '-'}`;
        }
        sStr += `]`;
        return sStr;
    }
    sendStatus(status) {
        if (this._status !== null)
            return;
        this._status = [
            (0, util_2.int2buffer)(this._version),
            (0, util_1.bigIntToBuffer)(this._peer._common.chainId()),
            status.td,
            status.bestHash,
            status.genesisHash,
        ];
        if (this._version >= 64) {
            if (status.latestBlock) {
                const latestBlock = (0, util_1.bufferToBigInt)(status.latestBlock);
                if (latestBlock < this._latestBlock) {
                    throw new Error('latest block provided is not matching the HF setting of the Common instance (Rlpx)');
                }
                this._latestBlock = latestBlock;
            }
            const forkHashB = Buffer.from(this._forkHash.substr(2), 'hex');
            const nextForkB = this._nextForkBlock === BigInt(0)
                ? Buffer.from('', 'hex')
                : (0, util_1.bigIntToBuffer)(this._nextForkBlock);
            this._status.push([forkHashB, nextForkB]);
        }
        this.debug('STATUS', `Send STATUS message to ${this._peer._socket.remoteAddress}:${this._peer._socket.remotePort} (eth${this._version}): ${this._getStatusString(this._status)}`);
        let payload = Buffer.from(rlp_1.default.encode((0, util_1.bufArrToArr)(this._status)));
        // Use snappy compression if peer supports DevP2P >=v5
        if (this._peer._hello?.protocolVersion && this._peer._hello?.protocolVersion >= 5) {
            payload = snappyjs_1.default.compress(payload);
        }
        this._send(ETH.MESSAGE_CODES.STATUS, payload);
        this._handleStatus();
    }
    sendMessage(code, payload) {
        const messageName = this.getMsgPrefix(code);
        const logData = (0, util_2.formatLogData)(Buffer.from(rlp_1.default.encode((0, util_1.bufArrToArr)(payload))).toString('hex'), this._verbose);
        const debugMsg = `Send ${messageName} message to ${this._peer._socket.remoteAddress}:${this._peer._socket.remotePort}: ${logData}`;
        this.debug(messageName, debugMsg);
        switch (code) {
            case ETH.MESSAGE_CODES.STATUS:
                throw new Error('Please send status message through .sendStatus');
            case ETH.MESSAGE_CODES.NEW_BLOCK_HASHES:
            case ETH.MESSAGE_CODES.TX:
            case ETH.MESSAGE_CODES.GET_BLOCK_HEADERS:
            case ETH.MESSAGE_CODES.BLOCK_HEADERS:
            case ETH.MESSAGE_CODES.GET_BLOCK_BODIES:
            case ETH.MESSAGE_CODES.BLOCK_BODIES:
            case ETH.MESSAGE_CODES.NEW_BLOCK:
                if (this._version >= ETH.eth62.version)
                    break;
                throw new Error(`Code ${code} not allowed with version ${this._version}`);
            case ETH.MESSAGE_CODES.GET_NODE_DATA:
            case ETH.MESSAGE_CODES.NODE_DATA:
            case ETH.MESSAGE_CODES.GET_RECEIPTS:
            case ETH.MESSAGE_CODES.RECEIPTS:
                if (this._version >= ETH.eth63.version)
                    break;
                throw new Error(`Code ${code} not allowed with version ${this._version}`);
            case ETH.MESSAGE_CODES.NEW_POOLED_TRANSACTION_HASHES:
            case ETH.MESSAGE_CODES.GET_POOLED_TRANSACTIONS:
            case ETH.MESSAGE_CODES.POOLED_TRANSACTIONS:
                if (this._version >= ETH.eth65.version)
                    break;
                throw new Error(`Code ${code} not allowed with version ${this._version}`);
            default:
                throw new Error(`Unknown code ${code}`);
        }
        payload = Buffer.from(rlp_1.default.encode((0, util_1.bufArrToArr)(payload)));
        // Use snappy compression if peer supports DevP2P >=v5
        if (this._peer._hello?.protocolVersion && this._peer._hello?.protocolVersion >= 5) {
            payload = snappyjs_1.default.compress(payload);
        }
        this._send(code, payload);
    }
    getMsgPrefix(msgCode) {
        return ETH.MESSAGE_CODES[msgCode];
    }
}
exports.ETH = ETH;
ETH.eth62 = { name: 'eth', version: 62, length: 8, constructor: ETH };
ETH.eth63 = { name: 'eth', version: 63, length: 17, constructor: ETH };
ETH.eth64 = { name: 'eth', version: 64, length: 29, constructor: ETH };
ETH.eth65 = { name: 'eth', version: 65, length: 29, constructor: ETH };
ETH.eth66 = { name: 'eth', version: 66, length: 29, constructor: ETH };
(function (ETH) {
    let MESSAGE_CODES;
    (function (MESSAGE_CODES) {
        // eth62
        MESSAGE_CODES[MESSAGE_CODES["STATUS"] = 0] = "STATUS";
        MESSAGE_CODES[MESSAGE_CODES["NEW_BLOCK_HASHES"] = 1] = "NEW_BLOCK_HASHES";
        MESSAGE_CODES[MESSAGE_CODES["TX"] = 2] = "TX";
        MESSAGE_CODES[MESSAGE_CODES["GET_BLOCK_HEADERS"] = 3] = "GET_BLOCK_HEADERS";
        MESSAGE_CODES[MESSAGE_CODES["BLOCK_HEADERS"] = 4] = "BLOCK_HEADERS";
        MESSAGE_CODES[MESSAGE_CODES["GET_BLOCK_BODIES"] = 5] = "GET_BLOCK_BODIES";
        MESSAGE_CODES[MESSAGE_CODES["BLOCK_BODIES"] = 6] = "BLOCK_BODIES";
        MESSAGE_CODES[MESSAGE_CODES["NEW_BLOCK"] = 7] = "NEW_BLOCK";
        // eth63
        MESSAGE_CODES[MESSAGE_CODES["GET_NODE_DATA"] = 13] = "GET_NODE_DATA";
        MESSAGE_CODES[MESSAGE_CODES["NODE_DATA"] = 14] = "NODE_DATA";
        MESSAGE_CODES[MESSAGE_CODES["GET_RECEIPTS"] = 15] = "GET_RECEIPTS";
        MESSAGE_CODES[MESSAGE_CODES["RECEIPTS"] = 16] = "RECEIPTS";
        // eth65
        MESSAGE_CODES[MESSAGE_CODES["NEW_POOLED_TRANSACTION_HASHES"] = 8] = "NEW_POOLED_TRANSACTION_HASHES";
        MESSAGE_CODES[MESSAGE_CODES["GET_POOLED_TRANSACTIONS"] = 9] = "GET_POOLED_TRANSACTIONS";
        MESSAGE_CODES[MESSAGE_CODES["POOLED_TRANSACTIONS"] = 10] = "POOLED_TRANSACTIONS";
    })(MESSAGE_CODES = ETH.MESSAGE_CODES || (ETH.MESSAGE_CODES = {}));
})(ETH = exports.ETH || (exports.ETH = {}));
//# sourceMappingURL=eth.js.map