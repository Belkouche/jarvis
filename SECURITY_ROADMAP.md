# JARVIS Security Improvement Roadmap

**Current Score: 4.5/10**

This roadmap outlines the specific tasks required to reach each security milestone.

---

## Phase 1: Reach 6/10 (Critical Fixes)

> **Effort:** 2-3 days | **Focus:** Eliminate critical vulnerabilities

### Authentication & Secrets (Priority 1)

- [ ] **Remove JWT secret fallback** - `src/middleware/auth.ts:16`
  ```typescript
  // Remove: const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
  // Replace with fail-fast validation
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  ```

- [ ] **Remove D2D credential fallbacks** - `src/services/crmService.ts:9-10`
  ```typescript
  // Remove empty string fallbacks, validate at startup
  const D2D_USERNAME = process.env.D2D_USERNAME;
  const D2D_PASSWORD = process.env.D2D_PASSWORD;
  if (!D2D_USERNAME || !D2D_PASSWORD) {
    throw new Error('D2D credentials must be configured');
  }
  ```

- [ ] **Remove API key empty fallbacks** - Multiple service files
  - `src/services/evolutionApiService.ts:8`
  - `src/services/resendService.ts:4`

### Webhook Security (Priority 1)

- [ ] **Make webhook verification fail-closed** - `src/services/evolutionApiService.ts:55-58`
  ```typescript
  // Change from return true to return false
  if (!EVOLUTION_WEBHOOK_SECRET) {
    logger.error('Webhook secret not configured - rejecting request');
    return false;
  }
  ```

- [ ] **Remove development mode webhook bypass** - `src/routes/webhook.ts:18-23`
  ```typescript
  // Remove entire if block that skips verification in development
  ```

### WebSocket Authorization (Priority 1)

- [ ] **Add authorization check to complaint subscription** - `src/services/websocketService.ts:87-93`
  ```typescript
  socket.on('subscribe:complaint', async (complaintId: string) => {
    // Add authorization check before joining room
    const canAccess = await verifyComplaintAccess(socket.userId, socket.userRole, complaintId);
    if (!canAccess) {
      socket.emit('error', { message: 'Unauthorized' });
      return;
    }
    socket.join(`complaint:${complaintId}`);
  });
  ```

### Dependency Management (Priority 1)

- [ ] **Generate and commit package-lock.json**
  ```bash
  cd /path/to/Jarvis
  npm i --package-lock-only
  git add package-lock.json
  ```

- [ ] **Run npm audit fix on frontend**
  ```bash
  cd frontend
  npm audit fix
  ```

### Configuration Cleanup (Priority 2)

- [ ] **Fix hardcoded credentials in docker-compose.yml** - Lines 9-10, 66
  ```yaml
  # Use environment variable syntax
  POSTGRES_PASSWORD: ${DB_PASSWORD:?Database password required}
  ```

- [ ] **Fix alertmanager SMTP placeholder** - `monitoring/alertmanager.yml:5`
  ```yaml
  smtp_auth_password: '${SMTP_PASSWORD}'
  ```

- [ ] **Update .env.example with clear placeholders** - `.env.example:25-26`
  ```
  SESSION_SECRET=<GENERATE: openssl rand -hex 32>
  JWT_SECRET=<GENERATE: openssl rand -hex 64>
  ```

---

## Phase 2: Reach 7/10 (High Severity Fixes)

> **Effort:** 1-2 weeks | **Focus:** Authorization, data protection, rate limiting

### Token Storage Security

- [ ] **Remove localStorage token storage** - `frontend/src/stores/authStore.ts`
  ```typescript
  // Remove all localStorage.setItem('token', ...) calls
  // Remove all localStorage.getItem('token') calls
  // Rely only on httpOnly cookies
  ```

- [ ] **Remove token from API interceptor** - `frontend/src/services/api.ts:59-61, 78-80`
  ```typescript
  // Remove Authorization header injection
  // Keep only withCredentials: true for cookie-based auth
  ```

### Authorization Fixes

- [ ] **Add role requirements to complaint endpoints** - `src/routes/complaints.ts`
  ```typescript
  // Add authentication and role checks
  router.get('/', authenticate, requireRole('admin', 'bo_team'), complaintController.getComplaints);
  router.get('/:id', authenticate, requireRole('admin', 'bo_team'), complaintController.getComplaint);
  ```

