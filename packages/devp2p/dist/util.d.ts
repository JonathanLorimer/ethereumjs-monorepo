/// <reference types="node" />
import { ETH } from './protocol/eth';
import { LES } from './protocol/les';
export declare const devp2pDebug: import("debug").Debugger;
export declare function keccak256(...buffers: Buffer[]): Buffer;
export declare function genPrivateKey(): Buffer;
export declare function pk2id(pk: Buffer): Buffer;
export declare function id2pk(id: Buffer): Buffer;
export declare function int2buffer(v: number | null): Buffer;
export declare function buffer2int(buffer: Buffer): number;
export declare function zfill(buffer: Buffer, size: number, leftpad?: boolean): Buffer;
export declare function xor(a: Buffer, b: any): Buffer;
declare type assertInput = Buffer | Buffer[] | ETH.StatusMsg | LES.Status | number | null;
export declare function assertEq(expected: assertInput, actual: assertInput, msg: string, debug: Function, messageName?: string): void;
export declare function formatLogId(id: string, verbose: boolean): string;
export declare function formatLogData(data: string, verbose: boolean): string;
export declare class Deferred<T> {
    promise: Promise<T>;
    resolve: (...args: any[]) => any;
    reject: (...args: any[]) => any;
    constructor();
}
export declare function createDeferred<T>(): Deferred<T>;
export declare function unstrictDecode(value: Buffer): Buffer | import("@ethereumjs/util").NestedBufferArray;
export declare function toNewUint8Array(buf: Uint8Array): Uint8Array;
export {};
