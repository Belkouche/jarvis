# JARVIS Implementation Tasks

## Overview
TKTM Orange Contractor Support & Operations Platform - WhatsApp assistant for field contractors with admin dashboard for BO team.

**Target Launch:** End of January 2026

---

## Week 1: Project Setup & Core Infrastructure

### 1.1 Project Structure Setup
- [ ] Initialize Node.js project with TypeScript
- [ ] Set up Express.js framework
- [ ] Configure ESLint and Prettier
- [ ] Create folder structure (src/config, controllers, services, models, middleware, utils, routes, types)
- [ ] Set up `.env.example` with all environment variables
- [ ] Configure `tsconfig.json` with strict mode

### 1.2 Database Setup
- [ ] Set up PostgreSQL with Docker Compose
- [ ] Configure Prisma ORM
- [ ] Create Prisma schema for all models:
  - [ ] Messages table
  - [ ] Complaints table
  - [ ] Tickets table
  - [ ] MagicLinks table
  - [ ] Sessions table
  - [ ] AuditLogs table
- [ ] Create database migrations (001_init, 002_complaints, 003_auth)
- [ ] Set up connection pooling

### 1.3 Redis Cache Setup
- [ ] Set up Redis with Docker Compose
- [ ] Create Redis client configuration
- [ ] Implement cache utility functions (get, set, del with TTL)

### 1.4 Logging & Error Handling
- [ ] Set up Winston/Pino structured logging
- [ ] Create error handling middleware
- [ ] Implement request logging middleware
- [ ] Configure log levels (info, warn, error)
- [ ] Set up Sentry integration (optional)

### 1.5 Base Application Setup
- [ ] Create main `app.ts` entry point
- [ ] Set up middleware chain (cors, body-parser, rate-limit)
- [ ] Create health check endpoint
- [ ] Configure environment variable validation

---

## Week 2: LM Studio & CRM Integration

### 2.1 LM Studio Service
- [ ] Create `lmStudioService.ts`
- [ ] Implement HTTP client to Gemma 3 12B endpoint
- [ ] Configure 10-second timeout
- [ ] Implement JSON response parsing with validation
- [ ] Create analysis prompt template for:
  - [ ] Language detection (FR/AR/Darija/EN)
  - [ ] Intent classification (status_check/complaint/other)
  - [ ] Contract number extraction
  - [ ] Format validation (F + 7 digits + D)
  - [ ] Spam detection
- [ ] Implement regex fallback for timeout scenarios
- [ ] Add unit tests for LM Studio service

### 2.2 CRM Service (Headless Browser)
- [ ] Create `crmService.ts`
- [ ] Set up Playwright browser automation
- [ ] Implement D2D Portal login flow
- [ ] Create contract status lookup function
- [ ] Configure 50-second timeout
- [ ] Parse response data (etat, sous_etat, sous_etat_2, date_created)
- [ ] Implement error handling (not found, timeout, auth failed)
- [ ] Add retry logic for navigation errors
- [ ] Add unit tests for CRM service

### 2.3 Caching Layer
- [ ] Implement Redis caching for CRM responses
- [ ] Set 5-minute TTL for contract status
- [ ] Create cache key format: `crm_${contract_number}`
- [ ] Implement cache invalidation on refresh
- [ ] Add cache hit/miss logging

### 2.4 Timeout & Fallback Handling
- [ ] Create `withTimeout` utility function
- [ ] Implement fallback chain:
  - [ ] LM Studio timeout → regex extraction
  - [ ] CRM timeout → cached data
  - [ ] All failures → service unavailable message
- [ ] Add fallback logging for monitoring

---

## Week 3: Message Processing & Evolution API

### 3.1 Message Controller
- [ ] Create `messageController.ts`
- [ ] Implement webhook handler for Evolution API
- [ ] Orchestrate parallel LM Studio & CRM calls using `Promise.allSettled`
- [ ] Handle response generation flow
- [ ] Log all operations to database

### 3.2 Message Service
- [ ] Create `messageService.ts`
- [ ] Implement status → template mapping
- [ ] Create bilingual message generation (FR on top, AR below)
- [ ] Store templates in database as JSON
- [ ] Map all status combinations:
  - [ ] En cours + Dossier incomplet
  - [ ] Fermé
  - [ ] En cours + Activation lancée
  - [ ] En cours + BO fixe
  - [ ] En cours + BO prestataire
  - [ ] Refusé + Refusé par BO
