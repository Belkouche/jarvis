# JARVIS Platform Security Review

**Date:** January 9, 2026
**Branch:** vk/0a34-security-review
**Scope:** Full security audit of the JARVIS contractor support platform

---

## Executive Summary

This comprehensive security review identified **48 security findings** across the JARVIS codebase:

| Severity | Count | Categories |
|----------|-------|------------|
| **Critical** | 9 | Hardcoded secrets, auth bypass, SSRF, webhook bypass |
| **High** | 13 | IDOR, rate limiting bypass, CSV injection, info disclosure |
| **Medium** | 16 | Missing validation, CORS issues, logging PII, browser security |
| **Low** | 10 | Session handling, metrics exposure, dev bypasses |

**Immediate action required** on Critical findings to prevent unauthorized access and data breaches.

---

## Critical Findings

### 1. Hardcoded Default JWT Secret
**File:** `src/middleware/auth.ts:16`
**Issue:** Fallback to `'default-secret-change-me'` if JWT_SECRET not set
**Impact:** Attackers can forge JWT tokens and impersonate any user
**Fix:** Remove fallback, fail startup if secret not configured

```typescript
// VULNERABLE
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';

// FIXED
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}
```

### 2. Webhook Signature Bypass When Secret Missing
**File:** `src/services/evolutionApiService.ts:55-58`
**Issue:** Returns `true` without verification if EVOLUTION_WEBHOOK_SECRET not configured
**Impact:** Any attacker can inject forged WhatsApp messages
**Fix:** Return `false` (fail-closed) when secret not configured

### 3. Development Mode Webhook Bypass
**File:** `src/routes/webhook.ts:18-23`
**Issue:** Skips signature verification in development mode
**Impact:** Forged webhooks accepted if NODE_ENV misconfigured
**Fix:** Always require signature verification regardless of environment

### 4. WebSocket IDOR - Subscribe Without Authorization
**File:** `src/services/websocketService.ts:87-93`
**Issue:** Any authenticated user can subscribe to any complaint by ID
**Impact:** Unauthorized access to real-time complaint updates
**Fix:** Verify user has permission before allowing subscription

### 5. Potential SSRF via D2D Portal URL
**File:** `src/services/crmService.ts:8,69,110`
**Issue:** D2D_PORTAL_URL from environment used in Playwright navigation
**Impact:** If attacker can set env var, can access internal services
**Fix:** Whitelist allowed D2D portal hostnames

### 6. Hardcoded SMTP Credentials
**File:** `monitoring/alertmanager.yml:5`
**Issue:** Placeholder password `'password'` in config file
**Impact:** Could be deployed with weak credentials
**Fix:** Use environment variable substitution

### 7. Hardcoded Database Credentials in Docker Compose
**File:** `docker-compose.yml:9-10,66`
**Issue:** `POSTGRES_PASSWORD: secure_password` in dev compose
**Impact:** Could be accidentally used in production
**Fix:** Use environment variables with required validation

### 8. Browser Context Credentials Persistence
**File:** `src/services/crmService.ts:14-16,41-58`
**Issue:** Authenticated Playwright context cached indefinitely
**Impact:** Session never expires, credentials persisted in memory
**Fix:** Implement session expiration and proper cleanup

### 9. Unsafe JSON Deserialization from LM Studio
**File:** `src/services/lmStudioService.ts:86-93`
**Issue:** Raw JSON.parse without schema validation
**Impact:** Prototype pollution or injection if LM Studio compromised
**Fix:** Use Zod to validate response structure

---

## High Severity Findings

### 10. JWT Token Stored in localStorage
**File:** `frontend/src/stores/authStore.ts:29,37`
**Issue:** JWT stored in localStorage, accessible to XSS
**Impact:** Token theft if any XSS vulnerability exists
**Fix:** Use httpOnly cookies only (backend already sets them)

### 11. IDOR in Complaint Endpoints
**File:** `src/routes/complaints.ts:25-28`
**Issue:** Any authenticated user can view any complaint by ID
**Impact:** Unauthorized access to customer PII
**Fix:** Require admin/bo_team role or add ownership check

### 12. Request Body Logged in Error Handler
**File:** `src/middleware/errorHandler.ts:125-131`
**Issue:** Full `req.body` logged including passwords/tokens
**Impact:** Credentials exposed in log aggregation systems
**Fix:** Use `sanitizeForLog()` helper before logging

### 13. Missing Rate Limiting on WebSocket
**File:** `src/services/websocketService.ts`
**Issue:** No connection or event rate limiting
**Impact:** DoS via connection flooding or event spam
**Fix:** Implement RateLimiterMemory for WebSocket

### 14. Rate Limiter Bypass via Phone Spoofing
**File:** `src/middleware/rateLimit.ts:14-17`
**Issue:** Rate limit key uses user-supplied phone from request body
**Impact:** Attacker can bypass by changing phone each request
**Fix:** Use IP address as primary rate limit key

