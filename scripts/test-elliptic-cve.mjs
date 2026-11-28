import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { realpathSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const consumers = ['@phala/dcap-qvl']
const expectedEntry = fileURLToPath(new URL('../vendor/elliptic/lib/elliptic.js', import.meta.url))
const expectedVersion = JSON.parse(readFileSync(new URL('../vendor/elliptic/package.json', import.meta.url))).version
assert.equal(expectedVersion, '6.6.2')

const resolvedEntries = consumers.map((consumer) => {
  const consumerRequire = createRequire(require.resolve(consumer))
  return realpathSync(consumerRequire.resolve('elliptic'))
})
assert.deepEqual(resolvedEntries, consumers.map(() => realpathSync(expectedEntry)),
  'all production transitive elliptic consumers must resolve to the patched vendor copy')

const consumerRequire = createRequire(require.resolve(consumers[0]))
const ellipticEntry = consumerRequire.resolve('elliptic')
const elliptic = consumerRequire('elliptic')
const packageRequire = createRequire(ellipticEntry)
const HmacDRBG = packageRequire('hmac-drbg')
const BN = packageRequire('bn.js')
const ec = new elliptic.ec('p521')
const key = ec.keyFromPrivate('1234567890abcdef', 'hex')
const rawNonce = [0, 0xff]
while (rawNonce.length < 66) rawNonce.push(0xa5)

const originalGenerate = HmacDRBG.prototype.generate
let actual
try {
  HmacDRBG.prototype.generate = function () { return rawNonce.slice() }
  actual = ec.sign('deadbeef', key)
} finally {
  HmacDRBG.prototype.generate = originalGenerate
}

const expected = ec.sign('deadbeef', key, {
  k: () => new BN(rawNonce).ushrn(66 * 8 - 521),
})

assert.equal(actual.r.toString(16), expected.r.toString(16),
  'P-521 signing must truncate the generated nonce using its full 66-byte length')
assert.equal(actual.s.toString(16), expected.s.toString(16),
  'P-521 signing must produce the RFC 6979 bits2int signature')
assert.equal(ec.verify('deadbeef', actual, key.getPublic()), true,
  'the corrected signature must verify')

console.log('elliptic CVE-2025-14505 regression passed')
