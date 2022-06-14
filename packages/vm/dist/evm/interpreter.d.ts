/// <reference types="node" />
import { Account, Address } from '@ethereumjs/util';
import { VmState } from '../vmState';
import { VmError } from '../exceptions';
import Memory from './memory';
import Stack from './stack';
import EEI from './eei';
import { Opcode, OpHandler } from './opcodes';
import Common from '@ethereumjs/common';
import EVM from './evm';
export interface InterpreterOpts {
    pc?: number;
}
export interface RunState {
    programCounter: number;
    opCode: number;
    memory: Memory;
    memoryWordCount: bigint;
    highestMemCost: bigint;
    stack: Stack;
    returnStack: Stack;
    code: Buffer;
    shouldDoJumpAnalysis: boolean;
    validJumps: Uint8Array;
    vmState: VmState;
    eei: EEI;
    messageGasLimit?: bigint;
}
export interface InterpreterResult {
    runState?: RunState;
    exceptionError?: VmError;
}
export interface InterpreterStep {
    gasLeft: bigint;
    gasRefund: bigint;
    vmState: VmState;
    stack: bigint[];
    returnStack: bigint[];
    pc: number;
    depth: number;
    opcode: {
        name: string;
        fee: number;
        dynamicFee?: bigint;
        isAsync: boolean;
    };
    account: Account;
    address: Address;
    memory: Buffer;
    memoryWordCount: bigint;
    codeAddress: Address;
}
/**
 * Parses and executes EVM bytecode.
 */
export default class Interpreter {
    _vm: any;
    _state: VmState;
    _runState: RunState;
    _eei: EEI;
    _common: Common;
    _evm: EVM;
    private opDebuggers;
    constructor(evm: EVM, eei: EEI);
    run(code: Buffer, opts?: InterpreterOpts): Promise<InterpreterResult>;
    /**
     * Executes the opcode to which the program counter is pointing,
     * reducing its base gas cost, and increments the program counter.
     */
    runStep(): Promise<void>;
    /**
     * Get the handler function for an opcode.
     */
    getOpHandler(opInfo: Opcode): OpHandler;
    /**
     * Get info for an opcode from VM's list of opcodes.
     */
    lookupOpInfo(op: number): Opcode;
    _runStepHook(dynamicFee: bigint, gasLeft: bigint): Promise<void>;
    _getValidJumpDests(code: Buffer): Uint8Array;
}
