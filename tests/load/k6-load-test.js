import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const webhookLatency = new Trend('webhook_latency');
const dashboardLatency = new Trend('dashboard_latency');

// Test configuration
export const options = {
  scenarios: {
    // Smoke test - verify system works
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      startTime: '0s',
      tags: { test_type: 'smoke' },
    },
    // Load test - normal load
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },  // Ramp up
        { duration: '3m', target: 10 },  // Stay at 10 VUs
        { duration: '1m', target: 20 },  // Ramp up more
        { duration: '3m', target: 20 },  // Stay at 20 VUs
        { duration: '1m', target: 0 },   // Ramp down
      ],
      startTime: '30s',
      tags: { test_type: 'load' },
    },
    // Stress test - push system limits
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },  // Ramp up
        { duration: '5m', target: 50 },  // Stay at 50 VUs
        { duration: '2m', target: 100 }, // Push to 100 VUs
        { duration: '5m', target: 100 }, // Stay at 100 VUs
        { duration: '2m', target: 0 },   // Ramp down
      ],
      startTime: '10m',
      tags: { test_type: 'stress' },
    },
    // Spike test - sudden load increase
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 }, // Quick spike
        { duration: '1m', target: 100 },  // Hold spike
        { duration: '10s', target: 0 },   // Quick drop
      ],
      startTime: '26m',
      tags: { test_type: 'spike' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.05'],    // Error rate under 5%
    errors: ['rate<0.1'],              // Custom error rate under 10%
    webhook_latency: ['p(95)<3000'],   // Webhook 95th percentile under 3s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// Test phone numbers (use test range)
const TEST_PHONES = [
  '+212600100001',
  '+212600100002',
  '+212600100003',
  '+212600100004',
  '+212600100005',
];

// Test contract numbers
const TEST_CONTRACTS = [
  'FT-LOAD-001',
  'FT-LOAD-002',
  'FT-LOAD-003',
  'FT-LOAD-004',
  'FT-LOAD-005',
];

// Sample messages for testing
const TEST_MESSAGES = [
  { text: 'Bonjour', type: 'greeting' },
  { text: 'السلام عليكم', type: 'greeting' },
  { text: 'Mon contrat FT-LOAD-001', type: 'contract' },
  { text: 'رقم العقد FT-LOAD-002', type: 'contract' },
  { text: 'Réclamation - retard depuis 2 semaines', type: 'complaint' },
  { text: 'Statut de mon installation', type: 'status' },
];

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

export default function () {
  group('Health Check', () => {
    const healthRes = http.get(`${BASE_URL}/health`);
    check(healthRes, {
      'health check status is 200': (r) => r.status === 200,
      'health check returns healthy': (r) => {
        const body = JSON.parse(r.body);
        return body.status === 'healthy';
      },
    });
  });

  group('Webhook Message Processing', () => {
    const phone = getRandomItem(TEST_PHONES);
    const message = getRandomItem(TEST_MESSAGES);
    const contract = getRandomItem(TEST_CONTRACTS);

    const payload = {
      data: {
        key: {
          remoteJid: `${phone}@s.whatsapp.net`,
        },
        message: {
          conversation: message.text.includes('FT-')
            ? message.text
            : message.text.replace('FT-LOAD-001', contract),
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    };

    const startTime = Date.now();
    const res = http.post(
      `${BASE_URL}/api/webhook/message`,
      JSON.stringify(payload),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    const latency = Date.now() - startTime;
    webhookLatency.add(latency);

    const success = check(res, {
      'webhook status is 200': (r) => r.status === 200,
      'webhook returns success': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success === true;
        } catch {
          return false;
        }
      },
      'webhook response time < 3s': (r) => r.timings.duration < 3000,
    });

    errorRate.add(!success);
  });

  if (AUTH_TOKEN) {
    group('Dashboard API', () => {
      const headers = {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      };

      // Get messages
      const startTime = Date.now();
      const messagesRes = http.get(`${BASE_URL}/api/dashboard/messages?limit=20`, { headers });
      const latency = Date.now() - startTime;
      dashboardLatency.add(latency);

      check(messagesRes, {
        'messages status is 200': (r) => r.status === 200,
        'messages returns array': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.success === true && body.data !== undefined;
          } catch {
            return false;
          }
        },
      });

      // Get stats
      const statsRes = http.get(`${BASE_URL}/api/dashboard/stats`, { headers });
      check(statsRes, {
        'stats status is 200': (r) => r.status === 200,
        'stats returns data': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.success === true;
          } catch {
            return false;
          }
        },
      });

      // Get complaints
      const complaintsRes = http.get(`${BASE_URL}/api/complaints?limit=10`, { headers });
      check(complaintsRes, {
        'complaints status is 200': (r) => r.status === 200,
      });
    });
  }

  sleep(Math.random() * 2 + 1); // Random sleep 1-3 seconds
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: '  ', enableColors: true }),
    'tests/load/results/summary.json': JSON.stringify(data, null, 2),
    'tests/load/results/summary.html': htmlReport(data),
  };
}

function textSummary(data, options) {
  const metrics = data.metrics;
  let summary = '\n========== Load Test Summary ==========\n\n';

  summary += `Total Requests: ${metrics.http_reqs.values.count}\n`;
  summary += `Request Rate: ${metrics.http_reqs.values.rate.toFixed(2)} req/s\n`;
  summary += `Failed Requests: ${metrics.http_req_failed.values.passes} (${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%)\n\n`;

  summary += `Response Time (p50): ${metrics.http_req_duration.values.med.toFixed(2)}ms\n`;
  summary += `Response Time (p95): ${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += `Response Time (p99): ${metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n\n`;

  if (metrics.webhook_latency) {
    summary += `Webhook Latency (p95): ${metrics.webhook_latency.values['p(95)'].toFixed(2)}ms\n`;
  }

  summary += '\n========================================\n';
  return summary;
}

function htmlReport(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>JARVIS Load Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #f97316; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f97316; color: white; }
    .pass { color: green; }
    .fail { color: red; }
  </style>
</head>
<body>
  <h1>JARVIS Load Test Report</h1>
  <p>Generated: ${new Date().toISOString()}</p>

  <h2>Summary</h2>
  <table>
    <tr>
      <th>Metric</th>
      <th>Value</th>
    </tr>
    <tr>
      <td>Total Requests</td>
      <td>${data.metrics.http_reqs.values.count}</td>
    </tr>
    <tr>
      <td>Request Rate</td>
      <td>${data.metrics.http_reqs.values.rate.toFixed(2)} req/s</td>
    </tr>
    <tr>
      <td>Error Rate</td>
      <td class="${data.metrics.http_req_failed.values.rate < 0.05 ? 'pass' : 'fail'}">
        ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%
      </td>
    </tr>
    <tr>
      <td>p95 Response Time</td>
      <td class="${data.metrics.http_req_duration.values['p(95)'] < 2000 ? 'pass' : 'fail'}">
        ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
