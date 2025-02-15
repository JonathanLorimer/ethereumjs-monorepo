import { promisify } from 'util'

import { Block } from '@ethereumjs/block'
import Blockchain from '@ethereumjs/blockchain'
import Common, { Chain, Hardfork } from '@ethereumjs/common'
import { DefaultStateManager } from '@ethereumjs/statemanager'
const AsyncEventEmitter = require('async-eventemitter')
import { debug as createDebugLogger } from 'debug'
import {
  Account,
  Address,
  bigIntToBuffer,
  generateAddress,
  generateAddress2,
  KECCAK256_NULL,
  MAX_INTEGER,
  short,
} from '@ethereumjs/util'
import { SecureTrie as Trie } from '@ethereumjs/trie'

import EEI from './eei'
import { ERROR, VmError } from '../exceptions'
import { default as Interpreter, InterpreterOpts, RunState } from './interpreter'
import Message, { MessageWithTo } from './message'
import EOF from './eof'
import { getOpcodesForHF, OpcodeList, OpHandler } from './opcodes'
import { AsyncDynamicGasHandler, SyncDynamicGasHandler } from './opcodes/gas'
import { CustomPrecompile, getActivePrecompiles, PrecompileFunc } from './precompiles'
import { TransientStorage } from '../state'
import { CustomOpcode, Log, RunCallOpts, RunCodeOpts, TxContext } from './types'
import { VmState } from '../vmState'

const debug = createDebugLogger('vm:evm')
const debugGas = createDebugLogger('vm:evm:gas')

// very ugly way to detect if we are running in a browser
const isBrowser = new Function('try {return this===window;}catch(e){ return false;}')
let mcl: any
let mclInitPromise: any

if (!isBrowser()) {
  mcl = require('mcl-wasm')
  mclInitPromise = mcl.init(mcl.BLS12_381)
}

/**
 * Options for instantiating a {@link VM}.
 */
export interface EVMOpts {
  /**
   * Use a {@link Common} instance for EVM instantiation.
   *
   * ### Supported EIPs
   *
   * - [EIP-1153](https://eips.ethereum.org/EIPS/eip-1153) - Transient Storage Opcodes (`experimental`)
   * - [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) - EIP-1559 Fee Market
   * - [EIP-2315](https://eips.ethereum.org/EIPS/eip-2315) - VM simple subroutines (`experimental`)
   * - [EIP-2537](https://eips.ethereum.org/EIPS/eip-2537) - BLS12-381 precompiles (`experimental`)
   * - [EIP-2565](https://eips.ethereum.org/EIPS/eip-2565) - ModExp Gas Cost
   * - [EIP-2718](https://eips.ethereum.org/EIPS/eip-2718) - Typed Transactions
   * - [EIP-2929](https://eips.ethereum.org/EIPS/eip-2929) - Gas cost increases for state access opcodes
   * - [EIP-2930](https://eips.ethereum.org/EIPS/eip-2930) - Access List Transaction Type
   * - [EIP-3198](https://eips.ethereum.org/EIPS/eip-3198) - BASEFEE opcode
   * - [EIP-3529](https://eips.ethereum.org/EIPS/eip-3529) - Reduction in refunds
   * - [EIP-3540](https://eips.ethereum.org/EIPS/eip-3541) - EVM Object Format (EOF) v1 (`experimental`)
   * - [EIP-3541](https://eips.ethereum.org/EIPS/eip-3541) - Reject new contracts starting with the 0xEF byte
   *   [EIP-3651](https://eips.ethereum.org/EIPS/eip-3651) - Warm COINBASE (`experimental`)
   * - [EIP-3670](https://eips.ethereum.org/EIPS/eip-3670) - EOF - Code Validation (`experimental`)
   * - [EIP-3855](https://eips.ethereum.org/EIPS/eip-3855) - PUSH0 instruction (`experimental`)
   * - [EIP-3860](https://eips.ethereum.org/EIPS/eip-3860) - Limit and meter initcode (`experimental`)
   * - [EIP-4399](https://eips.ethereum.org/EIPS/eip-4399) - Supplant DIFFICULTY opcode with PREVRANDAO (Merge) (`experimental`)
   *
   * *Annotations:*
   *
   * - `experimental`: behaviour can change on patch versions
   */
  common?: Common
  /**
   * A {@link VmState} instance to use as the state store
   */
  vmState?: VmState

