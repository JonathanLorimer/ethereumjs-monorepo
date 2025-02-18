"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ECIES = void 0;
const crypto_1 = __importDefault(require("crypto"));
const debug_1 = require("debug");
const secp256k1_1 = require("secp256k1");
const util_1 = require("@ethereumjs/util");
const rlp_1 = __importDefault(require("rlp"));
const util_2 = require("../util");
const mac_1 = require("./mac");
const util_3 = require("../util");
const debug = (0, debug_1.debug)('devp2p:rlpx:peer');
function ecdhX(publicKey, privateKey) {
    // return (publicKey * privateKey).x
    function hashfn(x, y) {
        const pubKey = new Uint8Array(33);
        pubKey[0] = (y[31] & 1) === 0 ? 0x02 : 0x03;
        pubKey.set(x, 1);
        return pubKey;
    }
    // @ts-ignore
    return Buffer.from((0, secp256k1_1.ecdh)(publicKey, privateKey, { hashfn }, Buffer.alloc(33)).slice(1));
}
// a straigth rip from python interop w/go ecies implementation
// for sha3, blocksize is 136 bytes
// for sha256, blocksize is 64 bytes
// NIST SP 800-56a Concatenation Key Derivation Function (see section 5.8.1).
// https://github.com/ethereum/pydevp2p/blob/master/devp2p/crypto.py#L295
// https://github.com/ethereum/go-ethereum/blob/fe532a98f9f32bb81ef0d8d013cf44327830d11e/crypto/ecies/ecies.go#L165
// https://github.com/ethereum/cpp-ethereum/blob/develop/libdevcrypto/CryptoPP.cpp#L36
function concatKDF(keyMaterial, keyLength) {
    const SHA256BlockSize = 64;
    const reps = ((keyLength + 7) * 8) / (SHA256BlockSize * 8);
    const buffers = [];
    for (let counter = 0, tmp = Buffer.allocUnsafe(4); counter <= reps;) {
        counter += 1;
        tmp.writeUInt32BE(counter, 0);
        buffers.push(crypto_1.default.createHash('sha256').update(tmp).update(keyMaterial).digest());
    }
    return Buffer.concat(buffers).slice(0, keyLength);
}
class ECIES {
    constructor(privateKey, id, remoteId) {
        this._remoteNonce = null;
        this._initMsg = null;
        this._remoteInitMsg = null;
        this._gotEIP8Auth = false;
        this._gotEIP8Ack = false;
        this._ingressAes = null;
        this._egressAes = null;
        this._ingressMac = null;
        this._egressMac = null;
        this._remoteEphemeralPublicKey = null; // we don't need store this key, but why don't?
        this._ephemeralSharedSecret = null;
        this._bodySize = null;
        this._privateKey = privateKey;
        this._publicKey = (0, util_3.id2pk)(id);
        this._remotePublicKey = remoteId ? (0, util_3.id2pk)(remoteId) : null;
        this._nonce = crypto_1.default.randomBytes(32);
        this._ephemeralPrivateKey = (0, util_3.genPrivateKey)();
        this._ephemeralPublicKey = Buffer.from((0, secp256k1_1.publicKeyCreate)(this._ephemeralPrivateKey, false));
    }
    _encryptMessage(data, sharedMacData = null) {
        const privateKey = (0, util_3.genPrivateKey)();
        if (!this._remotePublicKey)
            return;
        const x = ecdhX(this._remotePublicKey, privateKey);
        const key = concatKDF(x, 32);
        const ekey = key.slice(0, 16); // encryption key
        const mkey = crypto_1.default.createHash('sha256').update(key.slice(16, 32)).digest(); // MAC key
        // encrypt
        const IV = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipheriv('aes-128-ctr', ekey, IV);
        const encryptedData = cipher.update(data);
        const dataIV = Buffer.concat([IV, encryptedData]);
        // create tag
        if (!sharedMacData) {
            sharedMacData = Buffer.from([]);
        }
        const tag = crypto_1.default
            .createHmac('sha256', mkey)
            .update(Buffer.concat([dataIV, sharedMacData]))
            .digest();
        const publicKey = (0, secp256k1_1.publicKeyCreate)(privateKey, false);
        return Buffer.concat([publicKey, dataIV, tag]);
    }
    _decryptMessage(data, sharedMacData = null) {
        (0, util_3.assertEq)(data.slice(0, 1), Buffer.from('04', 'hex'), 'wrong ecies header (possible cause: EIP8 upgrade)', debug);
        const publicKey = data.slice(0, 65);
        const dataIV = data.slice(65, -32);
        const tag = data.slice(-32);
        // derive keys
        const x = ecdhX(publicKey, this._privateKey);
        const key = concatKDF(x, 32);
        const ekey = key.slice(0, 16); // encryption key
        const mkey = crypto_1.default.createHash('sha256').update(key.slice(16, 32)).digest(); // MAC key
        // check the tag
        if (!sharedMacData) {
            sharedMacData = Buffer.from([]);
        }
        const _tag = crypto_1.default
            .createHmac('sha256', mkey)
            .update(Buffer.concat([dataIV, sharedMacData]))
            .digest();
        (0, util_3.assertEq)(_tag, tag, 'should have valid tag', debug);
        // decrypt data
        const IV = dataIV.slice(0, 16);
        const encryptedData = dataIV.slice(16);
        const decipher = crypto_1.default.createDecipheriv('aes-128-ctr', ekey, IV);
        return decipher.update(encryptedData);
    }
    _setupFrame(remoteData, incoming) {
        if (!this._remoteNonce)
            return;
        const nonceMaterial = incoming
            ? Buffer.concat([this._nonce, this._remoteNonce])
            : Buffer.concat([this._remoteNonce, this._nonce]);
        const hNonce = (0, util_3.keccak256)(nonceMaterial);
        if (!this._ephemeralSharedSecret)
            return;
        const IV = Buffer.allocUnsafe(16).fill(0x00);
        const sharedSecret = (0, util_3.keccak256)(this._ephemeralSharedSecret, hNonce);
        const aesSecret = (0, util_3.keccak256)(this._ephemeralSharedSecret, sharedSecret);
        this._ingressAes = crypto_1.default.createDecipheriv('aes-256-ctr', aesSecret, IV);
        this._egressAes = crypto_1.default.createDecipheriv('aes-256-ctr', aesSecret, IV);
        const macSecret = (0, util_3.keccak256)(this._ephemeralSharedSecret, aesSecret);
        this._ingressMac = new mac_1.MAC(macSecret);
        this._ingressMac.update(Buffer.concat([(0, util_3.xor)(macSecret, this._nonce), remoteData]));
        this._egressMac = new mac_1.MAC(macSecret);
        if (!this._initMsg)
            return;
        this._egressMac.update(Buffer.concat([(0, util_3.xor)(macSecret, this._remoteNonce), this._initMsg]));
    }
    createAuthEIP8() {
        if (!this._remotePublicKey)
            return;
        const x = ecdhX(this._remotePublicKey, this._privateKey);
        const sig = (0, secp256k1_1.ecdsaSign)((0, util_3.xor)(x, this._nonce), this._ephemeralPrivateKey);
        const data = [
            Buffer.concat([Buffer.from(sig.signature), Buffer.from([sig.recid])]),
            // keccak256(pk2id(this._ephemeralPublicKey)),
            (0, util_3.pk2id)(this._publicKey),
            this._nonce,
            Buffer.from([0x04]),
        ];
        const dataRLP = Buffer.from(rlp_1.default.encode((0, util_1.bufArrToArr)(data)));
        const pad = crypto_1.default.randomBytes(100 + Math.floor(Math.random() * 151)); // Random padding between 100, 250
        const authMsg = Buffer.concat([dataRLP, pad]);
        const overheadLength = 113;
        const sharedMacData = (0, util_3.int2buffer)(authMsg.length + overheadLength);
        const encryptedMsg = this._encryptMessage(authMsg, sharedMacData);
        if (!encryptedMsg)
            return;
        this._initMsg = Buffer.concat([sharedMacData, encryptedMsg]);
        return this._initMsg;
    }
    createAuthNonEIP8() {
        if (!this._remotePublicKey)
            return;
        const x = ecdhX(this._remotePublicKey, this._privateKey);
        const sig = (0, secp256k1_1.ecdsaSign)((0, util_3.xor)(x, this._nonce), this._ephemeralPrivateKey);
        const data = Buffer.concat([
            Buffer.from(sig.signature),
            Buffer.from([sig.recid]),
            (0, util_3.keccak256)((0, util_3.pk2id)(this._ephemeralPublicKey)),
            (0, util_3.pk2id)(this._publicKey),
            this._nonce,
            Buffer.from([0x00]),
        ]);
        this._initMsg = this._encryptMessage(data);
        return this._initMsg;
    }
    parseAuthPlain(data, sharedMacData = null) {
        const prefix = sharedMacData !== null ? sharedMacData : Buffer.from([]);
        this._remoteInitMsg = Buffer.concat([prefix, data]);
        const decrypted = this._decryptMessage(data, sharedMacData);
        let signature = null;
        let recoveryId = null;
        let heid = null;
        let remotePublicKey = null;
        let nonce = null;
        if (!this._gotEIP8Auth) {
            (0, util_3.assertEq)(decrypted.length, 194, 'invalid packet length', debug);
            signature = decrypted.slice(0, 64);
            recoveryId = decrypted[64];
            heid = decrypted.slice(65, 97); // 32 bytes
            remotePublicKey = (0, util_3.id2pk)(decrypted.slice(97, 161));
            nonce = decrypted.slice(161, 193);
        }
        else {
            const decoded = (0, util_2.unstrictDecode)(decrypted);
            signature = decoded[0].slice(0, 64);
            recoveryId = decoded[0][64];
            remotePublicKey = (0, util_3.id2pk)(decoded[1]);
            nonce = decoded[2];
        }
        // parse packet
        this._remotePublicKey = remotePublicKey; // 64 bytes
        this._remoteNonce = nonce; // 32 bytes
        // assertEq(decrypted[193], 0, 'invalid postfix', debug)
        const x = ecdhX(this._remotePublicKey, this._privateKey);
        if (!this._remoteNonce)
            return;
        this._remoteEphemeralPublicKey = Buffer.from((0, secp256k1_1.ecdsaRecover)(signature, recoveryId, (0, util_3.xor)(x, this._remoteNonce), false));
        if (!this._remoteEphemeralPublicKey)
            return;
        this._ephemeralSharedSecret = ecdhX(this._remoteEphemeralPublicKey, this._ephemeralPrivateKey);
        if (heid !== null && this._remoteEphemeralPublicKey) {
            (0, util_3.assertEq)((0, util_3.keccak256)((0, util_3.pk2id)(this._remoteEphemeralPublicKey)), heid, 'the hash of the ephemeral key should match', debug);
        }
    }
    parseAuthEIP8(data) {
        const size = (0, util_3.buffer2int)(data.slice(0, 2)) + 2;
        (0, util_3.assertEq)(data.length, size, 'message length different from specified size (EIP8)', debug);
        this.parseAuthPlain(data.slice(2), data.slice(0, 2));
    }
    createAckEIP8() {
        const data = [(0, util_3.pk2id)(this._ephemeralPublicKey), this._nonce, Buffer.from([0x04])];
        const dataRLP = Buffer.from(rlp_1.default.encode((0, util_1.bufArrToArr)(data)));
        const pad = crypto_1.default.randomBytes(100 + Math.floor(Math.random() * 151)); // Random padding between 100, 250
        const ackMsg = Buffer.concat([dataRLP, pad]);
        const overheadLength = 113;
        const sharedMacData = (0, util_3.int2buffer)(ackMsg.length + overheadLength);
        const encryptedMsg = this._encryptMessage(ackMsg, sharedMacData);
        if (!encryptedMsg)
            return;
        this._initMsg = Buffer.concat([sharedMacData, encryptedMsg]);
        if (!this._remoteInitMsg)
            return;
        this._setupFrame(this._remoteInitMsg, true);
        return this._initMsg;
    }
    createAckOld() {
        const data = Buffer.concat([(0, util_3.pk2id)(this._ephemeralPublicKey), this._nonce, Buffer.from([0x00])]);
        this._initMsg = this._encryptMessage(data);
        if (!this._remoteInitMsg)
            return;
        this._setupFrame(this._remoteInitMsg, true);
        return this._initMsg;
    }
    parseAckPlain(data, sharedMacData = null) {
        const decrypted = this._decryptMessage(data, sharedMacData);
        let remoteEphemeralPublicKey = null;
        let remoteNonce = null;
        if (!this._gotEIP8Ack) {
            (0, util_3.assertEq)(decrypted.length, 97, 'invalid packet length', debug);
            (0, util_3.assertEq)(decrypted[96], 0, 'invalid postfix', debug);
            remoteEphemeralPublicKey = (0, util_3.id2pk)(decrypted.slice(0, 64));
            remoteNonce = decrypted.slice(64, 96);
        }
        else {
            const decoded = (0, util_2.unstrictDecode)(decrypted);
            remoteEphemeralPublicKey = (0, util_3.id2pk)(decoded[0]);
            remoteNonce = decoded[1];
        }
        // parse packet
        this._remoteEphemeralPublicKey = remoteEphemeralPublicKey;
        this._remoteNonce = remoteNonce;
        this._ephemeralSharedSecret = ecdhX(this._remoteEphemeralPublicKey, this._ephemeralPrivateKey);
        if (!sharedMacData) {
            sharedMacData = Buffer.from([]);
        }
        this._setupFrame(Buffer.concat([sharedMacData, data]), false);
    }
    parseAckEIP8(data) {
        const size = (0, util_3.buffer2int)(data.slice(0, 2)) + 2;
        (0, util_3.assertEq)(data.length, size, 'message length different from specified size (EIP8)', debug);
        this.parseAckPlain(data.slice(2), data.slice(0, 2));
    }
    createHeader(size) {
        const bufSize = (0, util_3.zfill)((0, util_3.int2buffer)(size), 3);
        const headerData = Buffer.from(rlp_1.default.encode([0, 0])); // [capability-id, context-id] (currently unused in spec)
        let header = Buffer.concat([bufSize, headerData]);
        header = (0, util_3.zfill)(header, 16, false);
        if (!this._egressAes)
            return;
        header = this._egressAes.update(header);
        if (!this._egressMac)
            return;
        this._egressMac.updateHeader(header);
        const tag = this._egressMac.digest();
        return Buffer.concat([header, tag]);
    }
    parseHeader(data) {
        // parse header
        let header = data.slice(0, 16);
        const mac = data.slice(16, 32);
        if (!this._ingressMac)
            return;
        this._ingressMac.updateHeader(header);
        const _mac = this._ingressMac.digest();
        (0, util_3.assertEq)(_mac, mac, 'Invalid MAC', debug);
        if (!this._ingressAes)
            return;
        header = this._ingressAes.update(header);
        this._bodySize = (0, util_3.buffer2int)(header.slice(0, 3));
        return this._bodySize;
    }
    createBody(data) {
        data = (0, util_3.zfill)(data, Math.ceil(data.length / 16) * 16, false);
        if (!this._egressAes)
            return;
        const encryptedData = this._egressAes.update(data);
        if (!this._egressMac)
            return;
        this._egressMac.updateBody(encryptedData);
        const tag = this._egressMac.digest();
        return Buffer.concat([encryptedData, tag]);
    }
    parseBody(data) {
        if (this._bodySize === null)
            throw new Error('need to parse header first');
        const body = data.slice(0, -16);
        const mac = data.slice(-16);
        if (!this._ingressMac)
            return;
        this._ingressMac.updateBody(body);
        const _mac = this._ingressMac.digest();
        (0, util_3.assertEq)(_mac, mac, 'Invalid MAC', debug);
        const size = this._bodySize;
        this._bodySize = null;
        if (!this._ingressAes)
            return;
        return this._ingressAes.update(body).slice(0, size);
    }
}
exports.ECIES = ECIES;
//# sourceMappingURL=ecies.js.map