- [ ] Add unit tests for template mapping

### 3.3 Evolution API Service
- [ ] Create `evolutionApiService.ts`
- [ ] Implement WhatsApp message sending
- [ ] Add HMAC signature verification for webhooks
- [ ] Implement retry logic (3x with exponential backoff)
- [ ] Track message delivery status
- [ ] Add integration tests

### 3.4 Webhook Routes
- [ ] Create `webhook.ts` routes
- [ ] Implement POST `/api/webhook/message` endpoint
- [ ] Add request validation
- [ ] Add rate limiting (10 req/min per phone)

### 3.5 Contract Validation
- [ ] Create `validators.ts` utility
- [ ] Implement contract format validation regex (F + 7 digits + D)
- [ ] Handle typo correction
- [ ] Add phone number validation

---

## Week 4: Admin Dashboard & Authentication

### 4.1 Magic Link Authentication
- [ ] Create `authController.ts`
- [ ] Implement magic link token generation (32 bytes hex)
- [ ] Create token hashing with bcrypt
- [ ] Set 24-hour expiration
- [ ] Enforce one-time use
- [ ] Create session management

### 4.2 Resend Email Service
- [ ] Create `resendService.ts`
- [ ] Configure Resend API client
- [ ] Create magic link email template (HTML)
- [ ] Implement email sending function
- [ ] Add rate limiting (5 emails/24h per address)
- [ ] Track email delivery via webhooks

### 4.3 Auth Routes
- [ ] Create `auth.ts` routes
- [ ] POST `/api/auth/magic-link/request`
- [ ] GET `/api/auth/magic-link/:token`
- [ ] POST `/api/auth/logout`
- [ ] Implement JWT session tokens

### 4.4 Auth Middleware
- [ ] Create `auth.ts` middleware
- [ ] Implement JWT validation
- [ ] Add role-based access control (Admin, BO Team, Viewer)
- [ ] Create session expiry handling

### 4.5 React Admin Dashboard (Frontend)
- [ ] Initialize React 18 project with Vite
- [ ] Set up TailwindCSS
- [ ] Create folder structure (components, pages, hooks, services)
- [ ] Implement authentication flow:
  - [ ] Login page with email input
  - [ ] Magic link verification
  - [ ] Protected routes
- [ ] Create dashboard layout

### 4.6 Dashboard API Endpoints
- [ ] Create `dashboardController.ts`
- [ ] GET `/api/dashboard/messages` with pagination & filters
- [ ] GET `/api/dashboard/stats` for analytics
- [ ] GET `/api/dashboard/complaints`
- [ ] Add search and filtering capabilities

### 4.7 Dashboard Pages
- [ ] Messages list page with filters
- [ ] Message detail view
- [ ] Analytics dashboard
- [ ] Complaints list page
- [ ] Settings page

---

## Week 5: Complaint Management & Escalation

### 5.1 Complaint Service
- [ ] Create `complaintService.ts`
- [ ] Implement complaint creation from messages
- [ ] Add complaint type categorization:
  - [ ] Retard installation
  - [ ] Annulation contrat
  - [ ] Contact errone
  - [ ] Adresse erronee
  - [ ] Cas bloque
  - [ ] Deuxieme contrat
  - [ ] Prise de RDV
  - [ ] Autre
- [ ] Implement status management (open, assigned, escalated, resolved)
- [ ] Add priority assignment (low, medium, high)

### 5.2 Complaint Controller & Routes
- [ ] Create `complaintController.ts`
- [ ] POST `/api/complaints` - create complaint
- [ ] GET `/api/complaints` - list with filters
- [ ] GET `/api/complaints/:id` - detail view
- [ ] PUT `/api/complaints/:id` - update status/notes
- [ ] POST `/api/complaints/:id/assign` - assign to BO member
- [ ] POST `/api/complaints/:id/escalate` - escalate to Orange

### 5.3 Ticket Service (Orange Escalation)
- [ ] Create `ticketService.ts`
- [ ] Implement Orange ticket creation
- [ ] Generate Orange ticket ID format (ONG-XXXXXX)
- [ ] Track ticket status (open, in_progress, resolved, closed)
- [ ] Add resolution notes handling

### 5.4 Ticket Controller & Routes
- [ ] Create `ticketController.ts`
- [ ] GET `/api/tickets` - list escalated tickets
- [ ] GET `/api/tickets/:id` - ticket detail
- [ ] PUT `/api/tickets/:id` - update status
- [ ] Add Orange ticket ID assignment

