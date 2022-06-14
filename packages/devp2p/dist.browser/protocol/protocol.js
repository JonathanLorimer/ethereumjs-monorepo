"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Protocol = exports.EthProtocol = void 0;
const ms_1 = __importDefault(require("ms"));
const debug_1 = require("debug");
const events_1 = require("events");
const util_1 = require("../util");
const peer_1 = require("../rlpx/peer");
var EthProtocol;
(function (EthProtocol) {
    EthProtocol["ETH"] = "eth";
    EthProtocol["LES"] = "les";
})(EthProtocol = exports.EthProtocol || (exports.EthProtocol = {}));
class Protocol extends events_1.EventEmitter {
    constructor(peer, send, protocol, version, messageCodes) {
        super();
        /**
         * Will be set to the first successfully connected peer to allow for
         * debugging with the `devp2p:FIRST_PEER` debugger
         */
        this._firstPeer = '';
        // Message debuggers (e.g. { 'GET_BLOCK_HEADERS': [debug Object], ...})
        this.msgDebuggers = {};
        this._peer = peer;
        this._send = send;
        this._version = version;
        this._messageCodes = messageCodes;
        this._statusTimeoutId = setTimeout(() => {
            this._peer.disconnect(peer_1.DISCONNECT_REASONS.TIMEOUT);
        }, (0, ms_1.default)('5s'));
        this._debug = util_1.devp2pDebug.extend(protocol);
        this._verbose = (0, debug_1.debug)('verbose').enabled;
        this.initMsgDebuggers(protocol);
    }
    initMsgDebuggers(protocol) {
        const MESSAGE_NAMES = Object.values(this._messageCodes).filter((value) => typeof value === 'string');
        for (const name of MESSAGE_NAMES) {
            this.msgDebuggers[name] = util_1.devp2pDebug.extend(protocol).extend(name);
        }
        // Remote Peer IP logger
        const ip = this._peer._socket.remoteAddress;
        if (ip) {
            this.msgDebuggers[ip] = util_1.devp2pDebug.extend(ip);
        }
    }
    /**
     * Called once on the peer where a first successful `STATUS`
     * msg exchange could be achieved.
     *
     * Can be used together with the `devp2p:FIRST_PEER` debugger.
     */
    _addFirstPeerDebugger() {
        const ip = this._peer._socket.remoteAddress;
        if (ip) {
            this.msgDebuggers[ip] = util_1.devp2pDebug.extend('FIRST_PEER');
            this._peer._addFirstPeerDebugger();
            this._firstPeer = ip;
        }
    }
    /**
     * Debug message both on the generic as well as the
     * per-message debug logger
     * @param messageName Capitalized message name (e.g. `GET_BLOCK_HEADERS`)
     * @param msg Message text to debug
     */
    debug(messageName, msg) {
        this._debug(msg);
        if (this.msgDebuggers[messageName]) {
            this.msgDebuggers[messageName](msg);
        }
        const ip = this._peer._socket.remoteAddress;
        if (ip && this.msgDebuggers[ip]) {
            this.msgDebuggers[ip](msg);
        }
    }
}
exports.Protocol = Protocol;
//# sourceMappingURL=protocol.js.map