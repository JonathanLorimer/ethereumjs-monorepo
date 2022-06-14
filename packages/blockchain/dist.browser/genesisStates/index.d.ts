/// <reference types="node" />
import { PrefixedHexString } from '@ethereumjs/util';
export declare type StoragePair = [key: PrefixedHexString, value: PrefixedHexString];
export declare type AccountState = [
    balance: PrefixedHexString,
    code: PrefixedHexString,
    storage: Array<StoragePair>
];
export interface GenesisState {
    [key: PrefixedHexString]: PrefixedHexString | AccountState;
}
/**
 * Derives the stateRoot of the genesis block based on genesis allocations
 */
export declare function genesisStateRoot(genesisState: GenesisState): Promise<Buffer>;