  /**
   * A {@link Blockchain} object for storing/retrieving blocks
   *
   * Temporary
   */
  blockchain?: Blockchain
  /**
   * Allows unlimited contract sizes while debugging. By setting this to `true`, the check for
   * contract size limit of 24KB (see [EIP-170](https://git.io/vxZkK)) is bypassed.
   *
   * Default: `false` [ONLY set to `true` during debugging]
   */
  allowUnlimitedContractSize?: boolean

  /**
   * Override or add custom opcodes to the VM instruction set
   * These custom opcodes are EIP-agnostic and are always statically added
   * To delete an opcode, add an entry of format `{opcode: number}`. This will delete that opcode from the VM.
   * If this opcode is then used in the VM, the `INVALID` opcode would instead be used.
   * To add an opcode, add an entry of the following format:
   * {
   *    // The opcode number which will invoke the custom opcode logic
   *    opcode: number
   *    // The name of the opcode (as seen in the `step` event)
   *    opcodeName: string
   *    // The base fee of the opcode
   *    baseFee: number
   *    // If the opcode charges dynamic gas, add this here. To charge the gas, use the `i` methods of the BN, to update the charged gas
   *    gasFunction?: function(runState: RunState, gas: BN, common: Common)
   *    // The logic of the opcode which holds the logic of changing the current state
   *    logicFunction: function(runState: RunState)
   * }
   * Note: gasFunction and logicFunction can both be async or synchronous functions
   */
  customOpcodes?: CustomOpcode[]

  /*
   * Adds custom precompiles. This is hardfork-agnostic: these precompiles are always activated
   * If only an address is given, the precompile is deleted
   * If an address and a `PrecompileFunc` is given, this precompile is inserted or overridden
   * Please ensure `PrecompileFunc` has exactly one parameter `input: PrecompileInput`
   */
  customPrecompiles?: CustomPrecompile[]
}

/**
 * Result of executing a message via the {@link EVM}.
 */
export interface EVMResult {
  /**
   * Address of created account during transaction, if any
   */
  createdAddress?: Address
  /**
   * Contains the results from running the code, if any, as described in {@link runCode}
   */
  execResult: ExecResult
  /**
   * Total amount of gas to be refunded from all nested calls.
   */
  gasRefund?: bigint
}

/**
 * Result of executing a call via the {@link EVM}.
 */
export interface ExecResult {
  runState?: RunState
  /**
   * Description of the exception, if any occurred
   */
  exceptionError?: VmError
  /**
   * Amount of gas left
   */
  gas?: bigint
  /**
   * Amount of gas the code used to run
   */
  gasUsed: bigint
  /**
   * Return value from the contract
   */
  returnValue: Buffer
  /**
   * Array of logs that the contract emitted
   */
  logs?: Log[]
  /**
   * A map from the accounts that have self-destructed to the addresses to send their funds to
   */
  selfdestruct?: { [k: string]: Buffer }
}

export interface NewContractEvent {
  address: Address
  // The deployment code
  code: Buffer
}

export function OOGResult(gasLimit: bigint): ExecResult {
  return {
    returnValue: Buffer.alloc(0),
    gasUsed: gasLimit,
    exceptionError: new VmError(ERROR.OUT_OF_GAS),
  }
}
// CodeDeposit OOG Result
export function COOGResult(gasUsedCreateCode: bigint): ExecResult {
  return {
    returnValue: Buffer.alloc(0),
    gasUsed: gasUsedCreateCode,
    exceptionError: new VmError(ERROR.CODESTORE_OUT_OF_GAS),
  }
}

