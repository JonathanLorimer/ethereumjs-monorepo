import Blockchain from '..';
import { Consensus, ConsensusOptions } from './interface';
/**
 * This class encapsulates Casper-related consensus functionality when used with the Blockchain class.
 */
export declare class CasperConsensus implements Consensus {
    blockchain: Blockchain;
    constructor({ blockchain }: ConsensusOptions);
    genesisInit(): Promise<void>;
    setup(): Promise<void>;
    validate(): Promise<void>;
    newBlock(): Promise<void>;
}
