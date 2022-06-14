/// <reference types="node" />
import { DBOp } from './operation';
import { Block, BlockHeader } from '@ethereumjs/block';
declare function DBSetTD(TD: bigint, blockNumber: bigint, blockHash: Buffer): DBOp;
declare function DBSetBlockOrHeader(blockBody: Block | BlockHeader): DBOp[];
declare function DBSetHashToNumber(blockHash: Buffer, blockNumber: bigint): DBOp;
declare function DBSaveLookups(blockHash: Buffer, blockNumber: bigint): DBOp[];
export { DBOp, DBSetTD, DBSetBlockOrHeader, DBSetHashToNumber, DBSaveLookups };