export function INVALID_BYTECODE_RESULT(gasLimit: bigint): ExecResult {
  return {
    returnValue: Buffer.alloc(0),
    gasUsed: gasLimit,
    exceptionError: new VmError(ERROR.INVALID_BYTECODE_RESULT),
  }
}

export function INVALID_EOF_RESULT(gasLimit: bigint): ExecResult {
  return {
    returnValue: Buffer.alloc(0),
    gasUsed: gasLimit,
    exceptionError: new VmError(ERROR.INVALID_EOF_FORMAT),
  }
}

export function VmErrorResult(error: VmError, gasUsed: bigint): ExecResult {
  return {
    returnValue: Buffer.alloc(0),
    gasUsed: gasUsed,
    exceptionError: error,
  }
}

/**
 * EVM is responsible for executing an EVM message fully
 * (including any nested calls and creates), processing the results
 * and storing them to state (or discarding changes in case of exceptions).
 * @ignore
 */
export default class EVM extends AsyncEventEmitter {
  _state: VmState
  _tx?: TxContext
  _block?: Block
  /**
   * Amount of gas to refund from deleting storage values
   */
  _refund: bigint
  _transientStorage: TransientStorage

  _common: Common

  protected _blockchain: Blockchain

  // This opcode data is always set since `getActiveOpcodes()` is called in the constructor
  public _opcodes!: OpcodeList

  public readonly _allowUnlimitedContractSize: boolean

  protected readonly _customOpcodes?: CustomOpcode[]
  protected readonly _customPrecompiles?: CustomPrecompile[]

  public _handlers!: Map<number, OpHandler>
  public _dynamicGasHandlers!: Map<number, AsyncDynamicGasHandler | SyncDynamicGasHandler>

  protected _precompiles!: Map<string, PrecompileFunc>

  public get precompiles() {
    return this._precompiles
  }

  /**
   * Cached emit() function, not for public usage
   * set to public due to implementation internals
   * @hidden
   */
  public readonly _emit: (topic: string, data: any) => Promise<void>

  /**
   * Pointer to the mcl package, not for public usage
   * set to public due to implementation internals
   * @hidden
   */
  public readonly _mcl: any //

  /**
   * EVM is run in DEBUG mode (default: false)
   * Taken from DEBUG environment variable
   *
   * Safeguards on debug() calls are added for
   * performance reasons to avoid string literal evaluation
   * @hidden
   */
  readonly DEBUG: boolean = false

  /**
   * EVM async constructor. Creates engine instance and initializes it.
   *
   * @param opts EVM engine constructor options
   */
  static async create(opts: EVMOpts): Promise<EVM> {
    const evm = new this(opts)
    await evm.init()
    return evm
  }

  constructor(opts: EVMOpts) {
    super()

    this._refund = BigInt(0)
    this._transientStorage = new TransientStorage()

    if (opts.common) {
      this._common = opts.common
    } else {
      const DEFAULT_CHAIN = Chain.Mainnet
      this._common = new Common({ chain: DEFAULT_CHAIN })
    }

    // Supported EIPs
    const supportedEIPs = [
      1153, 1559, 2315, 2537, 2565, 2718, 2929, 2930, 3074, 3198, 3529, 3540, 3541, 3607, 3651,
      3670, 3855, 3860, 4399,
    ]

    for (const eip of this._common.eips()) {
      if (!supportedEIPs.includes(eip)) {
        throw new Error(`EIP-${eip} is not supported by the EVM`)
      }
    }

    if (opts.vmState) {
      this._state = opts.vmState
    } else {
      const trie = new Trie()
      const stateManager = new DefaultStateManager({
        trie,
        common: this._common,
      })
      this._state = new VmState({ common: this._common, stateManager })
    }
    this._blockchain = opts.blockchain ?? new (Blockchain as any)({ common: this._common })

    this._allowUnlimitedContractSize = opts.allowUnlimitedContractSize ?? false
    this._customOpcodes = opts.customOpcodes
    this._customPrecompiles = opts.customPrecompiles

    this._common.on('hardforkChanged', () => {
      this.getActiveOpcodes()
    })

    // Initialize the opcode data
    this.getActiveOpcodes()
    this._precompiles = getActivePrecompiles(this._common, this._customPrecompiles)

    if (this._common.isActivatedEIP(2537)) {
      if (isBrowser()) {
        throw new Error('EIP-2537 is currently not supported in browsers')
      } else {
        this._mcl = mcl
      }
    }

    // Safeguard if "process" is not available (browser)
    if (process !== undefined && process.env.DEBUG) {
      this.DEBUG = true
    }

    // We cache this promisified function as it's called from the main execution loop, and
    // promisifying each time has a huge performance impact.
    this._emit = promisify(this.emit.bind(this))
  }

