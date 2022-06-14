"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toNewUint8Array = exports.unstrictDecode = exports.createDeferred = exports.Deferred = exports.formatLogData = exports.formatLogId = exports.assertEq = exports.xor = exports.zfill = exports.buffer2int = exports.int2buffer = exports.id2pk = exports.pk2id = exports.genPrivateKey = exports.keccak256 = exports.devp2pDebug = void 0;
const crypto_1 = require("crypto");
const secp256k1_1 = require("secp256k1");
const keccak_1 = __importDefault(require("keccak"));
const util_1 = require("@ethereumjs/util");
const rlp_1 = __importDefault(require("rlp"));
const debug_1 = require("debug");
exports.devp2pDebug = (0, debug_1.debug)('devp2p');
function keccak256(...buffers) {
    const buffer = Buffer.concat(buffers);
    return (0, keccak_1.default)('keccak256').update(buffer).digest();
}
exports.keccak256 = keccak256;
function genPrivateKey() {
    const privateKey = (0, crypto_1.randomBytes)(32);
    return (0, secp256k1_1.privateKeyVerify)(privateKey) ? privateKey : genPrivateKey();
}
exports.genPrivateKey = genPrivateKey;
function pk2id(pk) {
    if (pk.length === 33) {
        pk = Buffer.from((0, secp256k1_1.publicKeyConvert)(pk, false));
    }
    return pk.slice(1);
}
exports.pk2id = pk2id;
function id2pk(id) {
    return Buffer.concat([Buffer.from([0x04]), id]);
}
exports.id2pk = id2pk;
function int2buffer(v) {
    if (v === null) {
        return Buffer.alloc(0);
    }
    let hex = v.toString(16);
    if (hex.length % 2 === 1)
        hex = '0' + hex;
    return Buffer.from(hex, 'hex');
}
exports.int2buffer = int2buffer;
function buffer2int(buffer) {
    if (buffer.length === 0)
        return NaN;
    let n = 0;
    for (let i = 0; i < buffer.length; ++i)
        n = n * 256 + buffer[i];
    return n;
}
exports.buffer2int = buffer2int;
function zfill(buffer, size, leftpad = true) {
    if (buffer.length >= size)
        return buffer;
    if (leftpad === undefined)
        leftpad = true;
    const pad = Buffer.allocUnsafe(size - buffer.length).fill(0x00);
    return leftpad ? Buffer.concat([pad, buffer]) : Buffer.concat([buffer, pad]);
}
exports.zfill = zfill;
function xor(a, b) {
    const length = Math.min(a.length, b.length);
    const buffer = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; ++i)
        buffer[i] = a[i] ^ b[i];
    return buffer;
}
exports.xor = xor;
function assertEq(expected, actual, msg, debug, messageName) {
    let fullMsg;
    if (Buffer.isBuffer(expected) && Buffer.isBuffer(actual)) {
        if (expected.equals(actual))
            return;
        fullMsg = `${msg}: ${expected.toString('hex')} / ${actual.toString('hex')}`;
        const debugMsg = `[ERROR] ${fullMsg}`;
        if (messageName) {
            debug(messageName, debugMsg);
        }
        else {
            debug(debugMsg);
        }
        throw new Error(fullMsg);
    }
    if (expected === actual)
        return;
    fullMsg = `${msg}: ${expected} / ${actual}`;
    if (messageName) {
        debug(messageName, fullMsg);
    }
    else {
        debug(fullMsg);
    }
    throw new Error(fullMsg);
}
exports.assertEq = assertEq;
function formatLogId(id, verbose) {
    const numChars = 7;
    if (verbose) {
        return id;
    }
    else {
        return `${id.substring(0, numChars)}`;
    }
}
exports.formatLogId = formatLogId;
function formatLogData(data, verbose) {
    const maxChars = 60;
    if (verbose || data.length <= maxChars) {
        return data;
    }
    else {
        return `${data.substring(0, maxChars)}...`;
    }
}
exports.formatLogData = formatLogData;
class Deferred {
    constructor() {
        this.resolve = () => { };
        this.reject = () => { };
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}
exports.Deferred = Deferred;
function createDeferred() {
    return new Deferred();
}
exports.createDeferred = createDeferred;
function unstrictDecode(value) {
    // rlp library throws on remainder.length !== 0
    // this utility function bypasses that
    return (0, util_1.arrToBufArr)(rlp_1.default.decode(Uint8Array.from(value), true).data);
}
exports.unstrictDecode = unstrictDecode;
// multiaddr 8.0.0 expects an Uint8Array with internal buffer starting at 0 offset
function toNewUint8Array(buf) {
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return new Uint8Array(arrayBuffer);
}
exports.toNewUint8Array = toNewUint8Array;
//# sourceMappingURL=util.js.map