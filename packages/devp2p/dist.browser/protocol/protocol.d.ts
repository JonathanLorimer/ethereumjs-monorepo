/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { Debugger } from 'debug';
import { EventEmitter } from 'events';
import { Peer } from '../rlpx/peer';
export declare enum EthProtocol {
    ETH = "eth",
    LES = "les"
}
declare type MessageCodes = {
    [key: number | string]: number | string;
};
export declare type SendMethod = (code: number, data: Buffer) => any;
export declare class Protocol extends EventEmitter {
    _version: number;
    _peer: Peer;
    _send: SendMethod;
    _statusTimeoutId: NodeJS.Timeout;
    _messageCodes: MessageCodes;
    _debug: Debugger;
    _verbose: boolean;
    /**
     * Will be set to the first successfully connected peer to allow for
     * debugging with the `devp2p:FIRST_PEER` debugger
     */
    _firstPeer: string;
    protected msgDebuggers: {
        [key: string]: (debug: string) => void;
    };
    constructor(peer: Peer, send: SendMethod, protocol: EthProtocol, version: number, messageCodes: MessageCodes);
    private initMsgDebuggers;
    /**
     * Called once on the peer where a first successful `STATUS`
     * msg exchange could be achieved.
     *
     * Can be used together with the `devp2p:FIRST_PEER` debugger.
     */
    _addFirstPeerDebugger(): void;
    /**
     * Debug message both on the generic as well as the
     * per-message debug logger
     * @param messageName Capitalized message name (e.g. `GET_BLOCK_HEADERS`)
     * @param msg Message text to debug
     */
    protected debug(messageName: string, msg: string): void;
}
export {};