  async init(): Promise<void> {
    if (this._isInitialized) {
      return
    }

    if (this._common.isActivatedEIP(2537)) {
      if (isBrowser()) {
        throw new Error('EIP-2537 is currently not supported in browsers')
      } else {
        const mcl = this._mcl
        await mclInitPromise // ensure that mcl is initialized.
        mcl.setMapToMode(mcl.IRTF) // set the right map mode; otherwise mapToG2 will return wrong values.
        mcl.verifyOrderG1(1) // subgroup checks for G1
        mcl.verifyOrderG2(1) // subgroup checks for G2
      }
    }

    this._isInitialized = true
  }

  /**
   * Returns a list with the currently activated opcodes
   * available for VM execution
   */
  getActiveOpcodes(): OpcodeList {
    const data = getOpcodesForHF(this._common, this._customOpcodes)
    this._opcodes = data.opcodes
    this._dynamicGasHandlers = data.dynamicGasHandlers
    this._handlers = data.handlers
    return data.opcodes
  }

  async _executeCall(message: MessageWithTo): Promise<EVMResult> {
    const account = await this._state.getAccount(message.authcallOrigin ?? message.caller)
    let errorMessage
    // Reduce tx value from sender
    if (!message.delegatecall) {
      try {
        await this._reduceSenderBalance(account, message)
      } catch (e) {
        errorMessage = e
      }
    }
    // Load `to` account
    const toAccount = await this._state.getAccount(message.to)
    // Add tx value to the `to` account
    if (!message.delegatecall) {
      try {
        await this._addToBalance(toAccount, message)
      } catch (e: any) {
        errorMessage = e
      }
    }

    // Load code
    await this._loadCode(message)
    let exit = false
    if (!message.code || message.code.length === 0) {
      exit = true
      if (this.DEBUG) {
        debug(`Exit early on no code`)
      }
    }
    if (errorMessage) {
      exit = true
      if (this.DEBUG) {
        debug(`Exit early on value transfer overflowed`)
      }
    }
    if (exit) {
      return {
        execResult: {
          gasUsed: BigInt(0),
          exceptionError: errorMessage, // Only defined if addToBalance failed
          returnValue: Buffer.alloc(0),
        },
      }
    }

    let result: ExecResult
    if (message.isCompiled) {
      if (this.DEBUG) {
        debug(`Run precompile`)
      }
      result = await this.runPrecompile(
        message.code as PrecompileFunc,
        message.data,
        message.gasLimit
      )
    } else {
      if (this.DEBUG) {
        debug(`Start bytecode processing...`)
      }
      result = await this.runInterpreter(message)
    }

    return {
      execResult: result,
    }
  }