### 15. CSV Injection in Export
**File:** `src/routes/dashboard.ts:68-71,88-91`
**Issue:** User data interpolated into CSV without sanitization
**Impact:** Formula injection when opened in Excel
**Fix:** Prefix dangerous characters with single quote

### 16. Magic Link Token Enumeration
**File:** `src/controllers/authController.ts:109-127`
**Issue:** Iterates up to 100 magic links with bcrypt compare
**Impact:** Timing side-channel, poor performance under load
**Fix:** Store hash prefix for efficient lookup

### 17. Missing Session Invalidation on Deactivation
**File:** `src/middleware/auth.ts`
**Issue:** No check if user's `isActive` flag changed after token issued
**Impact:** Deactivated users retain access until token expires
**Fix:** Add database check or implement token blocklist

### 18. Missing package-lock.json (Backend)
**File:** Backend root directory
**Issue:** No lockfile for reproducible builds
**Impact:** Cannot audit transitive dependencies, builds non-reproducible
**Fix:** Generate and commit package-lock.json

### 19. Playwright --no-sandbox Flag
**File:** `src/services/crmService.ts:23-31`
**Issue:** Chromium sandbox disabled in production
**Impact:** Browser exploit gives direct host access
**Fix:** Configure container to allow sandboxed execution

### 20. Sensitive Data in Redis Cache
**File:** `src/config/redis.ts:56-66`
**Issue:** CRM data cached without encryption
**Impact:** All cached customer data exposed if Redis compromised
**Fix:** Encrypt sensitive data, require Redis auth, use TLS

### 21. Stack Traces Logged Unconditionally
**File:** `src/middleware/errorHandler.ts:125-131`
**Issue:** Stack traces always logged regardless of environment
**Impact:** Internal paths, library versions exposed
**Fix:** Only log stack traces in development

### 22. Insufficient Input Validation on Complaint ID
**File:** `src/routes/complaints.ts:28,31-35,38-42`
**Issue:** UUID parameter not validated before database query
**Impact:** Potential for injection or info disclosure via errors
**Fix:** Add UUID validation middleware

---

## Medium Severity Findings

### 23. CORS Origin Not Validated
**Files:** `src/app.ts:35-42`, `src/services/websocketService.ts:28-31`
**Issue:** CORS_ORIGINS split without validation
**Impact:** Arbitrary origins could be allowed if misconfigured

### 24. Missing Security Headers in Nginx
**File:** `nginx/conf.d/default.conf`
**Issue:** No X-Content-Type-Options, X-Frame-Options, CSP headers
**Impact:** Clickjacking, MIME sniffing vulnerabilities

### 25. Insecure .env.example Values
**File:** `.env.example:25-26`
**Issue:** Placeholder secrets look like real values
**Impact:** Could be copied to production unchanged

### 26. API Keys with Empty Fallbacks
**Files:** Multiple service files
**Issue:** `process.env.KEY || ''` fallback patterns
**Impact:** Confusing errors instead of fail-fast startup

### 27. Missing Rate Limiting on Status Webhook
**File:** `src/routes/webhook.ts:68-70`
**Issue:** `/status` endpoint lacks rate limiting
**Impact:** DoS vulnerability on status updates

### 28. Phone Numbers Logged as PII
**Files:** `src/config/logger.ts:69-74`, multiple controllers
**Issue:** Full phone numbers logged throughout
**Impact:** GDPR/privacy compliance violations

### 29. Email Addresses Logged Without Masking
**File:** `src/config/logger.ts:100-110`
**Issue:** Full emails logged for auth events
**Impact:** PII exposure in log aggregation

### 30. Debug Logging Exposes Request Body
**File:** `src/middleware/logging.ts:47-54`
**Issue:** Full body logged if LOG_LEVEL=debug
**Impact:** Credentials exposed if debug enabled in production

### 31. Database Queries Logged in Development
**File:** `src/config/database.ts:22-26`
**Issue:** Full SQL queries with parameters logged
**Impact:** PII in WHERE clauses exposed

### 32. Session Token Uses SHA-256 Not Bcrypt
**File:** `src/controllers/authController.ts:172`
**Issue:** Session tokens hashed with fast SHA-256
**Impact:** Easier brute force if database compromised

### 33. No Rate Limiting on Playwright Operations
**File:** `src/services/crmService.ts:102-152`
**Issue:** Each lookup spawns new browser page
**Impact:** Resource exhaustion via lookup flooding

### 34. Missing Contract Number Validation in Portal
**File:** `src/services/crmService.ts:102-120`
**Issue:** Contract number not validated before portal injection
**Impact:** Potential XSS in D2D Portal

### 35. Missing Audit Logging for Security Events
**File:** `src/services/auditService.ts`
**Issue:** No audit for failed logins, rate limits, role changes
**Impact:** Security incidents harder to investigate

