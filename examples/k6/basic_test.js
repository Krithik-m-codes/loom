/**
 * Loom k6 Example — Multi-Endpoint API Stress Scenario
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const BASE_URL = __ENV.TARGET_HOST || 'http://localhost:8080';

  // 1. Health check
  const res1 = http.get(`${BASE_URL}/`);
  check(res1, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(1);

  // 2. API query
  const res2 = http.get(`${BASE_URL}/api/data`);
  check(res2, {
    'api status ok': (r) => r.status === 200 || r.status === 404,
  });

  sleep(1);
}
