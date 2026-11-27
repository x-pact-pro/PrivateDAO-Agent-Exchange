import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  throw new Error(`Provider conformance gate failed: ${message}`)
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(projectRoot, relativePath), 'utf8'))
}

function versionAtLeast(actual, minimum) {
  const actualParts = String(actual).split('.').map(Number)
  const minimumParts = String(minimum).split('.').map(Number)
  return minimumParts.every((part, index) => (actualParts[index] ?? 0) === part)
    || actualParts.some((part, index) => {
      const required = minimumParts[index] ?? 0
      const previousEqual = actualParts.slice(0, index).every(
        (previous, previousIndex) => previous === (minimumParts[previousIndex] ?? 0),
      )
      return previousEqual && part > required
    })
}

export function assertProviderConformance(surface) {
  const policy = readJson('provider-conformance.json')
  const packageJson = readJson('package.json')
  const nodeMajor = Number(process.versions.node.split('.')[0])

  if (policy.schemaVersion !== 1 || policy.critical !== true) fail('policy must be schema v1 and critical')
  if (nodeMajor !== policy.nodeMajor) fail(`Node ${policy.nodeMajor} is required; found ${process.versions.node}`)
  if (process.versions.node !== policy.nodeVersion) fail(`Node ${policy.nodeVersion} is required; found ${process.versions.node}`)
  if (packageJson.engines?.node !== policy.nodeVersion) fail(`package engines.node must be ${policy.nodeVersion}`)
  if (readFileSync(resolve(projectRoot, '.nvmrc'), 'utf8').trim() !== policy.nodeVersion) fail('.nvmrc must match nodeVersion')
  if (policy.toolchains?.rust?.required === false && existsSync(resolve(projectRoot, 'Cargo.toml'))) {
    fail('Cargo.toml exists but Rust is not declared as a production toolchain')
  }
  if (policy.toolchains?.nextjs?.required === false && packageJson.dependencies?.next) {
    fail('Next.js is installed but is not declared as a production toolchain')
  }
  if (surface && !policy.productionSurfaces?.includes(surface)) fail(`unknown production surface: ${surface}`)

  const providerIds = new Set()
  for (const provider of policy.providers ?? []) {
    if (!provider.id || !provider.publisher) fail('every provider needs an id and publisher')
    if (providerIds.has(provider.id)) fail(`duplicate provider: ${provider.id}`)
    providerIds.add(provider.id)
    const hasMcp = typeof provider.officialMcp === 'string' && provider.officialMcp.length > 0
    const hasDocumentedGap =
      typeof provider.officialDocs === 'string' &&
      provider.officialDocs.length > 0 &&
      typeof provider.mcpGap === 'string' &&
      provider.mcpGap.length > 0
    if (!hasMcp && !hasDocumentedGap) fail(`${provider.id} needs an official MCP or an exact documented MCP gap`)
  }

  const magicBlock = policy.providers.find((provider) => provider.id === 'magicblock')
  const minimumSdk = magicBlock?.privateEphemeralRollups?.minimumSdk
  const expectedSdk = magicBlock?.privateEphemeralRollups?.installedSdk
  const installedSdk = packageJson.dependencies?.['@magicblock-labs/ephemeral-rollups-sdk']
  if (!minimumSdk || !installedSdk || !versionAtLeast(installedSdk, minimumSdk)) {
    fail(`MagicBlock ephemeral-rollups-sdk must be >=${minimumSdk}; found ${installedSdk ?? 'missing'}`)
  }
  if (!expectedSdk || installedSdk !== expectedSdk) {
    fail(`MagicBlock ephemeral-rollups-sdk must match the reviewed profile ${expectedSdk}; found ${installedSdk ?? 'missing'}`)
  }
  const source = magicBlock?.officialSource
  if (source?.repository !== 'https://github.com/magicblock-labs/ephemeral-spl-token.git') {
    fail('MagicBlock official source repository is not pinned')
  }
  if (!/^[a-f0-9]{40}$/.test(source?.commit ?? '')) {
    fail('MagicBlock official source commit must be a full Git SHA')
  }

  for (const hook of policy.requiredHooks ?? []) {
    const source = readFileSync(resolve(projectRoot, hook.file), 'utf8')
    if (!source.includes(hook.contains)) fail(`${hook.file} is missing required hook: ${hook.contains}`)
  }

  console.log(`Provider conformance gate PASS${surface ? ` (${surface})` : ''}`)
}

function parseSurface(argv) {
  const index = argv.indexOf('--surface')
  if (index === -1) return undefined
  if (!argv[index + 1]) fail('--surface needs a value')
  return argv[index + 1]
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertProviderConformance(parseSurface(process.argv.slice(2)))
}
