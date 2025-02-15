"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("@ethereumjs/util");
const evm_1 = require("../evm");
function default_1(opts) {
    if (!opts.data)
        throw new Error('opts.data missing but required');
    const gasUsed = opts._common.param('gasPrices', 'ecRecover');
    if (opts.gasLimit < gasUsed) {
        return (0, evm_1.OOGResult)(opts.gasLimit);
    }
    const data = (0, util_1.setLengthRight)(opts.data, 128);
    const msgHash = data.slice(0, 32);
    const v = data.slice(32, 64);
    const vBigInt = (0, util_1.bufferToBigInt)(v);
    // Guard against util's `ecrecover`: without providing chainId this will return
    // a signature in most of the cases in the cases that `v=0` or `v=1`
    // However, this should throw, only 27 and 28 is allowed as input
    if (vBigInt !== BigInt(27) && vBigInt !== BigInt(28)) {
        return {
            gasUsed,
            returnValue: Buffer.alloc(0),
        };
    }
    const r = data.slice(64, 96);
    const s = data.slice(96, 128);
    let publicKey;
    try {
        publicKey = (0, util_1.ecrecover)(msgHash, (0, util_1.bufferToBigInt)(v), r, s);
    }
    catch (e) {
        return {
            gasUsed,
            returnValue: Buffer.alloc(0),
        };
    }
    return {
        gasUsed,
        returnValue: (0, util_1.setLengthLeft)((0, util_1.publicToAddress)(publicKey), 32),
    };
}
exports.default = default_1;
//# sourceMappingURL=01-ecrecover.js.map