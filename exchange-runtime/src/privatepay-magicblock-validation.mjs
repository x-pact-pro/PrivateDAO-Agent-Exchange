/**
 * PrivatePAY x402 MagicBlock P0 Fixes
 * 
 * Critical implementations for:
 * - P0.1: Router getDelegationStatus validation
 * - P0.2: PER ephemeral permission creation
 * - P0.3: USDC transfer queue initialization check
 * 
 * Add these to exchange-runtime/src/privatepay-magicblock-validation.mjs
 */

/**
 * P0.1: Enhanced delegation state validation
 * 
 * Validates that an account is actually delegated on the target ER validator
 * by querying getDelegationStatus from that specific endpoint.
 * 
 * @param {string} teeUrl - TEE RPC endpoint (e.g., https://mainnet-private.magicblock.app)
 * @param {string} payer - Wallet pubkey to check delegation for
 * @param {string} validator - TEE validator pubkey that should have the delegation
 * @returns {Promise<{isDelegated: boolean, delegation_reference: string, validator: string, er_endpoint: string}>}
 */
export async function validateMagicBlockDelegationState(teeUrl, payer, validator, timeoutMs = 5000) {
  if (!teeUrl || !payer || !validator) {
    throw Object.assign(
      new Error("TEE URL, payer, and validator are required"),
      { statusCode: 400, code: "PRIVATEPAY_INVALID_DELEGATION_PARAMS" }
    );
  }

  try {
    // Call getDelegationStatus on the ER endpoint
    const response = await fetch(`${teeUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getDelegationStatus',
        params: [payer]
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      throw Object.assign(
        new Error(`ER endpoint returned ${response.status} for getDelegationStatus`),
        { statusCode: response.status, code: "PRIVATEPAY_ER_DELEGATION_QUERY_FAILED" }
      );
    }

    const result = await response.json();

    // Check for RPC error
    if (result.error) {
      throw Object.assign(
        new Error(`RPC error from getDelegationStatus: ${result.error.message}`),
        { statusCode: 503, code: "PRIVATEPAY_ER_DELEGATION_RPC_ERROR", rpc_error: result.error }
      );
    }

    const delegationResult = result.result;

    // Validate the response structure
    if (!delegationResult || typeof delegationResult !== 'object') {
      throw Object.assign(
        new Error("getDelegationStatus returned invalid response format"),
        { statusCode: 503, code: "PRIVATEPAY_INVALID_DELEGATION_RESPONSE" }
      );
    }

    // Check if account is actually delegated
    if (!delegationResult.isDelegated) {
      throw Object.assign(
        new Error("Account is not delegated on this ER validator"),
        { statusCode: 403, code: "PRIVATEPAY_ACCOUNT_NOT_DELEGATED" }
      );
    }

    // Validate delegation_reference is present
    if (!delegationResult.delegation_reference || typeof delegationResult.delegation_reference !== 'string') {
      throw Object.assign(
        new Error("getDelegationStatus did not return a valid delegation_reference"),
        { statusCode: 503, code: "PRIVATEPAY_MISSING_DELEGATION_REFERENCE" }
      );
    }

    // Verify account owner is NOT the delegation program (should be original owner)
    if (delegationResult.account_owner === "3z5DJVfZKwVj7nEmXAy6DUe1AxNxc5ia1kDZwgVMVFp") { // Delegation Program ID
      throw Object.assign(
        new Error("Account owner is delegation program on ER (should be original owner)"),
        { statusCode: 503, code: "PRIVATEPAY_DELEGATION_STATE_INVALID" }
      );
    }

    return {
      isDelegated: true,
      delegation_reference: delegationResult.delegation_reference,
      validator,
      er_endpoint: teeUrl,
      account_owner: delegationResult.account_owner,
      delegation_created_at: delegationResult.delegation_created_at
    };
  } catch (error) {
    // Re-throw with proper context
    if (error.statusCode) throw error;
    
    throw Object.assign(
      new Error(`Delegation validation failed: ${error.message}`),
      { statusCode: 503, code: "PRIVATEPAY_DELEGATION_VALIDATION_ERROR", cause: error }
    );
  }
}

/**
 * P0.2: Create PER ephemeral permission
 * 
 * Sets up an ephemeral permission on the Private Ephemeral Rollup for a payer.
 * This permission is required before any private balance queries or transfers.
 * 
 * @param {string} erEndpoint - ER RPC endpoint
 * @param {string} payer - Wallet pubkey that will own the permission
 * @param {number} expiryUnix - Unix timestamp when permission expires (usually checkout expiry + buffer)
 * @param {Object} options - Additional options
 * @returns {Promise<{permission_address: string, created_at: string, expires_at: string}>}
 */
export async function setupPrivateEphemeralPermission(erEndpoint, payer, expiryUnix, options = {}) {
  const {
    mode = 'private_payment',
    max_balance_usdc = '500000', // 500k USDC default max
    authToken = null,
    timeoutMs = 5000
  } = options;

  if (!erEndpoint || !payer || !expiryUnix) {
    throw Object.assign(
      new Error("ER endpoint, payer, and expiry are required"),
      { statusCode: 400, code: "PRIVATEPAY_INVALID_PER_PARAMS" }
    );
  }

  if (expiryUnix < Math.floor(Date.now() / 1000)) {
    throw Object.assign(
      new Error("Permission expiry must be in the future"),
      { statusCode: 400, code: "PRIVATEPAY_INVALID_PER_EXPIRY" }
    );
  }

  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${erEndpoint}/per/ephemeral-permission/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        payer,
        mode,
        expiration_unix: expiryUnix,
        max_balance_usdc
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw Object.assign(
        new Error(`ER returned ${response.status} for ephemeral permission creation: ${errBody}`),
        { statusCode: response.status, code: "PRIVATEPAY_PER_PERMISSION_FAILED", error_body: errBody }
      );
    }

    const result = await response.json();

    if (!result.permission || typeof result.permission !== 'string') {
      throw Object.assign(
        new Error("PER returned invalid permission address"),
        { statusCode: 503, code: "PRIVATEPAY_INVALID_PER_RESPONSE" }
      );
    }

    return {
      permission_address: result.permission,
      created_at: new Date().toISOString(),
      expires_at: new Date(expiryUnix * 1000).toISOString(),
      mode,
      max_balance_usdc
    };
  } catch (error) {
    if (error.statusCode) throw error;

    throw Object.assign(
      new Error(`PER permission setup failed: ${error.message}`),
      { statusCode: 503, code: "PRIVATEPAY_PER_SETUP_ERROR", cause: error }
    );
  }
}

/**
 * P0.3: Verify or initialize USDC transfer queue on validator
 * 
 * Checks if a validator has initialized the USDC transfer queue.
 * If not, attempts to initialize it.
 * 
 * @param {string} erEndpoint - ER RPC endpoint
 * @param {string} validator - Validator pubkey
 * @param {Object} config - Configuration with facilitatorAccount
 * @returns {Promise<{initialized: boolean, transfer_queue: string, mint: string}>}
 */
export async function ensureUsdcTransferQueueReady(erEndpoint, validator, config) {
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // Solana mainnet USDC
  const timeoutMs = 5000;

  if (!erEndpoint || !validator || !config?.facilitatorAccount) {
    throw Object.assign(
      new Error("ER endpoint, validator, and facilitatorAccount config are required"),
      { statusCode: 400, code: "PRIVATEPAY_INVALID_TRANSFER_QUEUE_PARAMS" }
    );
  }

  try {
    // Step 1: Check if already initialized
    const checkResponse = await fetch(
      `${erEndpoint}/v1/spl/is-mint-initialized?mint=${USDC_MINT}&validator=${validator}`,
      { signal: AbortSignal.timeout(timeoutMs) }
    );

    if (checkResponse.ok) {
      const checkResult = await checkResponse.json();
      if (checkResult.initialized) {
        return {
          initialized: true,
          transfer_queue: checkResult.transferQueue,
          mint: USDC_MINT,
          already_initialized: true
        };
      }
    }

    // Step 2: Initialize if not ready
    const initResponse = await fetch(`${erEndpoint}/v1/spl/initialize-mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payer: config.facilitatorAccount,
        mint: USDC_MINT,
        validator
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!initResponse.ok) {
      const errBody = await initResponse.text().catch(() => '');
      throw Object.assign(
        new Error(`Failed to initialize USDC transfer queue: ${initResponse.status} ${errBody}`),
        { statusCode: initResponse.status, code: "PRIVATEPAY_TRANSFER_QUEUE_INIT_FAILED", error_body: errBody }
      );
    }

    const initResult = await initResponse.json();

    return {
      initialized: true,
      transfer_queue: initResult.transferQueue,
      mint: USDC_MINT,
      already_initialized: false,
      rent_pda: initResult.rentPda,
      init_tx: initResult.transaction_base64
    };
  } catch (error) {
    if (error.statusCode) throw error;

    throw Object.assign(
      new Error(`Transfer queue check/init failed: ${error.message}`),
      { statusCode: 503, code: "PRIVATEPAY_TRANSFER_QUEUE_ERROR", cause: error }
    );
  }
}

