"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sha256_1 = require("ethereum-cryptography/sha256");
const util_1 = require("@ethereumjs/util");
const evm_1 = require("../evm");
function default_1(opts) {
    if (!opts.data)
        throw new Error('opts.data missing but required');
    const data = opts.data;
    let gasUsed = opts._common.param('gasPrices', 'sha256');
    gasUsed += opts._common.param('gasPrices', 'sha256Word') * BigInt(Math.ceil(data.length / 32));
    if (opts.gasLimit < gasUsed) {
        return (0, evm_1.OOGResult)(opts.gasLimit);
    }
    return {
        gasUsed,
        returnValue: (0, util_1.toBuffer)((0, sha256_1.sha256)(data)),
    };
}
exports.default = default_1;
//# sourceMappingURL=02-sha256.js.map