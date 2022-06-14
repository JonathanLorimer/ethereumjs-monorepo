"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const evm_1 = require("../evm");
function default_1(opts) {
    if (!opts.data)
        throw new Error('opts.data missing but required');
    const data = opts.data;
    let gasUsed = opts._common.param('gasPrices', 'identity');
    gasUsed += opts._common.param('gasPrices', 'identityWord') * BigInt(Math.ceil(data.length / 32));
    if (opts.gasLimit < gasUsed) {
        return (0, evm_1.OOGResult)(opts.gasLimit);
    }
    return {
        gasUsed,
        returnValue: data,
    };
}
exports.default = default_1;
//# sourceMappingURL=04-identity.js.map