- [ ] **Fix RBAC inconsistency** - `src/routes/complaints.ts:13`
  ```typescript
  // Change from array to rest parameters
  requireRole('admin', 'bo_team')  // Not requireRole(['admin', 'bo_team'])
  ```

### Rate Limiting Fixes

- [ ] **Fix rate limiter key generation** - `src/middleware/rateLimit.ts:14-17`
  ```typescript
  keyGenerator: (req: Request): string => {
    // Use IP as primary key, not user-supplied phone
    return `webhook_${req.ip || 'unknown'}`;
  },
  ```

- [ ] **Add WebSocket rate limiting** - `src/services/websocketService.ts`
  ```typescript
  import { RateLimiterMemory } from 'rate-limiter-flexible';

  const wsRateLimiter = new RateLimiterMemory({
    points: 10,
    duration: 1,
  });

  io.use(async (socket, next) => {
    try {
      await wsRateLimiter.consume(socket.handshake.address);
      next();
    } catch {
      next(new Error('Too many connections'));
    }
  });
  ```

- [ ] **Add rate limiting to status webhook** - `src/routes/webhook.ts:68-70`
  ```typescript
  router.post('/status', webhookRateLimiter, verifySignature, ...);
  ```

### Logging Security

- [ ] **Sanitize request body in error handler** - `src/middleware/errorHandler.ts:125-131`
  ```typescript
  import { sanitizeForLog } from '../utils/helpers.js';

  logger.error('Error occurred', {
    error: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    body: sanitizeForLog(req.body),
  });
  ```

- [ ] **Sanitize body logger** - `src/middleware/logging.ts:47-54`
  ```typescript
  body: sanitizeForLog(req.body),
  ```

### Input Validation

- [ ] **Add UUID validation middleware** - `src/middleware/validation.ts`
  ```typescript
  export const uuidParamSchema = z.object({
    id: z.string().uuid(),
  });
  ```

- [ ] **Apply UUID validation to routes** - `src/routes/complaints.ts`
  ```typescript
  router.get('/:id', validate(uuidParamSchema, 'params'), ...);
  ```

### CSV Injection Fix

