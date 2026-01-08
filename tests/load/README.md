# JARVIS Load Testing

This directory contains load testing scripts using k6.

## Prerequisites

Install k6:
```bash
# macOS
brew install k6

# Linux
sudo apt-get install k6

# Docker
docker run -i grafana/k6 run - < k6-load-test.js
```

## Running Tests

### Basic Load Test
```bash
k6 run tests/load/k6-load-test.js
```

### With Environment Variables
```bash
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e AUTH_TOKEN=your-auth-token \
  tests/load/k6-load-test.js
```

### Specific Scenario Only
```bash
# Run only smoke test
k6 run --tag test_type=smoke tests/load/k6-load-test.js

# Run only load test
k6 run --tag test_type=load tests/load/k6-load-test.js

# Run only stress test
k6 run --tag test_type=stress tests/load/k6-load-test.js
```

### With Output to InfluxDB (for Grafana)
```bash
k6 run \
  --out influxdb=http://localhost:8086/k6 \
  tests/load/k6-load-test.js
```

## Test Scenarios

### 1. Smoke Test
- **Duration:** 30 seconds
- **VUs:** 1
- **Purpose:** Verify system works under minimal load

### 2. Load Test
- **Duration:** 9 minutes
- **VUs:** 10-20
- **Purpose:** Test normal expected load

### 3. Stress Test
- **Duration:** 16 minutes
- **VUs:** 50-100
- **Purpose:** Find system breaking points

### 4. Spike Test
- **Duration:** ~1.5 minutes
- **VUs:** 0 → 100 → 0 (sudden spike)
- **Purpose:** Test system recovery from sudden load

## Thresholds

| Metric | Threshold |
|--------|-----------|
| Response Time (p95) | < 2000ms |
| Error Rate | < 5% |
| Webhook Latency (p95) | < 3000ms |

## Results

Results are saved to `tests/load/results/`:
- `summary.json` - Machine-readable results
- `summary.html` - Human-readable HTML report

## Test Endpoints

1. **Health Check** (`GET /health`)
   - Verifies system is running

2. **Webhook Message** (`POST /api/webhook/message`)
   - Simulates WhatsApp messages
   - Tests full message processing pipeline

3. **Dashboard API** (requires AUTH_TOKEN)
   - `GET /api/dashboard/messages`
   - `GET /api/dashboard/stats`
   - `GET /api/complaints`

## Performance Targets

For production readiness:
- Handle **100+ concurrent users**
- Process **50+ messages/second**
- Maintain **< 2s response time** at p95
- **< 1% error rate** under normal load
