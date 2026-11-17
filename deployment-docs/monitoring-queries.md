# PrivatePAY x402 MagicBlock P0 Fixes - CloudWatch Monitoring Queries

**Environment:** AWS eu-north-1 (Stockholm)  
**Lambda:** PrivateDAOAgentExchange-Function-N2zgpQmMN41S  
**Log Group:** `/aws/lambda/PrivateDAOAgentExchange-Function-N2zgpQmMN41S`  
**Date:** 2026-11-17

---

## Real-Time Monitoring

### Query 1: P0 Gate Success Rate (Last Hour)

```
fields @timestamp, @message, error_code, payment_id
| filter @message like /P0\./ or @message like /P0 ALL GATES/
| stats count() as total,
    sum(case when @message like /P0 ALL GATES PASSED/ then 1 else 0 end) as passed,
    sum(case when @message like /ERROR/ or @message like /FAILED/ then 1 else 0 end) as failed
| fields total, passed, failed, (passed * 100.0 / total) as success_rate_percent
```

**Expected Output:**
```
total | passed | failed | success_rate_percent
100   | 98     | 2      | 98.0
```

**Alert Threshold:** Success rate < 95% for 5 minutes → Page on-call

---

### Query 2: P0.1 Delegation Validation Latency Distribution

```
fields @timestamp, @duration, payment_id
| filter @message like /P0.1: Delegation valid/
| stats count() as samples,
    avg(@duration) as mean_ms,
    max(@duration) as max_ms,
    pct(@duration, 50) as p50_ms,
    pct(@duration, 95) as p95_ms,
    pct(@duration, 99) as p99_ms
| fields samples, mean_ms, p50_ms, p95_ms, p99_ms, max_ms
```

**Expected Output:**
```
samples | mean_ms | p50_ms | p95_ms | p99_ms | max_ms
500     | 456     | 423    | 782    | 1245   | 2890
```

**SLA Baseline:**
- P50: < 500ms
- P95: < 1000ms
- P99: < 2000ms
- Max: < 5000ms (timeout)

**Alert:** Max > 5000ms → Investigate ER endpoint availability

---

### Query 3: P0.2 Permission Creation Status

```
fields @timestamp, @message, error_code, statusCode
| filter @message like /P0.2:/
| stats count() as total,
    sum(case when @message like /Permission created/ then 1 else 0 end) as created,
    sum(case when error_code like /401/ then 1 else 0 end) as auth_failed,
    sum(case when error_code like /400/ then 1 else 0 end) as validation_failed,
    sum(case when error_code like /503/ then 1 else 0 end) as service_failed
| fields total, created, auth_failed, validation_failed, service_failed
```

**Expected Output:**
```
total | created | auth_failed | validation_failed | service_failed
520   | 514     | 3           | 2                 | 1
```

**Alert Conditions:**
- `auth_failed` > 5 in 10min → Bearer token expired/invalid
- `service_failed` > 10 in 10min → ER outage

---

### Query 4: P0.3 Transfer Queue Initialization

```
fields @timestamp, @message, error_code, statusCode
| filter @message like /P0.3:/
| stats count() as total,
    sum(case when @message like /Transfer queue ready/ then 1 else 0 end) as ready,
    sum(case when @message like /already_initialized.*true/ then 1 else 0 end) as cached,
    sum(case when statusCode like /503/ then 1 else 0 end) as service_errors
| fields total, ready, cached, service_errors, (cached * 100.0 / ready) as cache_hit_rate_percent
```

**Expected Output:**
```
total | ready | cached | service_errors | cache_hit_rate_percent
480   | 475   | 412    | 5              | 86.7
```

**Expectation:** 80%+ of successful P0.3 calls should find already-initialized queue (cache efficiency)

---

### Query 5: Error Breakdown by P0 Gate

```
fields @timestamp, error_code, @message
| filter @message like /P0\..*FAILED|ERROR/
| stats count() as count by error_code
| sort count desc
```

