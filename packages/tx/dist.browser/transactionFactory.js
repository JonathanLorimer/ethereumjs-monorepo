"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("@ethereumjs/util");
const _1 = require(".");
class TransactionFactory {
    // It is not possible to instantiate a TransactionFactory object.
    constructor() { }
    /**
     * Create a transaction from a `txData` object
     *
     * @param txData - The transaction data. The `type` field will determine which transaction type is returned (if undefined, creates a legacy transaction)
     * @param txOptions - Options to pass on to the constructor of the transaction
     */
    static fromTxData(txData, txOptions = {}) {
        if (!('type' in txData) || txData.type === undefined) {
            // Assume legacy transaction
            return _1.Transaction.fromTxData(txData, txOptions);
        }
        else {
            const txType = Number((0, util_1.bufferToBigInt)((0, util_1.toBuffer)(txData.type)));
            if (txType === 0) {
                return _1.Transaction.fromTxData(txData, txOptions);
            }
            else if (txType === 1) {
                return _1.AccessListEIP2930Transaction.fromTxData(txData, txOptions);
            }
            else if (txType === 2) {
                return _1.FeeMarketEIP1559Transaction.fromTxData(txData, txOptions);
            }
            else {
                throw new Error(`Tx instantiation with type ${txType} not supported`);
            }
        }
    }
    /**
     * This method tries to decode serialized data.
     *
     * @param data - The data Buffer
     * @param txOptions - The transaction options
     */
    static fromSerializedData(data, txOptions = {}) {
        if (data[0] <= 0x7f) {
            // Determine the type.
            let EIP;
            switch (data[0]) {
                case 1:
                    EIP = 2930;
                    break;
                case 2:
                    EIP = 1559;
                    break;
                default:
                    throw new Error(`TypedTransaction with ID ${data[0]} unknown`);
            }
            if (EIP === 1559) {
                return _1.FeeMarketEIP1559Transaction.fromSerializedTx(data, txOptions);
            }
            else {
                // EIP === 2930
                return _1.AccessListEIP2930Transaction.fromSerializedTx(data, txOptions);
            }
        }
        else {
            return _1.Transaction.fromSerializedTx(data, txOptions);
        }
    }
    /**
     * When decoding a BlockBody, in the transactions field, a field is either:
     * A Buffer (a TypedTransaction - encoded as TransactionType || rlp(TransactionPayload))
     * A Buffer[] (Legacy Transaction)
     * This method returns the right transaction.
     *
     * @param data - A Buffer or Buffer[]
     * @param txOptions - The transaction options
     */
    static fromBlockBodyData(data, txOptions = {}) {
        if (Buffer.isBuffer(data)) {
            return this.fromSerializedData(data, txOptions);
        }
        else if (Array.isArray(data)) {
            // It is a legacy transaction
            return _1.Transaction.fromValuesArray(data, txOptions);
        }
        else {
            throw new Error('Cannot decode transaction: unknown type input');
        }
    }
}
exports.default = TransactionFactory;
//# sourceMappingURL=transactionFactory.js.map