"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LES = exports.DEFAULT_ANNOUNCE_TYPE = void 0;
const util_1 = require("@ethereumjs/util");
const rlp_1 = __importDefault(require("rlp"));
const ms_1 = __importDefault(require("ms"));
const snappyjs_1 = __importDefault(require("snappyjs"));
const util_2 = require("../util");
const peer_1 = require("../rlpx/peer");
const protocol_1 = require("./protocol");
exports.DEFAULT_ANNOUNCE_TYPE = 1;
class LES extends protocol_1.Protocol {
    constructor(version, peer, send) {
        super(peer, send, protocol_1.EthProtocol.LES, version, LES.MESSAGE_CODES);
        this._status = null;
        this._peerStatus = null;
        this._statusTimeoutId = setTimeout(() => {
            this._peer.disconnect(peer_1.DISCONNECT_REASONS.TIMEOUT);
        }, (0, ms_1.default)('5s'));
    }
    _handleMessage(code, data) {
        const payload = (0, util_1.arrToBufArr)(rlp_1.default.decode((0, util_1.bufArrToArr)(data)));
        const messageName = this.getMsgPrefix(code);
        const debugMsg = `Received ${messageName} message from ${this._peer._socket.remoteAddress}:${this._peer._socket.remotePort}`;
        if (code !== LES.MESSAGE_CODES.STATUS) {
            const logData = (0, util_2.formatLogData)(data.toString('hex'), this._verbose);
            this.debug(messageName, `${debugMsg}: ${logData}`);
        }
        switch (code) {
            case LES.MESSAGE_CODES.STATUS: {
                (0, util_2.assertEq)(this._peerStatus, null, 'Uncontrolled status message', this.debug.bind(this), 'STATUS');
                const statusArray = {};
                payload.forEach(function (value) {
                    statusArray[value[0].toString()] = value[1];
                });
                this._peerStatus = statusArray;
                const peerStatusMsg = `${this._peerStatus ? this._getStatusString(this._peerStatus) : ''}`;
                this.debug(messageName, `${debugMsg}: ${peerStatusMsg}`);
                this._handleStatus();
                break;
            }
            case LES.MESSAGE_CODES.ANNOUNCE:
            case LES.MESSAGE_CODES.GET_BLOCK_HEADERS:
            case LES.MESSAGE_CODES.BLOCK_HEADERS:
            case LES.MESSAGE_CODES.GET_BLOCK_BODIES:
            case LES.MESSAGE_CODES.BLOCK_BODIES:
            case LES.MESSAGE_CODES.GET_RECEIPTS:
            case LES.MESSAGE_CODES.RECEIPTS:
            case LES.MESSAGE_CODES.GET_PROOFS:
            case LES.MESSAGE_CODES.PROOFS:
            case LES.MESSAGE_CODES.GET_CONTRACT_CODES:
            case LES.MESSAGE_CODES.CONTRACT_CODES:
            case LES.MESSAGE_CODES.GET_HEADER_PROOFS:
            case LES.MESSAGE_CODES.HEADER_PROOFS:
            case LES.MESSAGE_CODES.SEND_TX:
            case LES.MESSAGE_CODES.GET_PROOFS_V2:
            case LES.MESSAGE_CODES.PROOFS_V2:
            case LES.MESSAGE_CODES.GET_HELPER_TRIE_PROOFS:
            case LES.MESSAGE_CODES.HELPER_TRIE_PROOFS:
            case LES.MESSAGE_CODES.SEND_TX_V2:
            case LES.MESSAGE_CODES.GET_TX_STATUS:
            case LES.MESSAGE_CODES.TX_STATUS:
                if (this._version >= LES.les2.version)
                    break;
                return;
            case LES.MESSAGE_CODES.STOP_MSG:
            case LES.MESSAGE_CODES.RESUME_MSG:
                if (this._version >= LES.les3.version)
                    break;
                return;
            default:
                return;
        }
        this.emit('message', code, payload);
    }
    _handleStatus() {
        if (this._status === null || this._peerStatus === null)
            return;
        clearTimeout(this._statusTimeoutId);
        (0, util_2.assertEq)(this._status['protocolVersion'], this._peerStatus['protocolVersion'], 'Protocol version mismatch', this.debug.bind(this), 'STATUS');
        (0, util_2.assertEq)(this._status['networkId'], this._peerStatus['networkId'], 'NetworkId mismatch', this.debug.bind(this), 'STATUS');
        (0, util_2.assertEq)(this._status['genesisHash'], this._peerStatus['genesisHash'], 'Genesis block mismatch', this.debug.bind(this), 'STATUS');
        this.emit('status', this._peerStatus);
        if (this._firstPeer === '') {
            this._addFirstPeerDebugger();
        }
    }
    getVersion() {
        return this._version;
    }
    _getStatusString(status) {
        let sStr = `[V:${(0, util_2.buffer2int)(status['protocolVersion'])}, `;
        sStr += `NID:${(0, util_2.buffer2int)(status['networkId'])}, HTD:${(0, util_2.buffer2int)(status['headTd'])}, `;
        sStr += `HeadH:${status['headHash'].toString('hex')}, HeadN:${(0, util_2.buffer2int)(status['headNum'])}, `;
        sStr += `GenH:${status['genesisHash'].toString('hex')}`;
        if (status['serveHeaders'])
            sStr += `, serveHeaders active`;
        if (status['serveChainSince'])
            sStr += `, ServeCS: ${(0, util_2.buffer2int)(status['serveChainSince'])}`;
        if (status['serveStateSince'])
            sStr += `, ServeSS: ${(0, util_2.buffer2int)(status['serveStateSince'])}`;
        if (status['txRelay'])
            sStr += `, txRelay active`;
        if (status['flowControl/BL'])
            sStr += `, flowControl/BL set`;
        if (status['flowControl/MRR'])
            sStr += `, flowControl/MRR set`;
        if (status['flowControl/MRC'])
            sStr += `, flowControl/MRC set`;
        if (status['forkID'])
            sStr += `, forkID: [crc32: ${status['forkID'][0].toString('hex')}, nextFork: ${(0, util_2.buffer2int)(status['forkID'][1])}]`;
        if (status['recentTxLookup'])
            sStr += `, recentTxLookup: ${(0, util_2.buffer2int)(status['recentTxLookup'])}`;
        sStr += `]`;
        return sStr;
    }
    sendStatus(status) {
        if (this._status !== null)
            return;
        if (!status.announceType) {
            status['announceType'] = (0, util_2.int2buffer)(exports.DEFAULT_ANNOUNCE_TYPE);
        }
        status['protocolVersion'] = (0, util_2.int2buffer)(this._version);
        status['networkId'] = (0, util_1.bigIntToBuffer)(this._peer._common.chainId());
        this._status = status;
        const statusList = [];
        Object.keys(status).forEach((key) => {
            statusList.push([Buffer.from(key), status[key]]);
        });
        this.debug('STATUS', `Send STATUS message to ${this._peer._socket.remoteAddress}:${this._peer._socket.remotePort} (les${this._version}): ${this._getStatusString(this._status)}`);
        let payload = Buffer.from(rlp_1.default.encode((0, util_1.bufArrToArr)(statusList)));
        // Use snappy compression if peer supports DevP2P >=v5
        if (this._peer._hello?.protocolVersion && this._peer._hello?.protocolVersion >= 5) {
            payload = snappyjs_1.default.compress(payload);
        }
        this._send(LES.MESSAGE_CODES.STATUS, payload);
        this._handleStatus();
    }
    /**
     *
     * @param code Message code
     * @param payload Payload (including reqId, e.g. `[1, [437000, 1, 0, 0]]`)
     */
    sendMessage(code, payload) {
        const messageName = this.getMsgPrefix(code);
        const logData = (0, util_2.formatLogData)(Buffer.from(rlp_1.default.encode((0, util_1.bufArrToArr)(payload))).toString('hex'), this._verbose);
        const debugMsg = `Send ${messageName} message to ${this._peer._socket.remoteAddress}:${this._peer._socket.remotePort}: ${logData}`;
        this.debug(messageName, debugMsg);
        switch (code) {
            case LES.MESSAGE_CODES.STATUS:
                throw new Error('Please send status message through .sendStatus');
            case LES.MESSAGE_CODES.ANNOUNCE: // LES/1
            case LES.MESSAGE_CODES.GET_BLOCK_HEADERS:
            case LES.MESSAGE_CODES.BLOCK_HEADERS:
            case LES.MESSAGE_CODES.GET_BLOCK_BODIES:
            case LES.MESSAGE_CODES.BLOCK_BODIES:
            case LES.MESSAGE_CODES.GET_RECEIPTS:
            case LES.MESSAGE_CODES.RECEIPTS:
            case LES.MESSAGE_CODES.GET_PROOFS:
            case LES.MESSAGE_CODES.PROOFS:
            case LES.MESSAGE_CODES.GET_CONTRACT_CODES:
            case LES.MESSAGE_CODES.CONTRACT_CODES:
            case LES.MESSAGE_CODES.GET_HEADER_PROOFS:
            case LES.MESSAGE_CODES.HEADER_PROOFS:
            case LES.MESSAGE_CODES.SEND_TX:
            case LES.MESSAGE_CODES.GET_PROOFS_V2: // LES/2
            case LES.MESSAGE_CODES.PROOFS_V2:
            case LES.MESSAGE_CODES.GET_HELPER_TRIE_PROOFS:
            case LES.MESSAGE_CODES.HELPER_TRIE_PROOFS:
            case LES.MESSAGE_CODES.SEND_TX_V2:
            case LES.MESSAGE_CODES.GET_TX_STATUS:
            case LES.MESSAGE_CODES.TX_STATUS:
                if (this._version >= LES.les2.version)
                    break;
                throw new Error(`Code ${code} not allowed with version ${this._version}`);
            case LES.MESSAGE_CODES.STOP_MSG:
            case LES.MESSAGE_CODES.RESUME_MSG:
                if (this._version >= LES.les3.version)
                    break;
                throw new Error(`Code ${code} not allowed with version ${this._version}`);
            default:
                throw new Error(`Unknown code ${code}`);
        }
        payload = Buffer.from(rlp_1.default.encode(payload));
        // Use snappy compression if peer supports DevP2P >=v5
        if (this._peer._hello?.protocolVersion && this._peer._hello?.protocolVersion >= 5) {
            payload = snappyjs_1.default.compress(payload);
        }
        this._send(code, payload);
    }
    getMsgPrefix(msgCode) {
        return LES.MESSAGE_CODES[msgCode];
    }
}
exports.LES = LES;
LES.les2 = { name: 'les', version: 2, length: 21, constructor: LES };
LES.les3 = { name: 'les', version: 3, length: 23, constructor: LES };
LES.les4 = { name: 'les', version: 4, length: 23, constructor: LES };
(function (LES) {
    let MESSAGE_CODES;
    (function (MESSAGE_CODES) {
        // LES/1
        MESSAGE_CODES[MESSAGE_CODES["STATUS"] = 0] = "STATUS";
        MESSAGE_CODES[MESSAGE_CODES["ANNOUNCE"] = 1] = "ANNOUNCE";
        MESSAGE_CODES[MESSAGE_CODES["GET_BLOCK_HEADERS"] = 2] = "GET_BLOCK_HEADERS";
        MESSAGE_CODES[MESSAGE_CODES["BLOCK_HEADERS"] = 3] = "BLOCK_HEADERS";
        MESSAGE_CODES[MESSAGE_CODES["GET_BLOCK_BODIES"] = 4] = "GET_BLOCK_BODIES";
        MESSAGE_CODES[MESSAGE_CODES["BLOCK_BODIES"] = 5] = "BLOCK_BODIES";
        MESSAGE_CODES[MESSAGE_CODES["GET_RECEIPTS"] = 6] = "GET_RECEIPTS";
        MESSAGE_CODES[MESSAGE_CODES["RECEIPTS"] = 7] = "RECEIPTS";
        MESSAGE_CODES[MESSAGE_CODES["GET_PROOFS"] = 8] = "GET_PROOFS";
        MESSAGE_CODES[MESSAGE_CODES["PROOFS"] = 9] = "PROOFS";
        MESSAGE_CODES[MESSAGE_CODES["GET_CONTRACT_CODES"] = 10] = "GET_CONTRACT_CODES";
        MESSAGE_CODES[MESSAGE_CODES["CONTRACT_CODES"] = 11] = "CONTRACT_CODES";
        MESSAGE_CODES[MESSAGE_CODES["GET_HEADER_PROOFS"] = 13] = "GET_HEADER_PROOFS";
        MESSAGE_CODES[MESSAGE_CODES["HEADER_PROOFS"] = 14] = "HEADER_PROOFS";
        MESSAGE_CODES[MESSAGE_CODES["SEND_TX"] = 12] = "SEND_TX";
        // LES/2
        MESSAGE_CODES[MESSAGE_CODES["GET_PROOFS_V2"] = 15] = "GET_PROOFS_V2";
        MESSAGE_CODES[MESSAGE_CODES["PROOFS_V2"] = 16] = "PROOFS_V2";
        MESSAGE_CODES[MESSAGE_CODES["GET_HELPER_TRIE_PROOFS"] = 17] = "GET_HELPER_TRIE_PROOFS";
        MESSAGE_CODES[MESSAGE_CODES["HELPER_TRIE_PROOFS"] = 18] = "HELPER_TRIE_PROOFS";
        MESSAGE_CODES[MESSAGE_CODES["SEND_TX_V2"] = 19] = "SEND_TX_V2";
        MESSAGE_CODES[MESSAGE_CODES["GET_TX_STATUS"] = 20] = "GET_TX_STATUS";
        MESSAGE_CODES[MESSAGE_CODES["TX_STATUS"] = 21] = "TX_STATUS";
        // LES/3
        MESSAGE_CODES[MESSAGE_CODES["STOP_MSG"] = 22] = "STOP_MSG";
        MESSAGE_CODES[MESSAGE_CODES["RESUME_MSG"] = 23] = "RESUME_MSG";
    })(MESSAGE_CODES = LES.MESSAGE_CODES || (LES.MESSAGE_CODES = {}));
})(LES = exports.LES || (exports.LES = {}));
//# sourceMappingURL=les.js.map