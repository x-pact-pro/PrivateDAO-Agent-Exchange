import {
  MAGICBLOCK_MAINNET_ROUTER_RPC,
  MAGICBLOCK_MAINNET_TEE_RPC,
  MAGICBLOCK_MAINNET_TEE_VALIDATOR,
  MAGICBLOCK_MAINNET_US_ER_RPC,
  MAGICBLOCK_MAINNET_US_VALIDATOR,
  getMagicBlockDelegationStatus,
  getMagicBlockEndpointStatus,
  getMagicBlockIdentity,
  getMagicBlockRoutes,
  selectMagicBlockRoute,
} from "../src/magicblock-topology.mjs";

const account = process.argv[2] || process.env.SOLANA_TREASURY || "";
const routes = await getMagicBlockRoutes();
const usRoute = selectMagicBlockRoute(routes, {
  countryCode: "USA",
  identity: MAGICBLOCK_MAINNET_US_VALIDATOR,
});
const [usIdentity, teeIdentity, delegation, teeStatus] = await Promise.all([
  getMagicBlockIdentity({
    rpcUrl: MAGICBLOCK_MAINNET_US_ER_RPC,
    expectedIdentity: MAGICBLOCK_MAINNET_US_VALIDATOR,
  }),
  getMagicBlockIdentity({
    rpcUrl: MAGICBLOCK_MAINNET_TEE_RPC,
    expectedIdentity: MAGICBLOCK_MAINNET_TEE_VALIDATOR,
  }),
  account
    ? getMagicBlockDelegationStatus({ account })
    : Promise.resolve(null),
  getMagicBlockEndpointStatus({
    rpcUrl: MAGICBLOCK_MAINNET_TEE_RPC,
    expectedIdentity: MAGICBLOCK_MAINNET_TEE_VALIDATOR,
  }),
]);

console.log(JSON.stringify({
  readOnly: true,
  routerRpc: MAGICBLOCK_MAINNET_ROUTER_RPC,
  usRoute,
  usIdentity,
  teeIdentity,
  mainnetTee: { endpoint: MAGICBLOCK_MAINNET_TEE_RPC, ...teeStatus },
  delegationAccount: account || null,
  delegation,
  roles: {
    router: "route and delegation discovery",
    usEr: "public US regional ephemeral-rollup RPC",
    tee: "private provider TEE RPC; do not replace with a regional reverse proxy",
  },
}, null, 2));
