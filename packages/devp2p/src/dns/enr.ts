import * as base32 from 'hi-base32'
import { sscanf } from 'scanf'
import { ecdsaVerify } from 'secp256k1'
import { Multiaddr } from 'multiaddr'
import base64url from 'base64url'
import { arrToBufArr, bufArrToArr } from '@ethereumjs/util'
import RLP from 'rlp'
import { PeerInfo } from '../dpt'
import { toNewUint8Array, keccak256 } from '../util'

const Convert = require('multiaddr/src/convert')

type ProtocolCodes = {
  ipCode: number
  tcpCode: number
  udpCode: number
}

type ENRRootValues = {
  eRoot: string
  lRoot: string
  seq: number
  signature: string
}

type ENRTreeValues = {
  publicKey: string
  domain: string
}

export class ENR {
  public static readonly RECORD_PREFIX = 'enr:'
  public static readonly TREE_PREFIX = 'enrtree:'
  public static readonly BRANCH_PREFIX = 'enrtree-branch:'
  public static readonly ROOT_PREFIX = 'enrtree-root:'

  /**
   * Converts an Ethereum Name Record (EIP-778) string into a PeerInfo object after validating
   * its signature component with the public key encoded in the record itself.
   *
   * The record components are:
   * > signature: cryptographic signature of record contents
   * > seq: The sequence number, a 64-bit unsigned integer which increases whenever
   *        the record changes and is republished.
   * > A set of arbitrary key/value pairs
   *
   * @param  {string}   enr
   * @return {PeerInfo}
   */
  static parseAndVerifyRecord(enr: string): PeerInfo {
    if (!enr.startsWith(this.RECORD_PREFIX))
      throw new Error(`String encoded ENR must start with '${this.RECORD_PREFIX}'`)

    // ENRs are RLP encoded and written to DNS TXT entries as base64 url-safe strings
    const base64BufferEnr = base64url.toBuffer(enr.slice(this.RECORD_PREFIX.length))
    const decoded = arrToBufArr(RLP.decode(Uint8Array.from(base64BufferEnr))) as Buffer[]
    const [signature, seq, ...kvs] = decoded

    // Convert ENR key/value pairs to object
    const obj: Record<string, Buffer> = {}

    for (let i = 0; i < kvs.length; i += 2) {
      obj[kvs[i].toString()] = Buffer.from(kvs[i + 1])
    }

    // Validate sig
    const isVerified = ecdsaVerify(
      signature,
      keccak256(Buffer.from(RLP.encode(bufArrToArr([seq, ...kvs])))),
      obj.secp256k1
    )

    if (!isVerified) throw new Error('Unable to verify ENR signature')

    const { ipCode, tcpCode, udpCode } = this._getIpProtocolConversionCodes(obj.id)

    const peerInfo: PeerInfo = {
      address: Convert.toString(ipCode, obj.ip) as string,
      tcpPort: Number(Convert.toString(tcpCode, toNewUint8Array(obj.tcp))),
      udpPort: Number(Convert.toString(udpCode, toNewUint8Array(obj.udp))),
    }

    return peerInfo
  }

  /**
   * Extracts the branch subdomain referenced by a DNS tree root string after verifying
   * the root record signature with its base32 compressed public key. Geth's top level DNS
   * domains and their public key can be found in: go-ethereum/params/bootnodes
   *
   * @param  {string} root  (See EIP-1459 for encoding details)
   * @return {string} subdomain subdomain to retrieve branch records from.
   */
  static parseAndVerifyRoot(root: string, publicKey: string): string {
    if (!root.startsWith(this.ROOT_PREFIX))
      throw new Error(`ENR root entry must start with '${this.ROOT_PREFIX}'`)

    const rootVals = sscanf(
      root,
      `${this.ROOT_PREFIX}v1 e=%s l=%s seq=%d sig=%s`,
      'eRoot',
      'lRoot',
      'seq',
      'signature'
    ) as ENRRootValues

    if (!rootVals.eRoot) throw new Error("Could not parse 'e' value from ENR root entry")
    if (!rootVals.lRoot) throw new Error("Could not parse 'l' value from ENR root entry")
    if (!rootVals.seq) throw new Error("Could not parse 'seq' value from ENR root entry")
    if (!rootVals.signature) throw new Error("Could not parse 'sig' value from ENR root entry")

    const decodedPublicKey = base32.decode.asBytes(publicKey)

    // The signature is a 65-byte secp256k1 over the keccak256 hash
    // of the record content, excluding the `sig=` part, encoded as URL-safe base64 string
    // (Trailing recovery bit must be trimmed to pass `ecdsaVerify` method)
    const signedComponent = root.split(' sig')[0]
    const signedComponentBuffer = Buffer.from(signedComponent)
    const signatureBuffer = base64url.toBuffer(rootVals.signature).slice(0, 64)
    const keyBuffer = Buffer.from(decodedPublicKey)

    const isVerified = ecdsaVerify(signatureBuffer, keccak256(signedComponentBuffer), keyBuffer)

    if (!isVerified) throw new Error('Unable to verify ENR root signature')

    return rootVals.eRoot
  }

  /**
   * Returns the public key and top level domain of an ENR tree entry.
   * The domain is the starting point for traversing a set of linked DNS TXT records
   * and the public key is used to verify the root entry record
   *
   * @param  {string}        tree (See EIP-1459 )
   * @return {ENRTreeValues}
   */
  static parseTree(tree: string): ENRTreeValues {
    if (!tree.startsWith(this.TREE_PREFIX))
      throw new Error(`ENR tree entry must start with '${this.TREE_PREFIX}'`)

    const treeVals = sscanf(
      tree,
      `${this.TREE_PREFIX}//%s@%s`,
      'publicKey',
      'domain'
    ) as ENRTreeValues

    if (!treeVals.publicKey) throw new Error('Could not parse public key from ENR tree entry')
    if (!treeVals.domain) throw new Error('Could not parse domain from ENR tree entry')

    return treeVals
  }

  /**
   * Returns subdomains listed in an ENR branch entry. These in turn lead to
   * either further branch entries or ENR records.
   * @param  {string}   branch
   * @return {string[]}
   */
  static parseBranch(branch: string): string[] {
    if (!branch.startsWith(this.BRANCH_PREFIX))
      throw new Error(`ENR branch entry must start with '${this.BRANCH_PREFIX}'`)

    return branch.split(this.BRANCH_PREFIX)[1].split(',')
  }

  /**
   * Gets relevant multiaddr conversion codes for ipv4, ipv6 and tcp, udp formats
   * @param  {Buffer}        protocolId
   * @return {ProtocolCodes}
   */
  static _getIpProtocolConversionCodes(protocolId: Buffer): ProtocolCodes {
    let ipCode

    switch (protocolId.toString()) {
      case 'v4':
        ipCode = Multiaddr.protocols.names.ip4.code
        break
      case 'v6':
        ipCode = Multiaddr.protocols.names.ip6.code
        break
      default:
        throw new Error("IP protocol must be 'v4' or 'v6'")
    }

    return {
      ipCode,
      tcpCode: Multiaddr.protocols.names.tcp.code,
      udpCode: Multiaddr.protocols.names.udp.code,
    }
  }
}