**Expected Output (Typical Failure Distribution):**
```
error_code                              | count
PRIVATEPAY_ER_DELEGATION_QUERY_FAILED  | 2
PRIVATEPAY_INVALID_PER_EXPIRY          | 0
PRIVATEPAY_TRANSFER_QUEUE_ERROR        | 1
PRIVATEPAY_ACCOUNT_NOT_DELEGATED       | 0
```

**Analysis:**
- `DELEGATION_QUERY_FAILED` > 5 in 1hr → ER endpoint issues
- `ACCOUNT_NOT_DELEGATED` > 1 → User wallet misconfiguration
- `TRANSFER_QUEUE_ERROR` > 3 in 1hr → Validator resource issues

---

### Query 6: P0 Gate Total Processing Time (All 3 Gates)

```
fields @timestamp, @duration, payment_id
| filter @message like /P0 ALL GATES PASSED/
| stats count() as count,
    avg(@duration) as avg_ms,
    min(@duration) as min_ms,
    max(@duration) as max_ms,
    pct(@duration, 95) as p95_ms,
    pct(@duration, 99) as p99_ms
| fields count, avg_ms, min_ms, max_ms, p95_ms, p99_ms
```

**Expected Output:**
```
count | avg_ms | min_ms | max_ms | p95_ms | p99_ms
1000  | 3450   | 1800   | 8200   | 5900   | 7100
```

**SLA:** P95 < 6000ms (allows for network jitter + all 3 gates in series)

**Alert:** P99 > 8000ms → Investigate validator or network latency

---

### Query 7: P0 Gate Failure Rate by Error Type (Hourly)

```
fields @timestamp, error_code
| filter @message like /P0\..*FAILED|ERROR/
| stats count() as failure_count by error_code, @timestamp
| stats sum(failure_count) as hourly_failures by error_code
| sort hourly_failures desc
```

**Run This:** Once per hour to identify patterns

**Expected Output (If Running Smoothly):**
```
error_code                           | hourly_failures
PRIVATEPAY_ER_DELEGATION_QUERY_FAILED| 0
PRIVATEPAY_ACCOUNT_NOT_DELEGATED     | 0
PRIVATEPAY_PER_PERMISSION_FAILED     | 0
PRIVATEPAY_TRANSFER_QUEUE_ERROR      | 0
```

---

## Dashboard Recommendations

### Dashboard 1: Real-Time Health

**Name:** `PrivatePAY-P0-Fixes-Health`

**Widgets:**

1. **P0 Success Rate (%)** — Gauge
   ```
   fields @message | filter @message like /P0 ALL GATES/
   | stats sum(case when @message like /PASSED/ then 1 else 0 end) * 100.0 / count() as rate
   | fields rate
   ```
   - Threshold: GREEN ≥95%, YELLOW 90-94%, RED <90%

2. **P0 Gate Latencies (ms)** — Line Chart (3 lines)
   ```
   Query for: P0.1 avg, P0.2 avg, P0.3 avg latencies over time
   ```
   - Y-axis: 0-7000ms
   - Alarm line at 6000ms

3. **Error Count by Type** — Stacked Bar Chart
   ```
   fields error_code, @timestamp
   | filter @message like /ERROR/ or /FAILED/
   | stats count() by error_code, @timestamp
   ```
   - Dimensions: P0.1, P0.2, P0.3

4. **Payment Success/Failure Funnel** — Number
   - Requirements created: ___
   - Checkouts initiated: ___
   - P0 gates passed: ___
   - Settlements completed: ___

---

### Dashboard 2: Performance SLA Tracking

**Name:** `PrivatePAY-P0-Fixes-SLA`

**Widgets:**

1. **P0.1 Latency Percentiles** — Line Chart
   ```
   P50, P95, P99 percentiles over 24h
   SLA lines at: 500ms (p50), 1000ms (p95), 2000ms (p99)
   ```

2. **P0.2 Permission Setup Time** — Line Chart
   ```
   Avg, P95, Max latencies over 24h
   Alert: Max > 5000ms
   ```