  async _executeCreate(message: Message): Promise<EVMResult> {
    const account = await this._state.getAccount(message.caller)
    // Reduce tx value from sender
    await this._reduceSenderBalance(account, message)

    if (this._common.isActivatedEIP(3860)) {
      if (message.data.length > Number(this._common.param('vm', 'maxInitCodeSize'))) {
        return {
          createdAddress: message.to,
          execResult: {
            returnValue: Buffer.alloc(0),
            exceptionError: new VmError(ERROR.INITCODE_SIZE_VIOLATION),
            gasUsed: message.gasLimit,
          },
        }
      }
    }

    message.code = message.data
    message.data = Buffer.alloc(0)
    message.to = await this._generateAddress(message)
    if (this.DEBUG) {
      debug(`Generated CREATE contract address ${message.to}`)
    }
    let toAccount = await this._state.getAccount(message.to)

    // Check for collision
    if (
      (toAccount.nonce && toAccount.nonce > BigInt(0)) ||
      !toAccount.codeHash.equals(KECCAK256_NULL)
    ) {
      if (this.DEBUG) {
        debug(`Returning on address collision`)
      }
      return {
        createdAddress: message.to,
        execResult: {
          returnValue: Buffer.alloc(0),
          exceptionError: new VmError(ERROR.CREATE_COLLISION),
          gasUsed: message.gasLimit,
        },
      }
    }

    await this._state.clearContractStorage(message.to)

    const newContractEvent: NewContractEvent = {
      address: message.to,
      code: message.code,
    }

    await this._emit('newContract', newContractEvent)

    toAccount = await this._state.getAccount(message.to)
    // EIP-161 on account creation and CREATE execution
    if (this._common.gteHardfork(Hardfork.SpuriousDragon)) {
      toAccount.nonce += BigInt(1)
    }

    // Add tx value to the `to` account
    let errorMessage
    try {
      await this._addToBalance(toAccount, message as MessageWithTo)
    } catch (e: any) {
      errorMessage = e
    }

    let exit = false
    if (!message.code || message.code.length === 0) {
      exit = true
      if (this.DEBUG) {
        debug(`Exit early on no code`)
      }
    }
    if (errorMessage) {
      exit = true
      if (this.DEBUG) {
        debug(`Exit early on value transfer overflowed`)
      }
    }
    if (exit) {
      return {
        createdAddress: message.to,
        execResult: {
          gasUsed: BigInt(0),
          exceptionError: errorMessage, // only defined if addToBalance failed
          returnValue: Buffer.alloc(0),
        },
      }
    }

    if (this.DEBUG) {
      debug(`Start bytecode processing...`)
    }

    let result = await this.runInterpreter(message)
    // fee for size of the return value
    let totalGas = result.gasUsed
    let returnFee = BigInt(0)
    if (!result.exceptionError) {
      returnFee =
        BigInt(result.returnValue.length) * BigInt(this._common.param('gasPrices', 'createData'))
      totalGas = totalGas + returnFee
      if (this.DEBUG) {
        debugGas(`Add return value size fee (${returnFee} to gas used (-> ${totalGas}))`)
      }
    }

    // Check for SpuriousDragon EIP-170 code size limit
    let allowedCodeSize = true
    if (
      !result.exceptionError &&
      this._common.gteHardfork(Hardfork.SpuriousDragon) &&
      result.returnValue.length > Number(this._common.param('vm', 'maxCodeSize'))
    ) {
      allowedCodeSize = false
    }

    // If enough gas and allowed code size
    let CodestoreOOG = false
    if (totalGas <= message.gasLimit && (this._allowUnlimitedContractSize || allowedCodeSize)) {
      if (this._common.isActivatedEIP(3541) && result.returnValue[0] === EOF.FORMAT) {
        if (!this._common.isActivatedEIP(3540)) {
          result = { ...result, ...INVALID_BYTECODE_RESULT(message.gasLimit) }
        }
        // Begin EOF1 contract code checks
        // EIP-3540 EOF1 header check
        const eof1CodeAnalysisResults = EOF.codeAnalysis(result.returnValue)
        if (!eof1CodeAnalysisResults?.code) {
          result = {
            ...result,
            ...INVALID_EOF_RESULT(message.gasLimit),
          }
        } else if (this._common.isActivatedEIP(3670)) {
          // EIP-3670 EOF1 opcode check
          const codeStart = eof1CodeAnalysisResults.data > 0 ? 10 : 7
          // The start of the code section of an EOF1 compliant contract will either be
          // index 7 (if no data section is present) or index 10 (if a data section is present)
          // in the bytecode of the contract
          if (
            !EOF.validOpcodes(
              result.returnValue.slice(codeStart, codeStart + eof1CodeAnalysisResults.code)
            )
          ) {
            result = {
              ...result,
              ...INVALID_EOF_RESULT(message.gasLimit),
            }
          } else {
            result.gasUsed = totalGas
          }
        }
      } else {
        result.gasUsed = totalGas
      }
    } else {
      if (this._common.gteHardfork(Hardfork.Homestead)) {
        if (this.DEBUG) {
          debug(`Not enough gas or code size not allowed (>= Homestead)`)
        }
        result = { ...result, ...OOGResult(message.gasLimit) }
      } else {
        // we are in Frontier
        if (this.DEBUG) {
          debug(`Not enough gas or code size not allowed (Frontier)`)
        }
        if (totalGas - returnFee <= message.gasLimit) {
          // we cannot pay the code deposit fee (but the deposit code actually did run)
          result = { ...result, ...COOGResult(totalGas - returnFee) }
          CodestoreOOG = true
        } else {
          result = { ...result, ...OOGResult(message.gasLimit) }
        }
      }
    }

    // Save code if a new contract was created
    if (!result.exceptionError && result.returnValue && result.returnValue.toString() !== '') {
      await this._state.putContractCode(message.to, result.returnValue)
      if (this.DEBUG) {
        debug(`Code saved on new contract creation`)
      }
    } else if (CodestoreOOG) {
      // This only happens at Frontier. But, let's do a sanity check;
      if (!this._common.gteHardfork(Hardfork.Homestead)) {
        // Pre-Homestead behavior; put an empty contract.
        // This contract would be considered "DEAD" in later hard forks.
        // It is thus an unecessary default item, which we have to save to dik
        // It does change the state root, but it only wastes storage.
        //await this._state.putContractCode(message.to, result.returnValue)
        const account = await this._state.getAccount(message.to)
        await this._state.putAccount(message.to, account)
      }
    }

    return {
      createdAddress: message.to,
      execResult: result,
    }
  }

