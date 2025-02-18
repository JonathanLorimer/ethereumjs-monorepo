/// <reference types="node" />
import { Peer } from '../rlpx/peer';
import { Protocol, SendMethod } from './protocol';
export declare class ETH extends Protocol {
    _status: ETH.StatusMsg | null;
    _peerStatus: ETH.StatusMsg | null;
    _hardfork: string;
    _latestBlock: bigint;
    _forkHash: string;
    _nextForkBlock: bigint;
    constructor(version: number, peer: Peer, send: SendMethod);
    static eth62: {
        name: string;
        version: number;
        length: number;
        constructor: typeof ETH;
    };
    static eth63: {
        name: string;
        version: number;
        length: number;
        constructor: typeof ETH;
    };
    static eth64: {
        name: string;
        version: number;
        length: number;
        constructor: typeof ETH;
    };
    static eth65: {
        name: string;
        version: number;
        length: number;
        constructor: typeof ETH;
    };
    static eth66: {
        name: string;
        version: number;
        length: number;
        constructor: typeof ETH;
    };
    _handleMessage(code: ETH.MESSAGE_CODES, data: any): void;
    /**
     * Eth 64 Fork ID validation (EIP-2124)
     * @param forkId Remote fork ID
     */
    _validateForkId(forkId: Buffer[]): void;
    _handleStatus(): void;
    getVersion(): number;
    _forkHashFromForkId(forkId: Buffer): string;
    _nextForkFromForkId(forkId: Buffer): number;
    _getStatusString(status: ETH.StatusMsg): string;
    sendStatus(status: ETH.StatusOpts): void;
    sendMessage(code: ETH.MESSAGE_CODES, payload: any): void;
    getMsgPrefix(msgCode: ETH.MESSAGE_CODES): string;
}
export declare namespace ETH {
    interface StatusMsg extends Array<Buffer | Buffer[]> {
    }
    type StatusOpts = {
        td: Buffer;
        bestHash: Buffer;
        latestBlock?: Buffer;
        genesisHash: Buffer;
    };
    enum MESSAGE_CODES {
        STATUS = 0,
        NEW_BLOCK_HASHES = 1,
        TX = 2,
        GET_BLOCK_HEADERS = 3,
        BLOCK_HEADERS = 4,
        GET_BLOCK_BODIES = 5,
        BLOCK_BODIES = 6,
        NEW_BLOCK = 7,
        GET_NODE_DATA = 13,
        NODE_DATA = 14,
        GET_RECEIPTS = 15,
        RECEIPTS = 16,
        NEW_POOLED_TRANSACTION_HASHES = 8,
        GET_POOLED_TRANSACTIONS = 9,
        POOLED_TRANSACTIONS = 10
    }
}