- [ ] **Sanitize CSV export** - `src/routes/dashboard.ts:68-71, 88-91`
  ```typescript
  function escapeCSV(value: string): string {
    if (!value) return '';
    // Escape formula characters
    if (/^[=+\-@\t\r]/.test(value)) {
      return `'${value}`;
    }
    return value.replace(/"/g, '""');
  }

  const csvRows = complaints.map(c =>
    `"${escapeCSV(c.id)}","${escapeCSV(c.phone)}",...`
  );
  ```

### Session Management

- [ ] **Add user active check to auth middleware** - `src/middleware/auth.ts`
  ```typescript
  // After JWT verification, check if user is still active
  const user = await prisma.adminUser.findUnique({
    where: { id: payload.sub },
    select: { isActive: true }
  });
  if (!user?.isActive) {
    throw errors.unauthorized('Account deactivated');
  }
  ```

### Browser Security

- [ ] **Enable Playwright sandbox** - `src/services/crmService.ts:23-31`
  ```typescript
  // Remove --no-sandbox flag or configure container properly
  args: [
    // '--no-sandbox',  // REMOVE THIS
    '--disable-dev-shm-usage',
  ],
  ```

---

## Phase 3: Reach 8/10 (Medium Severity Fixes)

> **Effort:** 2-4 weeks | **Focus:** Privacy, infrastructure hardening, monitoring

### PII Protection

- [ ] **Create PII masking utility** - `src/utils/helpers.ts`
  ```typescript
  export function maskPhone(phone: string): string {
    if (!phone || phone.length <= 4) return '****';
    return '*'.repeat(phone.length - 4) + phone.slice(-4);
  }

  export function maskEmail(email: string): string {
    if (!email) return '****';
    const [local, domain] = email.split('@');
    if (!domain) return '****';
    return `${local.charAt(0)}***@${domain}`;
  }
  ```

- [ ] **Apply masking to logger** - `src/config/logger.ts:69-74, 100-110`
  ```typescript
  message: {
    received: (phone: string, messageId: string) =>
      logger.info('Message received', { phone: maskPhone(phone), messageId }),
    // ... apply to all phone/email logging
  },
  ```

### Redis Security

- [ ] **Encrypt sensitive cached data** - `src/config/redis.ts`
  ```typescript
  import crypto from 'crypto';

  const ENCRYPTION_KEY = process.env.REDIS_ENCRYPTION_KEY;

  function encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    // ... implement encryption
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const encrypted = encrypt(JSON.stringify(value));
    // ... store encrypted
  }
  ```

- [ ] **Enable Redis authentication** - `docker-compose.prod.yml`
  ```yaml
  redis:
    command: redis-server --requirepass ${REDIS_PASSWORD}
  ```

### Nginx Security Headers

- [ ] **Add security headers** - `nginx/conf.d/default.conf`
  ```nginx
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
  add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
  ```

### CORS Validation

- [ ] **Validate CORS origins** - `src/app.ts:35-42`
  ```typescript
  const ALLOWED_ORIGINS = ['https://jarvis.tktm.ma', 'https://admin.tktm.ma'];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    },
    credentials: true,
  }));
  ```

### Audit Logging Enhancement

- [ ] **Add failed authentication logging** - `src/services/auditService.ts`
  ```typescript
  export async function logAuthenticationFailed(
    email: string,
    reason: string,
    ipAddress?: string
  ): Promise<void> {
    await createAuditLog({
      eventType: 'auth_failed',
      actor: email,
      action: 'failed_login',
      changes: { reason },
      ipAddress,
    });
  }
  ```

- [ ] **Add rate limit violation logging**
  ```typescript
  export async function logRateLimitViolation(
    identifier: string,
    endpoint: string,
    ipAddress?: string
  ): Promise<void> {
    await createAuditLog({
      eventType: 'rate_limit_exceeded',
      actor: identifier,
      action: 'rate_limit',
      changes: { endpoint },
      ipAddress,
    });
  }
  ```

- [ ] **Add role change logging**
  ```typescript
  export async function logRoleChange(
    adminId: string,
    targetUserId: string,
    oldRole: string,
    newRole: string
  ): Promise<void> {
    // ... implementation
  }
  ```

### Dependency Updates

- [ ] **Update security packages** - `package.json`
  ```json
  {
    "dependencies": {
      "bcrypt": "^6.0.0",
      "helmet": "^8.1.0",
      "express-rate-limit": "^8.2.1"
    }
  }
  ```

- [ ] **Pin critical package versions**
  ```json
  {
    "dependencies": {
      "jsonwebtoken": "9.0.3",
      "bcrypt": "6.0.0"
    }
  }
  ```

### JSON Deserialization Safety

- [ ] **Add Zod validation for LM Studio response** - `src/services/lmStudioService.ts`
  ```typescript
  const LMAnalysisResultSchema = z.object({
    category: z.enum(['complaint', 'information', 'spam']),
    confidence: z.number().min(0).max(1),
    summary: z.string(),
    // ... define expected structure
  });

  function parseAnalysisResponse(responseText: string): LMAnalysisResult {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    return LMAnalysisResultSchema.parse(JSON.parse(jsonMatch[0]));
  }
  ```

### Metrics Endpoint Security

- [ ] **Protect metrics endpoints** - `src/routes/health.ts`
  ```typescript
  router.get('/health/metrics', authenticate, requireRole('admin'), async (req, res) => {
    // ... existing implementation
  });
  ```

### Magic Link Optimization

- [ ] **Add hash prefix for efficient lookup** - `src/controllers/authController.ts`
  ```typescript
  // When creating magic link, store hash prefix
  const hashPrefix = crypto.createHash('sha256')
    .update(plainToken)
    .digest('hex')
    .substring(0, 16);

  await prisma.magicLink.create({
    data: {
      email,
      token: hashedToken,
      hashPrefix,  // Add this field to schema
      expiresAt,
    },
  });

  // When verifying, lookup by prefix first
  const candidates = await prisma.magicLink.findMany({
    where: { hashPrefix, used: false, expiresAt: { gt: new Date() } },
  });
  ```

---

## Phase 4: Reach 9/10 (Security Hardening)

> **Effort:** 1-2 months | **Focus:** Advanced security, testing, compliance

### Security Testing

- [ ] **Add security-focused unit tests**
  - Test JWT without secret fails
  - Test webhook without signature rejected
  - Test rate limiter blocks after threshold
  - Test RBAC enforcement on all endpoints
  - Test XSS prevention in outputs

- [ ] **Implement integration security tests**
  ```typescript
  describe('Security', () => {
    it('should reject forged JWT tokens', async () => {
      const forgedToken = jwt.sign({ sub: 'admin' }, 'wrong-secret');
      const res = await request(app)
        .get('/api/complaints')
        .set('Authorization', `Bearer ${forgedToken}`);
      expect(res.status).toBe(401);
    });

    it('should prevent IDOR on complaints', async () => {
      // User A should not access User B's complaints
    });
  });
  ```

- [ ] **Add OWASP ZAP to CI pipeline**
  ```yaml
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: zaproxy/action-baseline@v0.7.0
        with:
          target: 'https://staging.jarvis.tktm.ma'
  ```

### Session Security Enhancement

- [ ] **Implement token blocklist in Redis**
  ```typescript
  async function revokeToken(tokenHash: string): Promise<void> {
    await redisClient.sadd('revoked_tokens', tokenHash);
  }

  async function isTokenRevoked(tokenHash: string): Promise<boolean> {
    return await redisClient.sismember('revoked_tokens', tokenHash) === 1;
  }
  ```

- [ ] **Add session fingerprinting**
  ```typescript
  interface SessionFingerprint {
    userAgent: string;
    ipPrefix: string;  // First 3 octets only
  }

  // Validate fingerprint on each request
  ```

- [ ] **Implement session rotation on privilege change**

### Content Security Policy

- [ ] **Implement strict CSP** - `src/app.ts`
  ```typescript
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss://jarvis.tktm.ma"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }));
  ```

### Secrets Management

- [ ] **Integrate with secrets manager**
  ```typescript
  // Example with AWS Secrets Manager
  import { SecretsManager } from '@aws-sdk/client-secrets-manager';

  async function getSecret(secretId: string): Promise<string> {
    const client = new SecretsManager({ region: 'eu-west-1' });
    const response = await client.getSecretValue({ SecretId: secretId });
    return response.SecretString!;
  }
  ```

- [ ] **Implement credential rotation for D2D Portal**

### Monitoring & Alerting

- [ ] **Add security event alerting** - `monitoring/alertmanager.yml`
  ```yaml
  route:
    routes:
      - match:
          alertname: HighFailedLogins
        receiver: security-team
      - match:
          alertname: SuspiciousActivity
        receiver: security-team
  ```

- [ ] **Create security dashboards in Grafana**
  - Failed login attempts over time
  - Rate limit violations
  - Unusual access patterns
  - WebSocket connection anomalies

### API Security Enhancement

- [ ] **Implement request signing for internal APIs**
- [ ] **Add API versioning with deprecation headers**
- [ ] **Implement request ID correlation across services**

### Compliance Documentation

- [ ] **Document data flows for GDPR**
- [ ] **Create security incident response plan**
- [ ] **Document backup and recovery procedures**

---

## Phase 5: Reach 9.5/10 (Excellence)

> **Effort:** 3-6 months | **Focus:** Continuous security, external validation

### External Security Validation

- [ ] **Conduct professional penetration test**
  - Engage third-party security firm
  - Cover web app, API, WebSocket, infrastructure
  - Remediate all findings

- [ ] **Implement bug bounty program**
  - Define scope and rules
  - Set up on platform (HackerOne, Bugcrowd)
  - Establish triage process

### Advanced Threat Protection

- [ ] **Implement Web Application Firewall (WAF)**
  - Deploy Cloudflare/AWS WAF
  - Configure OWASP rules
  - Set up custom rules for application

- [ ] **Add anomaly detection**
  ```typescript
  // Detect unusual patterns
  interface UserBehavior {
    requestsPerMinute: number;
    uniqueEndpoints: Set<string>;
    errorRate: number;
  }

  function detectAnomaly(current: UserBehavior, baseline: UserBehavior): boolean {
    // Statistical analysis
  }
  ```

- [ ] **Implement honeypot endpoints**
  ```typescript
  // Detect automated attacks
  router.get('/admin/backup', (req, res) => {
    logger.security('Honeypot triggered', { ip: req.ip, path: req.path });
    alertSecurityTeam(req);
    res.status(404).send('Not found');
  });
  ```

### Zero Trust Architecture

- [ ] **Implement mutual TLS for internal services**
- [ ] **Add service mesh with Istio/Linkerd**
- [ ] **Implement network segmentation**

### Continuous Security

- [ ] **Integrate SAST in CI/CD**
  ```yaml
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: github/codeql-action/init@v2
      - uses: github/codeql-action/analyze@v2
  ```

- [ ] **Add dependency scanning**
  ```yaml
  - uses: snyk/actions/node@master
    with:
      args: --severity-threshold=high
  ```

- [ ] **Implement SBOM generation**
  ```bash
  npx @cyclonedx/cyclonedx-npm --output-file sbom.json
  ```

### Security Culture

- [ ] **Create security champions program**
- [ ] **Conduct regular security training**
- [ ] **Establish secure code review checklist**
- [ ] **Document security architecture decisions (ADRs)**

### Compliance Certifications

- [ ] **Prepare for SOC 2 Type II**
  - Document controls
  - Implement evidence collection
  - Engage auditor

- [ ] **GDPR compliance validation**
  - Data processing agreements
  - Privacy impact assessment
  - Right to erasure implementation

---

## Summary Timeline

| Phase | Target Score | Effort | Key Focus |
|-------|--------------|--------|-----------|
| **Phase 1** | 6/10 | 2-3 days | Critical fixes (secrets, auth bypass) |
| **Phase 2** | 7/10 | 1-2 weeks | High severity (IDOR, rate limiting, logging) |
| **Phase 3** | 8/10 | 2-4 weeks | Medium severity (PII, headers, auditing) |
| **Phase 4** | 9/10 | 1-2 months | Hardening (testing, monitoring, CSP) |
| **Phase 5** | 9.5/10 | 3-6 months | Excellence (pentest, WAF, compliance) |

---

## Quick Reference Checklist

### Phase 1 (6/10) - 9 items
- [ ] Remove JWT secret fallback
- [ ] Remove D2D credential fallbacks
- [ ] Remove API key empty fallbacks
- [ ] Make webhook verification fail-closed
- [ ] Remove dev mode webhook bypass
- [ ] Add WebSocket authorization
- [ ] Generate package-lock.json
- [ ] Fix docker-compose credentials
- [ ] Update .env.example placeholders

### Phase 2 (7/10) - 14 items
- [ ] Remove localStorage token storage
- [ ] Add role requirements to complaint endpoints
- [ ] Fix RBAC inconsistency
- [ ] Fix rate limiter key generation
- [ ] Add WebSocket rate limiting
- [ ] Add status webhook rate limiting
- [ ] Sanitize error handler logging
- [ ] Sanitize body logger
- [ ] Add UUID validation
- [ ] Fix CSV injection
- [ ] Add user active check
- [ ] Enable Playwright sandbox
- [ ] Run npm audit fix

### Phase 3 (8/10) - 12 items
- [ ] Create PII masking utilities
- [ ] Apply masking to all loggers
- [ ] Encrypt Redis cache
- [ ] Enable Redis authentication
- [ ] Add nginx security headers
- [ ] Validate CORS origins
- [ ] Add failed auth audit logging
- [ ] Add rate limit audit logging
- [ ] Update security packages
- [ ] Pin critical package versions
- [ ] Add Zod validation for LM Studio
- [ ] Protect metrics endpoints

### Phase 4 (9/10) - 10 items
- [ ] Add security unit tests
- [ ] Add integration security tests
- [ ] Add OWASP ZAP to CI
- [ ] Implement token blocklist
- [ ] Add session fingerprinting
- [ ] Implement strict CSP
- [ ] Integrate secrets manager
- [ ] Add security alerting
- [ ] Create security dashboards
- [ ] Document incident response

### Phase 5 (9.5/10) - 8 items
- [ ] Professional penetration test
- [ ] Bug bounty program
- [ ] Web Application Firewall
- [ ] Anomaly detection
- [ ] SAST in CI/CD
- [ ] Dependency scanning
- [ ] Security training program
- [ ] SOC 2 / GDPR preparation