3. **P0.3 Queue Initialization Time** — Line Chart
   ```
   Avg, P95, Max latencies over 24h
   Breakdown: New init vs. cached lookup
   ```

4. **Overall P0 Gate Time** — Line Chart
   ```
   Sum of all 3 gates, P95, P99 over 24h
   SLA line at 6000ms
   ```

---

### Dashboard 3: Availability & Incidents

**Name:** `PrivatePAY-P0-Fixes-Incidents`

**Widgets:**

1. **P0 Gate Availability (%)** — Gauge
   ```
   (successful_gates / total_attempts) * 100
   ```
   - Target: 99.5% (allow 1 failure per 200 attempts)

2. **Incident Timeline** — Log Table
   ```
   fields @timestamp, payment_id, error_code, @message
   | filter statusCode >= 500 or error_code like /FAILED/
   | sort @timestamp desc
   | limit 50
   ```

3. **Top Error Codes (24h)** — Horizontal Bar Chart
   ```
   stats count() by error_code
   | sort count() desc
   | limit 10
   ```

4. **MagicBlock Service Status** — Custom Widget
   ```
   Poll https://status.magicblock.app/api/services every 5min
   Display: ER, Router, PER status (green/red)
   ```

---

## Alerting Rules

### Alert 1: P0.1 Delegation Validation Timeouts

**Condition:**
```
P0.1 max latency > 5000ms for 5 consecutive minutes
```

**Action:** Page on-call  
**Severity:** SEV-2  
**Message:**
```
P0.1 delegation validation is timing out (>5s). 
ER endpoint may be overloaded or unreachable.
Check: https://status.magicblock.app/api/services
```

**Runbook:** `/tmp/opencode/p0-fixes/incident-response-p0.md`

---

### Alert 2: P0.2 Authentication Failures Spiking

**Condition:**
```
(P0.2 auth failures) > 5 in 10 minutes
```

**Action:** Page on-call  
**Severity:** SEV-2  
**Message:**
```
P0.2 permission creation auth is failing (401/403).
Facilitator API token may be expired or invalid.
Action: Check AWS Secrets Manager pdao/agent-exchange/facilitator
```

---

### Alert 3: P0.3 Service Unavailability

**Condition:**
```
(P0.3 initialization failures) > 10 in 10 minutes
OR (P0.3 avg latency) > 8000ms for 10 minutes
```

**Action:** Page on-call  
**Severity:** SEV-1 (if > 50 failures) / SEV-2 (if 10-50)  
**Message:**
```
P0.3 transfer queue initialization is failing or slow.
MagicBlock validator may be resource-constrained.
Check: ER health endpoint
Action: May require canary rollback if not resolved in 15min
```

---

### Alert 4: Overall P0 Gate Failure Rate

**Condition:**
```
(P0 all gates success rate) < 95% for 10 minutes
```

**Action:** Page on-call  
**Severity:** SEV-2  
**Message:**
```
P0 validation gates are failing at rate >5%.
Review individual gate metrics (P0.1/P0.2/P0.3).
Check deployment/config/MagicBlock status.
```

---

### Alert 5: Latency SLA Breach

**Condition:**
```
(P0 P99 latency) > 8000ms for 5 minutes
```

**Action:** Info-level (no page)  
**Severity:** INFO  
**Message:**
```
P0 gates are approaching latency SLA ceiling.
User experience may be degraded.
Recommendation: Investigate and optimize if trend continues.
```

---

## Custom Metrics (Use CloudWatch Embedded Metric Format)

**Implementation:** Add to Lambda handler after each gate completes:

