import { PrecompileInput } from './types'
import { OOGResult, ExecResult } from '../evm'
const bn128 = require('rustbn.js')

export default function (opts: PrecompileInput): ExecResult {
  if (!opts.data) throw new Error('opts.data missing but required')

  const inputData = opts.data
  // no need to care about non-divisible-by-192, because bn128.pairing will properly fail in that case
  const inputDataSize = BigInt(Math.floor(inputData.length / 192))
  const gasUsed =
    opts._common.param('gasPrices', 'ecPairing') +
    inputDataSize * opts._common.param('gasPrices', 'ecPairingWord')

  if (opts.gasLimit < gasUsed) {
    return OOGResult(opts.gasLimit)
  }

  const returnData = bn128.pairing(inputData)

  // check ecpairing success or failure by comparing the output length
  if (returnData.length !== 32) {
    return OOGResult(opts.gasLimit)
  }

  return {
    gasUsed,
    returnValue: returnData,
  }
}
