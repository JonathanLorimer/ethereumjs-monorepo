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
exports.ENR = void 0;
const base32 = __importStar(require("hi-base32"));
const scanf_1 = require("scanf");
const secp256k1_1 = require("secp256k1");
const multiaddr_1 = require("multiaddr");
const base64url_1 = __importDefault(require("base64url"));
const util_1 = require("@ethereumjs/util");
const rlp_1 = __importDefault(require("rlp"));
const util_2 = require("../util");
const Convert = require('multiaddr/src/convert');
class ENR {
    /**
     * Converts an Ethereum Name Record (EIP-778) string into a PeerInfo object after validating
     * its signature component with the public key encoded in the record itself.
     *
     * The record components are:
     * > signature: cryptographic signature of record contents
     * > seq: The sequence number, a 64-bit unsigned integer which increases whenever
     *        the record changes and is republished.
     * > A set of arbitrary key/value pairs
     *
     * @param  {string}   enr
     * @return {PeerInfo}
     */
    static parseAndVerifyRecord(enr) {
        if (!enr.startsWith(this.RECORD_PREFIX))
            throw new Error(`String encoded ENR must start with '${this.RECORD_PREFIX}'`);
        // ENRs are RLP encoded and written to DNS TXT entries as base64 url-safe strings
        const base64BufferEnr = base64url_1.default.toBuffer(enr.slice(this.RECORD_PREFIX.length));
        const decoded = (0, util_1.arrToBufArr)(rlp_1.default.decode(Uint8Array.from(base64BufferEnr)));
        const [signature, seq, ...kvs] = decoded;
        // Convert ENR key/value pairs to object
        const obj = {};
        for (let i = 0; i < kvs.length; i += 2) {
            obj[kvs[i].toString()] = Buffer.from(kvs[i + 1]);
        }
        // Validate sig
        const isVerified = (0, secp256k1_1.ecdsaVerify)(signature, (0, util_2.keccak256)(Buffer.from(rlp_1.default.encode((0, util_1.bufArrToArr)([seq, ...kvs])))), obj.secp256k1);
        if (!isVerified)
            throw new Error('Unable to verify ENR signature');
        const { ipCode, tcpCode, udpCode } = this._getIpProtocolConversionCodes(obj.id);
        const peerInfo = {
            address: Convert.toString(ipCode, obj.ip),
            tcpPort: Number(Convert.toString(tcpCode, (0, util_2.toNewUint8Array)(obj.tcp))),
            udpPort: Number(Convert.toString(udpCode, (0, util_2.toNewUint8Array)(obj.udp))),
        };
        return peerInfo;
    }
    /**
     * Extracts the branch subdomain referenced by a DNS tree root string after verifying
     * the root record signature with its base32 compressed public key. Geth's top level DNS
     * domains and their public key can be found in: go-ethereum/params/bootnodes
     *
     * @param  {string} root  (See EIP-1459 for encoding details)
     * @return {string} subdomain subdomain to retrieve branch records from.
     */
    static parseAndVerifyRoot(root, publicKey) {
        if (!root.startsWith(this.ROOT_PREFIX))
            throw new Error(`ENR root entry must start with '${this.ROOT_PREFIX}'`);
        const rootVals = (0, scanf_1.sscanf)(root, `${this.ROOT_PREFIX}v1 e=%s l=%s seq=%d sig=%s`, 'eRoot', 'lRoot', 'seq', 'signature');
        if (!rootVals.eRoot)
            throw new Error("Could not parse 'e' value from ENR root entry");
        if (!rootVals.lRoot)
            throw new Error("Could not parse 'l' value from ENR root entry");
        if (!rootVals.seq)
            throw new Error("Could not parse 'seq' value from ENR root entry");
        if (!rootVals.signature)
            throw new Error("Could not parse 'sig' value from ENR root entry");
        const decodedPublicKey = base32.decode.asBytes(publicKey);
        // The signature is a 65-byte secp256k1 over the keccak256 hash
        // of the record content, excluding the `sig=` part, encoded as URL-safe base64 string
        // (Trailing recovery bit must be trimmed to pass `ecdsaVerify` method)
        const signedComponent = root.split(' sig')[0];
        const signedComponentBuffer = Buffer.from(signedComponent);
        const signatureBuffer = base64url_1.default.toBuffer(rootVals.signature).slice(0, 64);
        const keyBuffer = Buffer.from(decodedPublicKey);
        const isVerified = (0, secp256k1_1.ecdsaVerify)(signatureBuffer, (0, util_2.keccak256)(signedComponentBuffer), keyBuffer);
        if (!isVerified)
            throw new Error('Unable to verify ENR root signature');
        return rootVals.eRoot;
    }
    /**
     * Returns the public key and top level domain of an ENR tree entry.
     * The domain is the starting point for traversing a set of linked DNS TXT records
     * and the public key is used to verify the root entry record
     *
     * @param  {string}        tree (See EIP-1459 )
     * @return {ENRTreeValues}
     */
    static parseTree(tree) {
        if (!tree.startsWith(this.TREE_PREFIX))
            throw new Error(`ENR tree entry must start with '${this.TREE_PREFIX}'`);
        const treeVals = (0, scanf_1.sscanf)(tree, `${this.TREE_PREFIX}//%s@%s`, 'publicKey', 'domain');
        if (!treeVals.publicKey)
            throw new Error('Could not parse public key from ENR tree entry');
        if (!treeVals.domain)
            throw new Error('Could not parse domain from ENR tree entry');
        return treeVals;
    }
    /**
     * Returns subdomains listed in an ENR branch entry. These in turn lead to
     * either further branch entries or ENR records.
     * @param  {string}   branch
     * @return {string[]}
     */
    static parseBranch(branch) {
        if (!branch.startsWith(this.BRANCH_PREFIX))
            throw new Error(`ENR branch entry must start with '${this.BRANCH_PREFIX}'`);
        return branch.split(this.BRANCH_PREFIX)[1].split(',');
    }
    /**
     * Gets relevant multiaddr conversion codes for ipv4, ipv6 and tcp, udp formats
     * @param  {Buffer}        protocolId
     * @return {ProtocolCodes}
     */
    static _getIpProtocolConversionCodes(protocolId) {
        let ipCode;
        switch (protocolId.toString()) {
            case 'v4':
                ipCode = multiaddr_1.Multiaddr.protocols.names.ip4.code;
                break;
            case 'v6':
                ipCode = multiaddr_1.Multiaddr.protocols.names.ip6.code;
                break;
            default:
                throw new Error("IP protocol must be 'v4' or 'v6'");
        }
        return {
            ipCode,
            tcpCode: multiaddr_1.Multiaddr.protocols.names.tcp.code,
            udpCode: multiaddr_1.Multiaddr.protocols.names.udp.code,
        };
    }
}
exports.ENR = ENR;
ENR.RECORD_PREFIX = 'enr:';
ENR.TREE_PREFIX = 'enrtree:';
ENR.BRANCH_PREFIX = 'enrtree-branch:';
ENR.ROOT_PREFIX = 'enrtree-root:';
//# sourceMappingURL=enr.js.map