### 36. RBAC Array vs Rest Parameter Inconsistency
**Files:** `src/routes/complaints.ts:13`, `src/routes/dashboard.ts:46`
**Issue:** Inconsistent requireRole() invocation
**Impact:** Potential authorization bypass

### 37. Verbose Error Messages in Non-Production
**File:** `src/middleware/errorHandler.ts:166-173`
**Issue:** Internal error messages exposed when not production
**Impact:** Staging environments leak implementation details

### 38. Frontend npm audit Vulnerabilities
**File:** `frontend/package.json`
**Issue:** Moderate vulnerabilities in esbuild/vite
**Impact:** Dev server security issues

---

## Low Severity Findings

### 39. Session Deletion Clears All User Sessions
**File:** `src/controllers/authController.ts:217-219`
**Issue:** Logout deletes all sessions for email
**Impact:** Can't have multiple valid sessions

### 40. Unauthenticated Metrics Endpoints
**File:** `src/routes/health.ts:100-124`
**Issue:** `/health/metrics` publicly accessible
**Impact:** System info exposed

### 41. Console Logs in Frontend
**File:** `frontend/src/hooks/useWebSocket.ts:69,74,79`
**Issue:** Connection state logged to browser console
**Impact:** Internal info visible to users

### 42. Test Files Contain Hardcoded Secrets
**Files:** `tests/setup.ts:9-10`, `tests/helpers/testUtils.ts:5`
**Issue:** Test JWT secrets in code
**Impact:** Encourages insecure patterns

### 43. User Agent Spoofing in Playwright
**File:** `src/services/crmService.ts:48-49`
**Issue:** Fake browser user agent
**Impact:** May violate Orange TOS

### 44. Permissive Dependency Version Ranges
**Files:** Both package.json files
**Issue:** Caret ranges allow auto-updates
**Impact:** Compromised package could be installed

### 45. Outdated Security Packages
**File:** `package.json`
**Issue:** bcrypt 5.x, helmet 7.x, express-rate-limit 7.x outdated
**Impact:** Missing security improvements

### 46. Log Injection Risk in Development
**File:** `src/config/logger.ts`
**Issue:** Development format uses string interpolation
**Impact:** Control characters could manipulate logs

### 47. Missing Session Invalidation on Password Change
**Issue:** Old sessions valid after account recovery
**Impact:** Compromised accounts retain access

### 48. Default JWT Secret in Test Utils
**File:** `tests/helpers/testUtils.ts:5`
**Issue:** Fallback to 'test-secret-key'
**Impact:** Tests could generate valid production tokens

---

## Recommended Priority Actions

### Immediate (0-7 days)
1. Remove JWT secret fallback - fail startup if not configured
2. Make webhook verification fail-closed (return false when missing)
3. Remove development mode webhook bypass
4. Add authorization check to WebSocket complaint subscription
5. Generate and commit package-lock.json

### Short-term (1-4 weeks)
1. Remove localStorage token storage, use httpOnly cookies only
2. Add role requirements to complaint read endpoints
3. Sanitize request body before logging
4. Implement WebSocket rate limiting
5. Fix CSV injection with proper escaping
6. Add efficient magic link lookup with hash prefix

### Medium-term (1-3 months)
1. Implement proper session invalidation on user deactivation
2. Add missing security headers to nginx
3. Encrypt sensitive data in Redis
4. Add comprehensive security audit logging
5. Update outdated security packages
6. Implement proper Playwright sandboxing

---

## Positive Security Practices Observed

- JWT authentication with httpOnly cookies in addition to header tokens
- Rate limiting implemented at multiple levels
- bcrypt used for password hashing (10 rounds)
- Timing-safe comparison for signature verification
- Zod schemas for input validation
- Helmet middleware for basic security headers
- Comprehensive audit logging infrastructure
- Structured logging with Winston (JSON in production)
- Environment variable validation with Zod

---

## Appendix: Files Requiring Changes

### Critical Priority
- `src/middleware/auth.ts` - Remove JWT secret fallback
- `src/services/evolutionApiService.ts` - Fail-closed webhook verification
- `src/routes/webhook.ts` - Remove dev mode bypass
- `src/services/websocketService.ts` - Add subscription authorization
- `src/services/crmService.ts` - URL validation, credential handling

### High Priority
- `frontend/src/stores/authStore.ts` - Remove localStorage usage
- `frontend/src/services/api.ts` - Remove localStorage token handling
- `src/middleware/errorHandler.ts` - Sanitize logged data
- `src/routes/complaints.ts` - Add role requirements
- `src/routes/dashboard.ts` - Fix CSV injection
- `src/middleware/rateLimit.ts` - Fix key generation

### Medium Priority
- `src/app.ts` - Validate CORS origins
- `nginx/conf.d/default.conf` - Add security headers
- `.env.example` - Use clearly invalid placeholders
- `src/config/logger.ts` - Mask PII in logs
- `src/middleware/logging.ts` - Sanitize body logging
