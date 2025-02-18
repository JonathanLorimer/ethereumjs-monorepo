"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DPT = void 0;
const ms_1 = __importDefault(require("ms"));
const events_1 = require("events");
const secp256k1_1 = require("secp256k1");
const crypto_1 = require("crypto");
// import { debug as createDebugLogger } from 'debug'
const util_1 = require("../util");
const util_2 = require("../util");
const kbucket_1 = require("./kbucket");
const ban_list_1 = require("./ban-list");
const server_1 = require("./server");
const dns_1 = require("../dns");
const DEBUG_BASE_NAME = 'dpt';
class DPT extends events_1.EventEmitter {
    constructor(privateKey, options) {
        super();
        this._refreshIntervalSelectionCounter = 0;
        this.privateKey = Buffer.from(privateKey);
        this._id = (0, util_2.pk2id)(Buffer.from((0, secp256k1_1.publicKeyCreate)(this.privateKey, false)));
        this._shouldFindNeighbours = options.shouldFindNeighbours === false ? false : true;
        this._shouldGetDnsPeers = options.shouldGetDnsPeers ?? false;
        // By default, tries to connect to 12 new peers every 3s
        this._dnsRefreshQuantity = Math.floor((options.dnsRefreshQuantity ?? 25) / 2);
        this._dnsNetworks = options.dnsNetworks ?? [];
        this._dnsAddr = options.dnsAddr ?? '8.8.8.8';
        this.dns = new dns_1.DNS({ dnsServerAddress: this._dnsAddr });
        this.banlist = new ban_list_1.BanList();
        this._kbucket = new kbucket_1.KBucket(this._id);
        this._kbucket.on('added', (peer) => this.emit('peer:added', peer));
        this._kbucket.on('removed', (peer) => this.emit('peer:removed', peer));
        this._kbucket.on('ping', this._onKBucketPing.bind(this));
        this._server = new server_1.Server(this, this.privateKey, {
            timeout: options.timeout,
            endpoint: options.endpoint,
            createSocket: options.createSocket,
        });
        this._server.once('listening', () => this.emit('listening'));
        this._server.once('close', () => this.emit('close'));
        this._server.on('error', (err) => this.emit('error', err));
        this._debug = util_1.devp2pDebug.extend(DEBUG_BASE_NAME);
        // When not using peer neighbour discovery we don't add peers here
        // because it results in duplicate calls for the same targets
        this._server.on('peers', (peers) => {
            if (!this._shouldFindNeighbours)
                return;
            this._addPeerBatch(peers);
        });
        // By default calls refresh every 3s
        const refreshIntervalSubdivided = Math.floor((options.refreshInterval ?? (0, ms_1.default)('60s')) / 10);
        this._refreshIntervalId = setInterval(() => this.refresh(), refreshIntervalSubdivided);
    }
    bind(...args) {
        this._server.bind(...args);
    }
    destroy(...args) {
        clearInterval(this._refreshIntervalId);
        this._server.destroy(...args);
    }
    _onKBucketPing(oldPeers, newPeer) {
        if (this.banlist.has(newPeer))
            return;
        let count = 0;
        let err = null;
        for (const peer of oldPeers) {
            this._server
                .ping(peer)
                .catch((_err) => {
                this.banlist.add(peer, (0, ms_1.default)('5m'));
                this._kbucket.remove(peer);
                err = err ?? _err;
            })
                .then(() => {
                if (++count < oldPeers.length)
                    return;
                if (err === null)
                    this.banlist.add(newPeer, (0, ms_1.default)('5m'));
                else
                    this._kbucket.add(newPeer);
            });
        }
    }
    _addPeerBatch(peers) {
        const DIFF_TIME_MS = 200;
        let ms = 0;
        for (const peer of peers) {
            setTimeout(() => {
                this.addPeer(peer).catch((error) => {
                    this.emit('error', error);
                });
            }, ms);
            ms += DIFF_TIME_MS;
        }
    }
    async bootstrap(peer) {
        try {
            peer = await this.addPeer(peer);
        }
        catch (error) {
            this.emit('error', error);
            return;
        }
        if (!this._id)
            return;
        if (this._shouldFindNeighbours) {
            this._server.findneighbours(peer, this._id);
        }
    }
    async addPeer(obj) {
        if (this.banlist.has(obj))
            throw new Error('Peer is banned');
        this._debug(`attempt adding peer ${obj.address}:${obj.udpPort}`);
        // check k-bucket first
        const peer = this._kbucket.get(obj);
        if (peer !== null)
            return peer;
        // check that peer is alive
        try {
            const peer = await this._server.ping(obj);
            this.emit('peer:new', peer);
            this._kbucket.add(peer);
            return peer;
        }
        catch (err) {
            this.banlist.add(obj, (0, ms_1.default)('5m'));
            throw err;
        }
    }
    getPeer(obj) {
        return this._kbucket.get(obj);
    }
    getPeers() {
        return this._kbucket.getAll();
    }
    getClosestPeers(id) {
        return this._kbucket.closest(id);
    }
    removePeer(obj) {
        this._kbucket.remove(obj);
    }
    banPeer(obj, maxAge) {
        this.banlist.add(obj, maxAge);
        this._kbucket.remove(obj);
    }
    async getDnsPeers() {
        return this.dns.getPeers(this._dnsRefreshQuantity, this._dnsNetworks);
    }
    async refresh() {
        if (this._shouldFindNeighbours) {
            // Rotating selection counter going in loop from 0..9
            this._refreshIntervalSelectionCounter = (this._refreshIntervalSelectionCounter + 1) % 10;
            const peers = this.getPeers();
            this._debug(`call .refresh() (selector ${this._refreshIntervalSelectionCounter}) (${peers.length} peers in table)`);
            for (const peer of peers) {
                // Randomly distributed selector based on peer ID
                // to decide on subdivided execution
                const selector = (0, util_2.buffer2int)(peer.id.slice(0, 1)) % 10;
                if (selector === this._refreshIntervalSelectionCounter) {
                    this._server.findneighbours(peer, (0, crypto_1.randomBytes)(64));
                }
            }
        }
        if (this._shouldGetDnsPeers) {
            const dnsPeers = await this.getDnsPeers();
            this._debug(`.refresh() Adding ${dnsPeers.length} from DNS tree, (${this.getPeers().length} current peers in table)`);
            this._addPeerBatch(dnsPeers);
        }
    }
}
exports.DPT = DPT;
//# sourceMappingURL=dpt.js.map