  /**
   * Starts the actual bytecode processing for a CALL or CREATE, providing
   * it with the {@link EEI}.
   */
  async runInterpreter(message: Message, opts: InterpreterOpts = {}): Promise<ExecResult> {
    const env = {
      blockchain: this._blockchain, // Only used in BLOCKHASH
      address: message.to ?? Address.zero(),
      caller: message.caller ?? Address.zero(),
      callData: message.data ?? Buffer.from([0]),
      callValue: message.value ?? BigInt(0),
      code: message.code as Buffer,
      isStatic: message.isStatic ?? false,
      depth: message.depth ?? 0,
      gasPrice: this._tx!.gasPrice,
      origin: this._tx!.origin ?? message.caller ?? Address.zero(),
      block: this._block ?? new Block(),
      contract: await this._state.getAccount(message.to ?? Address.zero()),
      codeAddress: message.codeAddress,
    }
    const eei = new EEI(
      env,
      this._state,
      this,
      this._common,
      message.gasLimit,
      this._transientStorage
    )
    if (message.selfdestruct) {
      eei._result.selfdestruct = message.selfdestruct as { [key: string]: Buffer }
    }

    const interpreter = new Interpreter(this, eei)
    const interpreterRes = await interpreter.run(message.code as Buffer, opts)

    let result = eei._result
    let gasUsed = message.gasLimit - eei._gasLeft
    if (interpreterRes.exceptionError) {
      if (
        interpreterRes.exceptionError.error !== ERROR.REVERT &&
        interpreterRes.exceptionError.error !== ERROR.INVALID_EOF_FORMAT
      ) {
        gasUsed = message.gasLimit
      }

      // Clear the result on error
      result = {
        ...result,
        logs: [],
        selfdestruct: {},
      }
    }

    return {
      ...result,
      runState: {
        ...interpreterRes.runState!,
        ...result,
        ...eei._env,
      },
      exceptionError: interpreterRes.exceptionError,
      gas: eei._gasLeft,
      gasUsed,
      returnValue: result.returnValue ? result.returnValue : Buffer.alloc(0),
    }
  }

