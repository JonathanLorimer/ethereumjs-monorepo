import { Block } from '@ethereumjs/block';
import Ethash from '@ethereumjs/ethash';
import Blockchain from '..';
import { Consensus, ConsensusOptions } from './interface';
/**
 * This class encapsulates Ethash-related consensus functionality when used with the Blockchain class.
 */
export declare class EthashConsensus implements Consensus {
    blockchain: Blockchain;
    _ethash: Ethash;
    constructor({ blockchain }: ConsensusOptions);
    validate(block: Block): Promise<void>;
    genesisInit(): Promise<void>;
    setup(): Promise<void>;
    newBlock(): Promise<void>;
}