### 5.5 Escalation Workflow
- [ ] Implement escalation decision flow:
  - [ ] Low priority → TKTM internal resolution
  - [ ] Medium priority → TKTM escalates to Orange
  - [ ] High priority → Immediate Orange escalation
- [ ] Add notification system for escalations
- [ ] Create escalation audit trail

### 5.6 Audit Service
- [ ] Create `auditService.ts`
- [ ] Log all admin actions:
  - [ ] admin_login
  - [ ] complaint_created
  - [ ] ticket_escalated
  - [ ] export_generated
- [ ] Track actor, resource_id, action, changes
- [ ] Store IP address and user agent

### 5.7 Export Functionality
- [ ] Implement Excel export for complaints
- [ ] Add date range filtering for exports
- [ ] Create export API endpoint
- [ ] Add audit logging for exports

### 5.8 Dashboard Complaint Pages
- [ ] Complaints management page
- [ ] Complaint detail/edit page
- [ ] Escalation workflow UI
- [ ] Ticket tracking page
- [ ] Analytics for complaint trends

---

## Week 6: Testing & Deployment

### 6.1 Unit Tests
- [ ] Contract regex validation tests
- [ ] LM Studio JSON parsing tests
- [ ] Message template mapping tests
- [ ] Bilingual response generation tests
- [ ] Error message formatting tests
- [ ] Magic link token generation tests
- [ ] Rate limiter tests
- [ ] Email template rendering tests

### 6.2 Integration Tests
- [ ] End-to-end message flow (Message → LM → CRM → Response)
- [ ] Error scenarios (timeout, invalid, not found, spam)
- [ ] Bilingual response generation
- [ ] Complaint creation & escalation workflow
- [ ] Magic link email flow
- [ ] Admin dashboard filtering & search
- [ ] Excel export functionality
- [ ] Audit logging verification

### 6.3 Load Tests
- [ ] Test 100 concurrent messages/min
- [ ] Verify P95 latency < 70 seconds
- [ ] Test cache hit rate > 80%
- [ ] Test database connection pooling
- [ ] Test Redis memory management

### 6.4 Manual Testing
- [ ] Send real WhatsApp test messages
- [ ] Verify bilingual responses (FR/AR)
- [ ] Test complaint filing workflow
- [ ] Verify dashboard filtering & exports
- [ ] Test magic link email delivery
- [ ] Verify one-time use enforcement
- [ ] Test all contract status combinations
- [ ] Test error messages
- [ ] Test phone number variations
- [ ] Verify Orange escalation workflow

### 6.5 Security Audit
- [ ] Review authentication implementation
- [ ] Validate input sanitization
- [ ] Check for SQL injection vulnerabilities
- [ ] Verify HMAC webhook signatures
- [ ] Review rate limiting
- [ ] Check sensitive data handling

### 6.6 Staging Deployment
- [ ] Set up staging environment
- [ ] Configure all environment variables
- [ ] Run database migrations
- [ ] Deploy application
- [ ] Configure email delivery (DMARC/SPF/DKIM)
- [ ] Test cache strategy
- [ ] TKTM BO team UAT

### 6.7 Production Deployment
- [ ] Set up production infrastructure
- [ ] Configure production secrets
- [ ] Deploy to production
- [ ] Monitor initial traffic
- [ ] Enable alerting
- [ ] Document runbooks

---

## Success Metrics Checklist

- [ ] 99% message delivery rate to WhatsApp
- [ ] End-to-end latency < 70 seconds (P95)
- [ ] 95%+ valid contract format detection
- [ ] All responses bilingual (FR/AR)
- [ ] Zero data loss (100% audit logging)
- [ ] Admin dashboard fully functional
- [ ] Magic link email delivery > 99%
- [ ] LM Studio fallback < 5%
- [ ] Comprehensive error handling
- [ ] Working complaint escalation
- [ ] Performance under load (100 msgs/min)
- [ ] TKTM contractor satisfaction > 90%
- [ ] Orange escalation process < 5 minutes

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ (TypeScript) |
| Framework | Express.js |
| Database | PostgreSQL |
| Cache | Redis |
| ORM | Prisma |
| Browser Automation | Playwright |
| LM Client | axios |
| Email | Resend |
| Auth | JWT + Magic Links |
| Frontend | React 18 + TailwindCSS |

---

**Total Tasks: ~150+**
**Estimated Duration: 6 weeks**
