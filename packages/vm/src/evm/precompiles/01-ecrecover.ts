import {
  setLengthLeft,
  setLengthRight,
  ecrecover,
  publicToAddress,
  bufferToBigInt,
} from '@ethereumjs/util'
import { PrecompileInput } from './types'
import { OOGResult, ExecResult } from '../evm'

export default function (opts: PrecompileInput): ExecResult {
  if (!opts.data) throw new Error('opts.data missing but required')

  const gasUsed = opts._common.param('gasPrices', 'ecRecover')

  if (opts.gasLimit < gasUsed) {
    return OOGResult(opts.gasLimit)
  }

  const data = setLengthRight(opts.data, 128)

  const msgHash = data.slice(0, 32)
  const v = data.slice(32, 64)
  const vBigInt = bufferToBigInt(v)

  // Guard against util's `ecrecover`: without providing chainId this will return
  // a signature in most of the cases in the cases that `v=0` or `v=1`
  // However, this should throw, only 27 and 28 is allowed as input
  if (vBigInt !== BigInt(27) && vBigInt !== BigInt(28)) {
    return {
      gasUsed,
      returnValue: Buffer.alloc(0),
    }
  }

  const r = data.slice(64, 96)
  const s = data.slice(96, 128)

  let publicKey
  try {
    publicKey = ecrecover(msgHash, bufferToBigInt(v), r, s)
  } catch (e: any) {
    return {
      gasUsed,
      returnValue: Buffer.alloc(0),
    }
  }

  return {
    gasUsed,
    returnValue: setLengthLeft(publicToAddress(publicKey), 32),
  }
}