  /**
   * Executes an EVM message, determining whether it's a call or create
   * based on the `to` address. It checkpoints the state and reverts changes
   * if an exception happens during the message execution.
   */
  async runCall(opts: RunCallOpts): Promise<EVMResult> {
    let message = opts.message
    if (!message) {
      this._block = opts.block ?? Block.fromBlockData({}, { common: this._common })
      this._tx = {
        gasPrice: opts.gasPrice ?? BigInt(0),
        origin: opts.origin ?? opts.caller ?? Address.zero(),
      }

      const caller = opts.caller ?? Address.zero()
      const value = opts.value ?? BigInt(0)
      if (opts.skipBalance) {
        // if skipBalance, add `value` to caller balance to ensure sufficient funds
        const callerAccount = await this._state.getAccount(caller)
        callerAccount.balance += value
        await this._state.putAccount(caller, callerAccount)
      }

      message = new Message({
        caller,
        gasLimit: opts.gasLimit ?? BigInt(0xffffff),
        to: opts.to,
        value,
        data: opts.data,
        code: opts.code,
        depth: opts.depth,
        isCompiled: opts.isCompiled,
        isStatic: opts.isStatic,
        salt: opts.salt,
        selfdestruct: opts.selfdestruct ?? {},
        delegatecall: opts.delegatecall,
      })
    }

    await this._emit('beforeMessage', message)

    if (!message.to && this._common.isActivatedEIP(2929)) {
      message.code = message.data
      this._state.addWarmedAddress((await this._generateAddress(message)).buf)
    }

    const oldRefund = this._refund

    await this._state.checkpoint()
    this._transientStorage.checkpoint()
    if (this.DEBUG) {
      debug('-'.repeat(100))
      debug(`message checkpoint`)
    }

    let result
    if (this.DEBUG) {
      const { caller, gasLimit, to, value, delegatecall } = message
      debug(
        `New message caller=${caller} gasLimit=${gasLimit} to=${
          to?.toString() ?? 'none'
        } value=${value} delegatecall=${delegatecall ? 'yes' : 'no'}`
      )
    }
    if (message.to) {
      if (this.DEBUG) {
        debug(`Message CALL execution (to: ${message.to})`)
      }
      result = await this._executeCall(message as MessageWithTo)
    } else {
      if (this.DEBUG) {
        debug(`Message CREATE execution (to undefined)`)
      }
      result = await this._executeCreate(message)
    }
    if (this.DEBUG) {
      const { gasUsed, exceptionError, returnValue } = result.execResult
      debug(
        `Received message execResult: [ gasUsed=${gasUsed} exceptionError=${
          exceptionError ? `'${exceptionError.error}'` : 'none'
        } returnValue=0x${short(returnValue)} gasRefund=${result.gasRefund ?? 0} ]`
      )
    }
    const err = result.execResult.exceptionError
    // This clause captures any error which happened during execution
    // If that is the case, then set the _refund tracker to the old refund value
    if (err) {
      this._refund = oldRefund
      result.execResult.selfdestruct = {}
    }
    result.gasRefund = this._refund
    if (err) {
      if (this._common.gteHardfork(Hardfork.Homestead) || err.error != ERROR.CODESTORE_OUT_OF_GAS) {
        result.execResult.logs = []
        await this._state.revert()
        this._transientStorage.revert()
        if (this.DEBUG) {
          debug(`message checkpoint reverted`)
        }
      } else {
        // we are in chainstart and the error was the code deposit error
        // we do like nothing happened.
        await this._state.commit()
        this._transientStorage.commit()
        if (this.DEBUG) {
          debug(`message checkpoint committed`)
        }
      }
    } else {
      await this._state.commit()
      this._transientStorage.commit()
      if (this.DEBUG) {
        debug(`message checkpoint committed`)
      }
    }
    await this._emit('afterMessage', result)

    return result
  }

