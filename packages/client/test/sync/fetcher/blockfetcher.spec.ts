import tape from 'tape'
import td from 'testdouble'
import { Config } from '../../../lib/config'
import { Chain } from '../../../lib/blockchain/chain'
import { wait } from '../../integration/util'
import { Event } from '../../../lib/types'

tape('[BlockFetcher]', async (t) => {
  class PeerPool {
    idle() {}
    ban() {}
  }
  PeerPool.prototype.idle = td.func<any>()
  PeerPool.prototype.ban = td.func<any>()

  const { BlockFetcher } = await import('../../../lib/sync/fetcher/blockfetcher')

  t.test('should start/stop', async (t) => {
    const config = new Config({ maxPerRequest: 5, transports: [] })
    const pool = new PeerPool() as any
    const chain = new Chain({ config })
    const fetcher = new BlockFetcher({
      config,
      pool,
      chain,
      first: BigInt(1),
      count: BigInt(10),
      timeout: 5,
    })
    fetcher.next = () => false
    t.notOk((fetcher as any).running, 'not started')
    void fetcher.fetch()
    t.equals((fetcher as any).in.size(), 2, 'added 2 tasks')
    await wait(100)
    t.ok((fetcher as any).running, 'started')
    fetcher.destroy()
    await wait(100)
    t.notOk((fetcher as any).running, 'stopped')
    t.end()
  })

  t.test('enqueueByNumberList()', async (t) => {
    const config = new Config({ maxPerRequest: 5, transports: [] })
    const pool = new PeerPool() as any
    const chain = new Chain({ config })
    const fetcher = new BlockFetcher({
      config,
      pool,
      chain,
      first: BigInt(1),
      count: BigInt(10),
      timeout: 5,
    })
    void fetcher.fetch()
    t.equals((fetcher as any).in.size(), 2, 'added 2 tasks')
    await wait(100)

    let blockNumberList = [new BigInt(11), new BigInt(12)]
    let min = new BigInt(11)
    let max = new BigInt(12)
    fetcher.enqueueByNumberList(blockNumberList, min, max)
    t.equals((fetcher as any).in.size(), 3, '1 new task for two subsequent block numbers')

    blockNumberList = [new BigInt(13), new BigInt(15)]
    min = new BigInt(13)
    max = new BigInt(15)
    fetcher.enqueueByNumberList(blockNumberList, min, max)
    t.equals((fetcher as any).in.size(), 3, 'no new task added only the height changed')
    t.equals(fetcher.first + fetcher.count - BigInt(1) === BigInt(15), true, 'height should now be 15')

    // Clear fetcher queue for next test of gap when following head
    fetcher.clear()
    blockNumberList = [new BigInt(50), new BigInt(51)]
    min = new BigInt(50)
    max = new BigInt(51)
    fetcher.enqueueByNumberList(blockNumberList, min, max)
    t.equals(
      (fetcher as any).in.size(),
      11,
      '10 new tasks to catch up to head (1-49, 5 per request), 1 new task for subsequent block numbers (50-51)'
    )

    fetcher.destroy()
    t.end()
  })

  t.test('should process', (t) => {
    const config = new Config({ transports: [] })
    const pool = new PeerPool() as any
    const chain = new Chain({ config })
    const fetcher = new BlockFetcher({
      config,
      pool,
      chain,
      first: BigInt(0),
      count: BigInt(0),
    })
    const blocks: any = [{ header: { number: 1 } }, { header: { number: 2 } }]
    t.deepEquals(fetcher.process({ task: { count: 2 } } as any, blocks), blocks, 'got results')
    t.notOk(fetcher.process({ task: { count: 2 } } as any, { blocks: [] } as any), 'bad results')
    t.end()
  })

  t.test('should adopt correctly', (t) => {
    const config = new Config({ transports: [] })
    const pool = new PeerPool() as any
    const chain = new Chain({ config })
    const fetcher = new BlockFetcher({
      config,
      pool,
      chain,
      first: new BigInt(0),
      count: new BigInt(0),
    })
    const blocks: any = [{ header: { number: 1 } }, { header: { number: 2 } }]
    const task = { count: 3, first: new BigInt(1) }
    ;(fetcher as any).running = true
    fetcher.enqueueTask(task)
    const job = (fetcher as any).in.peek()
    let results = fetcher.process(job as any, blocks)
    t.equal((fetcher as any).in.size(), 1, 'Fetcher should still have same job')
    t.equal(job?.partialResult?.length, 2, 'Should have two partial results')
    t.equal(results, undefined, 'Process should not return full results yet')

    const remainingBlocks: any = [{ header: { number: 3 } }]
    results = fetcher.process(job as any, remainingBlocks)
    t.equal(results?.length, 3, 'Should return full results')

    t.end()
  })

  t.test('should find a fetchable peer', async (t) => {
    const config = new Config({ transports: [] })
    const pool = new PeerPool() as any
    const chain = new Chain({ config })
    const fetcher = new BlockFetcher({
      config,
      pool,
      chain,
      first: BigInt(0),
      count: BigInt(0),
    })
    td.when((fetcher as any).pool.idle(td.matchers.anything())).thenReturn('peer0')
    t.equals(fetcher.peer(), 'peer0', 'found peer')
    t.end()
  })

  t.test('should request correctly', async (t) => {
    const config = new Config({ transports: [] })
    const pool = new PeerPool() as any
    const chain = new Chain({ config })
    const fetcher = new BlockFetcher({
      config,
      pool,
      chain,
      first: new BigInt(0),
      count: new BigInt(0),
    })
    const partialResult: any = [{ header: { number: 1 } }, { header: { number: 2 } }]

    const task = { count: 3, first: new BigInt(1) }
    const peer = {
      eth: { getBlockBodies: td.func<any>(), getBlockHeaders: td.func<any>() },
      id: 'random',
      address: 'random',
    }
    const job = { peer, partialResult, task }
    await fetcher.request(job as any)
    td.verify(
      job.peer.eth.getBlockHeaders({
        block: job.task.first + BigInt(partialResult.length),
        max: job.task.count - partialResult.length,
        reverse: false,
      })
    )
    t.end()
  })

  t.test('store()', async (st) => {
    td.reset()
    st.plan(2)

    const config = new Config({ maxPerRequest: 5, transports: [] })
    const pool = new PeerPool() as any
    const chain = new Chain({ config })
    chain.putBlocks = td.func<any>()
    const fetcher = new BlockFetcher({
      config,
      pool,
      chain,
      first: BigInt(1),
      count: BigInt(10),
      timeout: 5,
    })
    td.when(chain.putBlocks(td.matchers.anything())).thenReject(new Error('err0'))
    try {
      await fetcher.store([])
    } catch (err: any) {
      st.equal(err.message, 'err0', 'store() threw on invalid block')
    }
    td.reset()
    chain.putBlocks = td.func<any>()
    td.when(chain.putBlocks(td.matchers.anything())).thenResolve(1)
    config.events.on(Event.SYNC_FETCHED_BLOCKS, () =>
      st.pass('store() emitted SYNC_FETCHED_BLOCKS event on putting blocks')
    )
    await fetcher.store([])
  })
  t.test('should reset td', (t) => {
    td.reset()
    t.end()
  })
})
