"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const evm_1 = require("../evm");
const bn128 = require('rustbn.js');
function default_1(opts) {
    if (!opts.data)
        throw new Error('opts.data missing but required');
    const inputData = opts.data;
    const gasUsed = opts._common.param('gasPrices', 'ecAdd');
    if (opts.gasLimit < gasUsed) {
        return (0, evm_1.OOGResult)(opts.gasLimit);
    }
    const returnData = bn128.add(inputData);
    // check ecadd success or failure by comparing the output length
    if (returnData.length !== 64) {
        return (0, evm_1.OOGResult)(opts.gasLimit);
    }
    return {
        gasUsed,
        returnValue: returnData,
    };
}
exports.default = default_1;
//# sourceMappingURL=06-ecadd.js.map