  /**
   * Bound to the global VM and therefore
   * shouldn't be used directly from the evm class
   */
  async runCode(opts: RunCodeOpts): Promise<ExecResult> {
    this._block = opts.block ?? Block.fromBlockData({}, { common: this._common })

    this._tx = {
      gasPrice: opts.gasPrice ?? BigInt(0),
      origin: opts.origin ?? opts.caller ?? Address.zero(),
    }

    const message = new Message({
      code: opts.code,
      data: opts.data,
      gasLimit: opts.gasLimit,
      to: opts.address ?? Address.zero(),
      caller: opts.caller,
      value: opts.value,
      depth: opts.depth,
      selfdestruct: opts.selfdestruct ?? {},
      isStatic: opts.isStatic,
    })

    return this.runInterpreter(message, { pc: opts.pc })
  }

  /**
   * Returns code for precompile at the given address, or undefined
   * if no such precompile exists.
   */
  getPrecompile(address: Address): PrecompileFunc | undefined {
    return this.precompiles.get(address.buf.toString('hex'))
  }

  /**
   * Executes a precompiled contract with given data and gas limit.
   */
  runPrecompile(
    code: PrecompileFunc,
    data: Buffer,
    gasLimit: bigint
  ): Promise<ExecResult> | ExecResult {
    if (typeof code !== 'function') {
      throw new Error('Invalid precompile')
    }

    const opts = {
      data,
      gasLimit,
      _common: this._common,
      _EVM: this,
    }

    return code(opts)
  }

  async _loadCode(message: Message): Promise<void> {
    if (!message.code) {
      const precompile = this.getPrecompile(message.codeAddress)
      if (precompile) {
        message.code = precompile
        message.isCompiled = true
      } else {
        message.code = await this._state.getContractCode(message.codeAddress)
        message.isCompiled = false
      }
    }
  }

  async _generateAddress(message: Message): Promise<Address> {
    let addr
    if (message.salt) {
      addr = generateAddress2(message.caller.buf, message.salt, message.code as Buffer)
    } else {
      const acc = await this._state.getAccount(message.caller)
      const newNonce = acc.nonce - BigInt(1)
      addr = generateAddress(message.caller.buf, bigIntToBuffer(newNonce))
    }
    return new Address(addr)
  }

  async _reduceSenderBalance(account: Account, message: Message): Promise<void> {
    account.balance -= message.value
    if (account.balance < BigInt(0)) {
      throw new VmError(ERROR.INSUFFICIENT_BALANCE)
    }
    const result = this._state.putAccount(message.authcallOrigin ?? message.caller, account)
    if (this.DEBUG) {
      debug(`Reduced sender (${message.caller}) balance (-> ${account.balance})`)
    }
    return result
  }

  async _addToBalance(toAccount: Account, message: MessageWithTo): Promise<void> {
    const newBalance = toAccount.balance + message.value
    if (newBalance > MAX_INTEGER) {
      throw new VmError(ERROR.VALUE_OVERFLOW)
    }
    toAccount.balance = newBalance
    // putAccount as the nonce may have changed for contract creation
    const result = this._state.putAccount(message.to, toAccount)
    if (this.DEBUG) {
      debug(`Added toAccount (${message.to}) balance (-> ${toAccount.balance})`)
    }
    return result
  }

  async _touchAccount(address: Address): Promise<void> {
    const account = await this._state.getAccount(address)
    return this._state.putAccount(address, account)
  }
}
