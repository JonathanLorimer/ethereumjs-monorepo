"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ripemd160_1 = require("ethereum-cryptography/ripemd160");
const util_1 = require("@ethereumjs/util");
const evm_1 = require("../evm");
function default_1(opts) {
    if (!opts.data)
        throw new Error('opts.data missing but required');
    const data = opts.data;
    let gasUsed = opts._common.param('gasPrices', 'ripemd160');
    gasUsed += opts._common.param('gasPrices', 'ripemd160Word') * BigInt(Math.ceil(data.length / 32));
    if (opts.gasLimit < gasUsed) {
        return (0, evm_1.OOGResult)(opts.gasLimit);
    }
    return {
        gasUsed,
        returnValue: (0, util_1.setLengthLeft)((0, util_1.toBuffer)((0, ripemd160_1.ripemd160)(data)), 32),
    };
}
exports.default = default_1;
//# sourceMappingURL=03-ripemd160.js.map