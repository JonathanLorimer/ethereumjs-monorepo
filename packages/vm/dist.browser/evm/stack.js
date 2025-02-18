"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("@ethereumjs/util");
const exceptions_1 = require("../exceptions");
/**
 * Implementation of the stack used in evm.
 */
class Stack {
    constructor(maxHeight) {
        this._store = [];
        this._maxHeight = maxHeight ?? 1024;
    }
    get length() {
        return this._store.length;
    }
    push(value) {
        if (typeof value !== 'bigint') {
            throw new exceptions_1.VmError(exceptions_1.ERROR.INTERNAL_ERROR);
        }
        if (value > util_1.MAX_INTEGER_BIGINT) {
            throw new exceptions_1.VmError(exceptions_1.ERROR.OUT_OF_RANGE);
        }
        if (this._store.length >= this._maxHeight) {
            throw new exceptions_1.VmError(exceptions_1.ERROR.STACK_OVERFLOW);
        }
        this._store.push(value);
    }
    pop() {
        if (this._store.length < 1) {
            throw new exceptions_1.VmError(exceptions_1.ERROR.STACK_UNDERFLOW);
        }
        // Length is checked above, so pop shouldn't return undefined
        return this._store.pop();
    }
    /**
     * Pop multiple items from stack. Top of stack is first item
     * in returned array.
     * @param num - Number of items to pop
     */
    popN(num = 1) {
        if (this._store.length < num) {
            throw new exceptions_1.VmError(exceptions_1.ERROR.STACK_UNDERFLOW);
        }
        if (num === 0) {
            return [];
        }
        return this._store.splice(-1 * num).reverse();
    }
    /**
     * Return items from the stack
     * @param num Number of items to return
     * @throws {@link ERROR.STACK_UNDERFLOW}
     */
    peek(num = 1) {
        const peekArray = [];
        for (let peek = 1; peek <= num; peek++) {
            const index = this._store.length - peek;
            if (index < 0) {
                throw new exceptions_1.VmError(exceptions_1.ERROR.STACK_UNDERFLOW);
            }
            peekArray.push(this._store[index]);
        }
        return peekArray;
    }
    /**
     * Swap top of stack with an item in the stack.
     * @param position - Index of item from top of the stack (0-indexed)
     */
    swap(position) {
        if (this._store.length <= position) {
            throw new exceptions_1.VmError(exceptions_1.ERROR.STACK_UNDERFLOW);
        }
        const head = this._store.length - 1;
        const i = this._store.length - position - 1;
        const tmp = this._store[head];
        this._store[head] = this._store[i];
        this._store[i] = tmp;
    }
    /**
     * Pushes a copy of an item in the stack.
     * @param position - Index of item to be copied (1-indexed)
     */
    // I would say that we do not need this method any more
    // since you can't copy a primitive data type
    // Nevertheless not sure if we "loose" something here?
    // Will keep commented out for now
    dup(position) {
        if (this._store.length < position) {
            throw new exceptions_1.VmError(exceptions_1.ERROR.STACK_UNDERFLOW);
        }
        const i = this._store.length - position;
        this.push(this._store[i]);
    }
}
exports.default = Stack;
//# sourceMappingURL=stack.js.map