```javascript
// P0.1 Completion
console.log(JSON.stringify({
  "_aws": {
    "CloudWatch": {
      "Namespace": "PrivatePayMagicBlock",
      "MetricData": [
        {
          "MetricName": "P0.1DelegationValidationTime",
          "Value": p0_1_duration_ms,
          "Unit": "Milliseconds",
          "Dimensions": {
            "Validator": validator_pubkey,
            "Outcome": "Success|Failure|Timeout"
          }
        }
      ]
    }
  }
}));

// P0.2 Completion
console.log(JSON.stringify({
  "_aws": {
    "CloudWatch": {
      "Namespace": "PrivatePayMagicBlock",
      "MetricData": [
        {
          "MetricName": "P0.2PermissionSetupTime",
          "Value": p0_2_duration_ms,
          "Unit": "Milliseconds",
          "Dimensions": {
            "Payer": payer_prefix,
            "Outcome": "Success|Failure|Timeout"
          }
        }
      ]
    }
  }
}));

// P0.3 Completion
console.log(JSON.stringify({
  "_aws": {
    "CloudWatch": {
      "Namespace": "PrivatePayMagicBlock",
      "MetricData": [
        {
          "MetricName": "P0.3TransferQueueInitTime",
          "Value": p0_3_duration_ms,
          "Unit": "Milliseconds",
          "Dimensions": {
            "Outcome": "New|Cached|Failure"
          }
        }
      ]
    }
  }
}));

// All P0 Gates Completion
console.log(JSON.stringify({
  "_aws": {
    "CloudWatch": {
      "Namespace": "PrivatePayMagicBlock",
      "MetricData": [
        {
          "MetricName": "P0GatePassRate",
          "Value": 100, // or 0 if any gate failed
          "Unit": "Percent",
          "Dimensions": {
            "PaymentID": payment_id_prefix,
            "GateResult": "AllPassed|P0.1Failed|P0.2Failed|P0.3Failed"
          }
        }
      ]
    }
  }
}));
```

---

## On-Call Runbook Commands

### Check Current P0 Gate Health (Quick)

```bash
#!/bin/bash
set -e

REGION="eu-north-1"
FUNCTION="PrivateDAOAgentExchange-Function-N2zgpQmMN41S"
LOG_GROUP="/aws/lambda/$FUNCTION"

echo "=== P0 Gates Quick Health Check ==="
echo ""

# Recent success rate
echo "📊 P0 Success Rate (Last 1 hour):"
aws logs start-query \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @message | filter @message like /P0 ALL GATES/ | stats sum(case when @message like /PASSED/ then 1 else 0 end) * 100.0 / count()' \
  --query 'queryId' --output text | \
  xargs -I {} aws logs get-query-results --region "$REGION" --query-id {}

echo ""
echo "⏱️ P0.1 Latency (P95, Last 1 hour):"
aws logs start-query \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @duration | filter @message like /P0.1: Delegation valid/ | pct(@duration, 95)' \
  --query 'queryId' --output text | \
  xargs -I {} aws logs get-query-results --region "$REGION" --query-id {}

echo ""
echo "❌ Recent Errors (Last 30 min):"
aws logs tail "$LOG_GROUP" --region "$REGION" --since 30m --filter "[PrivatePAY] ERROR: P0"
```

---

### Check MagicBlock Service Status

```bash
#!/bin/bash

echo "=== MagicBlock Service Status ==="
curl -s https://status.magicblock.app/api/services | jq '{
  .meta.days,
  .meta.services,
  environments: .environments.mainnet.regions,
  live_status: .live_status
}' | head -50
```

---

### Query Payment by ID (Debug)

```bash
#!/bin/bash

PAYMENT_ID="$1"
REGION="eu-north-1"
LOG_GROUP="/aws/lambda/PrivateDAOAgentExchange-Function-N2zgpQmMN41S"

if [ -z "$PAYMENT_ID" ]; then
  echo "Usage: $0 <payment_id>"
  exit 1
fi

echo "=== Payment Trace: $PAYMENT_ID ==="
aws logs tail "$LOG_GROUP" --region "$REGION" --follow --filter "$PAYMENT_ID"
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-11-17  
**Archive:** `/tmp/opencode/p0-fixes/monitoring-queries.md`
