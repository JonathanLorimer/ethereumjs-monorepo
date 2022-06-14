import { PrecompileInput } from './types';
import { ExecResult } from '../evm';
export declare function expmod(a: bigint, power: bigint, modulo: bigint): bigint;
export default function (opts: PrecompileInput): ExecResult;