/**
 * P0 Combined: Run all three critical validations in sequence
 * 
 * Use this in the pre-checkout validation flow.
 * 
 * @returns {Promise<{delegation_valid: boolean, permission_created: boolean, transfer_queue_ready: boolean, details: Object}>}
 */
export async function runMagicBlockP0Validations(config, payer, validator, teeUrl, authToken) {
  const results = {
    delegation_valid: false,
    permission_created: false,
    transfer_queue_ready: false,
    details: {}
  };
  
  const startTime = Date.now();
  const traceId = Math.random().toString(36).substring(7);

  try {
    // P0.1: Validate delegation state
    const p01Start = Date.now();
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'privatepay',
      gate: 'P0.1',
      action: 'start_delegation_validation',
      traceId,
      payer: payer.substring(0, 8),
      validator: validator.substring(0, 8)
    }));
    
    const delegationState = await validateMagicBlockDelegationState(teeUrl, payer, validator);
    results.delegation_valid = true;
    results.details.delegation = delegationState;
    
    const p01Elapsed = Date.now() - p01Start;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'privatepay',
      gate: 'P0.1',
      action: 'delegation_validation_success',
      traceId,
      elapsed_ms: p01Elapsed,
      delegation_reference: delegationState.delegation_reference?.substring(0, 8)
    }));
  } catch (err) {
    const p01Elapsed = Date.now() - startTime;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service: 'privatepay',
      gate: 'P0.1',
      action: 'delegation_validation_failed',
      traceId,
      error_code: err.code || 'UNKNOWN',
      error_message: err.message,
      elapsed_ms: p01Elapsed
    }));
    throw err; // P0.1 is fatal
  }

  try {
    // P0.2: Create PER ephemeral permission
    const p02Start = Date.now();
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'privatepay',
      gate: 'P0.2',
      action: 'start_permission_creation',
      traceId
    }));
    
    const expiryUnix = Math.floor(Date.now() / 1000) + 1800; // 30 min from now
    const permission = await setupPrivateEphemeralPermission(teeUrl, payer, expiryUnix, { authToken });
    results.permission_created = true;
    results.details.permission = permission;
    
    const p02Elapsed = Date.now() - p02Start;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'privatepay',
      gate: 'P0.2',
      action: 'permission_creation_success',
      traceId,
      elapsed_ms: p02Elapsed,
      permission_address: permission.permission_address?.substring(0, 8)
    }));
  } catch (err) {
    const p02Elapsed = Date.now() - startTime;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service: 'privatepay',
      gate: 'P0.2',
      action: 'permission_creation_failed',
      traceId,
      error_code: err.code || 'UNKNOWN',
      error_message: err.message,
      elapsed_ms: p02Elapsed
    }));
    throw err; // P0.2 is fatal
  }

  try {
    // P0.3: Ensure USDC transfer queue ready
    const p03Start = Date.now();
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'privatepay',
      gate: 'P0.3',
      action: 'start_transfer_queue_check',
      traceId
    }));
    
    const queueStatus = await ensureUsdcTransferQueueReady(teeUrl, validator, config);
    results.transfer_queue_ready = true;
    results.details.transfer_queue = queueStatus;
    
    const p03Elapsed = Date.now() - p03Start;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'privatepay',
      gate: 'P0.3',
      action: 'transfer_queue_check_success',
      traceId,
      elapsed_ms: p03Elapsed,
      transfer_queue: queueStatus.transfer_queue?.substring(0, 8),
      already_initialized: queueStatus.already_initialized
    }));
  } catch (err) {
    const p03Elapsed = Date.now() - startTime;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service: 'privatepay',
      gate: 'P0.3',
      action: 'transfer_queue_check_failed',
      traceId,
      error_code: err.code || 'UNKNOWN',
      error_message: err.message,
      elapsed_ms: p03Elapsed
    }));
    throw err; // P0.3 is fatal
  }

  const totalElapsed = Date.now() - startTime;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'privatepay',
    action: 'all_p0_gates_passed',
    traceId,
    total_elapsed_ms: totalElapsed,
    p0_gates_passed: 3
  }));

  return results;
}

export default {
  validateMagicBlockDelegationState,
  setupPrivateEphemeralPermission,
  ensureUsdcTransferQueueReady,
  runMagicBlockP0Validations
};
