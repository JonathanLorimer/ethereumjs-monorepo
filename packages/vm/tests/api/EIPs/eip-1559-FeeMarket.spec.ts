import tape from 'tape'
import { Address, bigIntToBuffer, privateToAddress, setLengthLeft } from '@ethereumjs/util'
import VM from '../../../src'
import Common, { Chain, Hardfork } from '@ethereumjs/common'
import {
  AccessListEIP2930Transaction,
  FeeMarketEIP1559Transaction,
  Transaction,
  TypedTransaction,
} from '@ethereumjs/tx'
import { Block } from '@ethereumjs/block'

const GWEI = BigInt('1000000000')

const common = new Common({
  eips: [1559, 2718, 2930],
  chain: Chain.Mainnet,
  hardfork: Hardfork.London,
})

// Small hack to hack in the activation block number
// (Otherwise there would be need for a custom chain only for testing purposes)
common.hardforkBlock = function (hardfork: string | undefined) {
  if (hardfork === 'london') {
    return BigInt(1)
  } else if (hardfork === 'dao') {
    // Avoid DAO HF side-effects
    return BigInt(99)
  }
  return BigInt(0)
}

const coinbase = new Address(Buffer.from('11'.repeat(20), 'hex'))
const pkey = Buffer.from('20'.repeat(32), 'hex')
const sender = new Address(privateToAddress(pkey))

/**
 * Creates an EIP1559 block
 * @param baseFee - base fee of the block
 * @param transaction - the transaction in the block
 * @param txType - the txtype to use
 */
function makeBlock(baseFee: bigint, transaction: TypedTransaction, txType: number) {
  const signed = transaction.sign(pkey)
  const json = <any>signed.toJSON()
  json.type = txType
  const block = Block.fromBlockData(
    {
      header: {
        number: BigInt(1),
        coinbase,
        baseFeePerGas: baseFee,
        gasLimit: BigInt(500000),
      },
      transactions: [json],
    },
    { common }
  )
  return block
}

tape('EIP1559 tests', (t) => {
  t.test('test EIP1559 with all transaction types', async (st) => {
    const tx = new FeeMarketEIP1559Transaction(
      {
        maxFeePerGas: GWEI * BigInt(5),
        maxPriorityFeePerGas: GWEI * BigInt(2),
        to: Address.zero(),
        gasLimit: 21000,
      },
      {
        common,
      }
    )
    const block = makeBlock(GWEI, tx, 2)
    const vm = await VM.create({ common })
    let account = await vm.stateManager.getAccount(sender)
    const balance = GWEI * BigInt(21000) * BigInt(10)
    account.balance = balance
    await vm.stateManager.putAccount(sender, account)
    const results = await vm.runTx({
      tx: block.transactions[0],
      block,
    })

    // Situation:
    // Base fee is 1 GWEI
    // User is willing to pay at most 5 GWEI in the entire transaction
    // It is also willing to tip the miner 2 GWEI (at most)
    // Thus, miner should get 21000*2 GWei, and the 21000*1 GWei is burned

    let expectedCost = GWEI * BigInt(21000) * BigInt(3)
    let expectedMinerBalance = GWEI * BigInt(21000) * BigInt(2)
    let expectedAccountBalance = balance - expectedCost

    let miner = await vm.stateManager.getAccount(coinbase)

    st.equal(miner.balance, expectedMinerBalance, 'miner balance correct')
    account = await vm.stateManager.getAccount(sender)
    st.equal(account.balance, expectedAccountBalance, 'account balance correct')
    st.equal(results.amountSpent, expectedCost, 'reported cost correct')

    const tx2 = new AccessListEIP2930Transaction(
      {
        gasLimit: 21000,
        gasPrice: GWEI * BigInt(5),
        to: Address.zero(),
      },
      { common }
    )
    const block2 = makeBlock(GWEI, tx2, 1)
    await vm.stateManager.modifyAccountFields(sender, { balance })
    await vm.stateManager.modifyAccountFields(coinbase, { balance: BigInt(0) })
    const results2 = await vm.runTx({
      tx: block2.transactions[0],
      block: block2,
      skipNonce: true,
    })

    expectedCost = GWEI * BigInt(21000) * BigInt(5)
    expectedMinerBalance = GWEI * BigInt(21000) * BigInt(4)
    expectedAccountBalance = balance - expectedCost

    miner = await vm.stateManager.getAccount(coinbase)

    st.equal(miner.balance, expectedMinerBalance, 'miner balance correct')
    account = await vm.stateManager.getAccount(sender)
    st.equal(account.balance, expectedAccountBalance, 'account balance correct')
    st.equal(results2.amountSpent, expectedCost, 'reported cost correct')

    const tx3 = new Transaction(
      {
        gasLimit: 21000,
        gasPrice: GWEI * BigInt(5),
        to: Address.zero(),
      },
      { common }
    )
    const block3 = makeBlock(GWEI, tx3, 0)
    await vm.stateManager.modifyAccountFields(sender, { balance })
    await vm.stateManager.modifyAccountFields(coinbase, { balance: BigInt(0) })
    const results3 = await vm.runTx({
      tx: block3.transactions[0],
      block: block3,
      skipNonce: true,
    })

    expectedCost = GWEI * BigInt(21000) * BigInt(5)
    expectedMinerBalance = GWEI * BigInt(21000) * BigInt(4)
    expectedAccountBalance = balance - expectedCost

    miner = await vm.stateManager.getAccount(coinbase)

    st.equal(miner.balance, expectedMinerBalance, 'miner balance correct')
    account = await vm.stateManager.getAccount(sender)
    st.equal(account.balance, expectedAccountBalance, 'account balance correct')
    st.equal(results3.amountSpent, expectedCost, 'reported cost correct')

    st.end()
  })

  t.test('gasPrice uses the effective gas price', async (st) => {
    const contractAddress = new Address(Buffer.from('20'.repeat(20), 'hex'))
    const tx = new FeeMarketEIP1559Transaction(
      {
        maxFeePerGas: GWEI * BigInt(5),
        maxPriorityFeePerGas: GWEI * BigInt(2),
        to: contractAddress,
        gasLimit: 210000,
      },
      {
        common,
      }
    )
    const block = makeBlock(GWEI, tx, 2)
    const vm = await VM.create({ common })
    const balance = GWEI * BigInt(210000) * BigInt(10)
    await vm.stateManager.modifyAccountFields(sender, { balance })

    /**
     * GASPRICE
     * PUSH 0
     * MSTORE
     * PUSH 20
     * PUSH 0
     * RETURN
     */

    // (This code returns the reported GASPRICE)
    const code = Buffer.from('3A60005260206000F3', 'hex')
    await vm.stateManager.putContractCode(contractAddress, code)

    const result = await vm.runTx({ tx: block.transactions[0], block })
    const returnValue = result.execResult.returnValue

    const expectedCost = GWEI * BigInt(3)
    const expectedReturn = setLengthLeft(bigIntToBuffer(expectedCost), 32)

    st.ok(returnValue.equals(expectedReturn))
    st.end()
  })
})
