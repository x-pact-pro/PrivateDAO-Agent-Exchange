# PDAO elliptic security patch

This directory contains upstream `elliptic` 6.6.1 source, distributed under
the included MIT license, with the upstream fix from the open
`indutny/elliptic` pull request for CVE-2025-14505 applied to
`lib/elliptic/ec/index.js`. Its local package version is `6.6.2` so existing
`^6.x` dependency ranges accept the patched copy; this is a PDAO-vendored
build, not an upstream npm release.

The fix preserves the original HMAC-DRBG output bit length when truncating an
ECDSA nonce. The vendored version remains pinned until the upstream project
publishes a release that contains this correction. The root package manifest
overrides transitive `elliptic` dependencies to this copy.

`scripts/test-elliptic-cve.mjs` forces a P-521 nonce with a leading zero byte,
checks that signing matches RFC 6979 `bits2int`, and verifies the signature.
