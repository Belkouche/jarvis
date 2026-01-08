# JARVIS

**Intelligent Contractor Support & Operations Platform**

A WhatsApp-based intelligent assistant system for Orange Morocco field contractors, featuring AI-powered message analysis, CRM integration, complaint management, and a real-time admin dashboard.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [Deployment](#deployment)
- [Monitoring](#monitoring)
- [Architecture](#architecture)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

JARVIS enables Orange Morocco field contractors to check contract status and file complaints via WhatsApp. The platform processes messages using a local LLM (Gemma 3 12B via LM Studio), queries the D2D Portal CRM via browser automation, and delivers bilingual responses (French/Arabic).

### Key Capabilities

- **WhatsApp Integration** - Receive and respond to contractor messages via Evolution API
- **AI-Powered Analysis** - Intent detection, language recognition (FR/AR/Darija/EN), and contract extraction
- **CRM Automation** - Playwright-based D2D Portal scraping for real-time contract status with Redis caching
- **Complaint Management** - End-to-end workflow with priority levels and escalation to Orange
- **Admin Dashboard** - Real-time analytics, message history, complaint tracking, and data export
- **Passwordless Auth** - Magic link authentication for secure admin access
- **Real-Time Updates** - WebSocket-powered live notifications

---

## Features

### Message Processing Pipeline

1. **Incoming Message Reception** - WhatsApp messages received via Evolution API webhook
2. **AI Analysis** - Language detection (French, Arabic, Darija, English), intent classification (status_check, complaint, other), contract extraction (F + 7 digits + D format), spam detection
3. **CRM Lookup** - Automated D2D Portal query with 5-minute Redis cache TTL
4. **Response Generation** - Template-based bilingual messages (French + Arabic)
5. **Delivery Tracking** - Message status monitoring with latency logging

### Complaint Management

| Type | Description |
|------|-------------|
| Installation delay | Contractor installation taking too long |
| Contract cancellation | Request to cancel contract |
| Wrong contact | Incorrect contact information |
| Wrong address | Incorrect address on file |
| Blocked case | Case is blocked/stuck |
| Second contract | Issues with secondary contracts |
| Appointment | Appointment-related issues |
| Other | General complaints |

**Priority Levels:** Low, Medium, High, Critical

**Status Workflow:**
```
Open → Assigned → Escalated → Resolved
```

- Orange ticket escalation with status synchronization
- Audit trail for compliance
- Assignment to back-office team members

### Admin Dashboard

- Real-time analytics with KPI cards and charts
- Message history with advanced filtering and search
- Complaint management interface with status updates
- CSV/JSON data export functionality
- WebSocket-powered live notifications
- Role-based access control (Admin, BO Team, Viewer)

---

## Technology Stack

### Backend

| Category | Technology | Version |
|----------|------------|---------|
| Runtime | Node.js | 20+ |
| Language | TypeScript | 5.9 |
| Framework | Express.js | 5.2.1 |
| Database | PostgreSQL | 15 |
| ORM | Prisma | 7.2.0 |
| Cache | Redis + ioredis | 7 / 5.3.2 |
| Real-time | Socket.IO | 4.8.3 |
| AI/LLM | LM Studio (Gemma 3 12B) | - |
| Browser Automation | Playwright | 1.57.0 |
| Email | Resend API | 2.1.0 |
| Auth | JWT + bcrypt | 5.1.1 |
| Validation | Zod | 3.22.4 |
| Logging | Winston | 3.11.0 |
| Rate Limiting | express-rate-limit | 7.1.5 |
| Security | Helmet | 7.1.0 |

### Frontend

| Category | Technology | Version |
|----------|------------|---------|
| Framework | React | 19.2.1 |
| Build Tool | Vite | 7.3.1 |
| Styling | TailwindCSS | 4.1.18 |
| Routing | React Router | 6 |
| State Management | Zustand | 5.0.9 |
| Data Fetching | TanStack Query | 5.90.16 |
| Charts | Recharts | 3.6.0 |
| WebSocket | socket.io-client | 4.8.3 |
| Date Utilities | date-fns | 3.2.0 |
| Icons | lucide-react | 0.309.0 |

### DevTools

| Category | Technology | Version |
|----------|------------|---------|
| Testing | Vitest + Supertest | 1.2.1 / 6.3.4 |
| Linting | ESLint | 9.0.0 |
| Formatting | Prettier | 3.2.4 |
| Load Testing | k6 | - |

### Monitoring Stack

| Component | Technology |
|-----------|------------|
| Metrics | Prometheus |
| Dashboards | Grafana |
| Log Aggregation | Loki |
| Log Shipping | Promtail |
| Alerting | Alertmanager |

---

## Project Structure

```
Jarvis/
├── src/                           # Backend TypeScript source
│   ├── app.ts                     # Express app with WebSocket integration
│   ├── config/                    # Configuration modules
│   │   ├── logger.ts              # Winston logging setup
│   │   ├── database.ts            # Prisma client singleton
│   │   ├── redis.ts               # Redis connection
│   │   └── env.ts                 # Environment validation
│   ├── controllers/               # Request handlers
│   │   ├── messageController.ts   # Webhook & message processing
│   │   ├── authController.ts      # Magic link authentication
│   │   └── complaintController.ts # Complaint CRUD operations
│   ├── middleware/                # Express middleware
│   │   ├── auth.ts                # JWT & role validation
│   │   ├── errorHandler.ts        # Global error handling
│   │   ├── rateLimit.ts           # Rate limiting configuration
│   │   ├── logging.ts             # Request logging
│   │   └── validation.ts          # Zod schema validation
│   ├── routes/                    # API route definitions
│   │   ├── webhook.ts             # Evolution API webhooks
│   │   ├── auth.ts                # Magic link routes
│   │   ├── dashboard.ts           # Dashboard API with export
│   │   ├── complaints.ts          # Complaint management
│   │   └── health.ts              # Health check endpoints
│   ├── services/                  # Business logic layer
│   │   ├── lmStudioService.ts     # LLM integration with fallback
│   │   ├── crmService.ts          # Playwright D2D automation
│   │   ├── messageService.ts      # Message processing pipeline
│   │   ├── complaintService.ts    # Complaint workflow logic
│   │   ├── escalationService.ts   # Scheduled Orange escalation
│   │   ├── evolutionApiService.ts # WhatsApp API integration
│   │   ├── resendService.ts       # Email delivery
│   │   ├── websocketService.ts    # Real-time notifications
│   │   ├── notificationService.ts # Notification logic
│   │   ├── orangeTicketService.ts # Orange ticket creation
│   │   ├── auditService.ts        # Compliance audit logging
│   │   └── metricsService.ts      # Performance metrics
│   ├── scripts/
│   │   └── seed-templates.ts      # Database template seeding
│   ├── types/
│   │   └── index.ts               # TypeScript type definitions
│   └── utils/
│       └── helpers.ts             # Utility functions
│
├── frontend/                      # React dashboard application
│   ├── src/
│   │   ├── pages/                 # Page components
│   │   │   ├── LoginPage.tsx      # Magic link login
│   │   │   ├── VerifyPage.tsx     # Token verification
│   │   │   ├── DashboardPage.tsx  # Analytics dashboard
│   │   │   ├── MessagesPage.tsx   # Message list
│   │   │   ├── MessageDetailPage.tsx
│   │   │   ├── ComplaintsPage.tsx # Complaint list
│   │   │   └── ComplaintDetailPage.tsx
│   │   ├── components/            # Reusable components
│   │   │   ├── Layout.tsx         # Main layout with sidebar
│   │   │   └── NotificationBell.tsx # Real-time notifications
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── services/              # API client layer
│   │   ├── stores/                # Zustand state stores
│   │   ├── types/                 # Frontend TypeScript types
│   │   ├── App.tsx                # Root component with routing
│   │   ├── main.tsx               # Application entry point
│   │   └── index.css              # Global styles
│   ├── vite.config.ts             # Vite configuration
│   ├── tsconfig.json              # TypeScript config
│   ├── package.json               # Frontend dependencies
│   ├── tailwind.config.js         # Tailwind configuration
│   └── nginx.conf                 # Production Nginx config
│
├── prisma/
│   └── schema.prisma              # Database schema definition
│
├── tests/                         # Comprehensive test suite
│   ├── unit/                      # Unit tests
│   │   ├── lmStudioService.test.ts
│   │   ├── messageService.test.ts
│   │   ├── helpers.test.ts
│   │   └── validation.test.ts
│   ├── integration/               # Integration tests
│   │   ├── messageFlow.test.ts    # End-to-end message processing
│   │   ├── authFlow.test.ts       # Magic link authentication
│   │   ├── dashboardFlow.test.ts  # Dashboard API operations
│   │   └── complaintFlow.test.ts  # Complaint management
│   ├── load/                      # Performance testing
│   │   ├── k6-load-test.js        # k6 load test scripts
│   │   └── README.md              # Load testing documentation
│   ├── helpers/
│   │   └── testUtils.ts           # Test utilities
│   └── setup.ts                   # Test configuration
│
├── monitoring/                    # Observability configuration
│   ├── prometheus.yml             # Metrics scraping config
│   ├── alertmanager.yml           # Alert routing rules
│   └── alerts/                    # Prometheus alert definitions
│
├── nginx/                         # Nginx configuration
│   ├── nginx.conf                 # Main configuration
│   └── conf.d/                    # Site configurations
│
├── scripts/                       # Automation scripts
│   ├── setup.sh                   # Initial environment setup
│   ├── deploy.sh                  # Deployment automation
│   └── init-db.sql                # Database initialization
│
├── docker-compose.yml             # Development environment
├── docker-compose.prod.yml        # Production environment
├── docker-compose.monitoring.yml  # Monitoring stack
├── Dockerfile                     # Development image
├── Dockerfile.prod                # Production multi-stage build
├── package.json                   # Backend dependencies
├── tsconfig.json                  # TypeScript configuration
├── vitest.config.ts               # Vitest configuration
├── .env.example                   # Environment template
├── .env.prod.example              # Production env template
├── .eslintrc.json                 # ESLint rules
├── .prettierrc                    # Prettier configuration
├── DEPLOYMENT.md                  # Deployment guide
└── JARVIS_TASKS.md                # Implementation roadmap
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15 (or via Docker)
- Redis 7 (or via Docker)
- LM Studio with Gemma 3 12B model

### Development Setup

1. **Clone and install dependencies**

```bash
git clone https://github.com/Belkouche/jarvis.git
cd jarvis
npm install
cd frontend && npm install && cd ..
```

2. **Start infrastructure services**

```bash
docker-compose up -d postgres redis
```

3. **Configure environment**

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Initialize database**

```bash
npx prisma generate
npx prisma migrate dev
npm run db:seed
```

5. **Start development servers**

```bash
# Terminal 1 - Backend
npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

6. **Start LM Studio**

- Launch LM Studio
- Load Gemma 3 12B model
- Start local server on configured port

The API will be available at `http://localhost:3000` and the dashboard at `http://localhost:5173`.

### Full Docker Development

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Run migrations
docker-compose exec api npx prisma migrate deploy

# Stop services
docker-compose down
```

---

## Configuration

### Required Environment Variables

```bash
# Core
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://jarvis:password@localhost:5432/jarvis_db
REDIS_URL=redis://localhost:6379/0

# LM Studio (AI)
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_TIMEOUT=10000

# Evolution API (WhatsApp)
EVOLUTION_API_URL=https://evo.example.com
EVOLUTION_API_KEY=your_api_key
EVOLUTION_WEBHOOK_SECRET=your_webhook_secret

# Email (Resend)
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=noreply@example.com
RESEND_ADMIN_EMAIL=admin@example.com

# Authentication
SESSION_SECRET=generate_secure_random_string
JWT_SECRET=generate_64_character_minimum_secret_key
JWT_EXPIRY=86400

# D2D Portal (CRM)
D2D_PORTAL_URL=https://d2d.orange.ma
D2D_USERNAME=bot_username
D2D_PASSWORD=bot_password

# Dashboard
DASHBOARD_URL=https://admin.example.com
```

### Optional Environment Variables

```bash
# Orange Integration
ORANGE_API_URL=https://api.orange.ma
ORANGE_API_KEY=your_orange_api_key

# Operational
LOG_LEVEL=info                    # info, debug, warn, error
ENABLE_ESCALATION_WORKFLOW=true   # Enable scheduled escalation
ADMIN_EMAILS=admin@example.com    # Comma-separated admin emails
SENTRY_DSN=https://...            # Error tracking

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000        # 1 minute window
RATE_LIMIT_MAX_REQUESTS=10        # Max requests per window

# Cache
CACHE_TTL_CRM=300                 # CRM cache TTL in seconds
```

See `.env.example` for all configuration options.

---

## API Reference

### Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhook/message` | Receive WhatsApp messages from Evolution API |
| POST | `/api/webhook/status` | Message delivery status updates |
| GET | `/api/webhook/health` | Webhook health check |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/magic-link/request` | Request magic link email |
| GET | `/api/auth/magic-link/verify` | Verify token and create session |
| POST | `/api/auth/logout` | End session |
| GET | `/api/auth/me` | Get current user info |

### Dashboard (Authenticated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/messages` | List messages (paginated, filterable) |
| GET | `/api/dashboard/messages/:id` | Message details |
| GET | `/api/dashboard/stats` | Statistics and analytics |
| GET | `/api/dashboard/export` | Export data (CSV/JSON) |

### Complaints (Authenticated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/complaints` | List complaints (paginated, filterable) |
| GET | `/api/complaints/:id` | Complaint details with audit trail |
| PATCH | `/api/complaints/:id/status` | Update complaint status |
| POST | `/api/complaints/:id/assign` | Assign to team member |
| POST | `/api/complaints/:id/notes` | Add internal notes |
| POST | `/api/complaints/:id/escalate` | Escalate to Orange |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Application health check |
| GET | `/health/ready` | Readiness probe (includes DB/Redis) |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `complaint:new` | Server → Client | New complaint created |
| `complaint:updated` | Server → Client | Complaint status changed |
| `message:new` | Server → Client | New message received |

---

## Database Schema

### Core Models

| Model | Description |
|-------|-------------|
| **Message** | WhatsApp messages with AI analysis results, CRM data, and response details |
| **Complaint** | Filed complaints with status, priority, assignment, and escalation |
| **Ticket** | Orange escalation tickets linked to complaints |
| **MagicLink** | Passwordless auth tokens (24-hour expiry, one-time use) |
| **Session** | Active user sessions with JWT tokens |
| **AuditLog** | Compliance audit trail for all actions |
| **MessageTemplate** | Bilingual response templates (French/Arabic) |
| **AdminUser** | Dashboard users with roles and permissions |

### Entity Relationships

```
Message ─────────────┬──── Complaint ──── Ticket
                     │          │
                     │          └──── AdminUser (assignee)
                     │
MessageTemplate      │
                     │
AuditLog ────────────┤
                     │
MagicLink ───────────┴──── Session
```

### Key Indexes

- `Message`: phone, contractNumber, createdAt
- `Complaint`: status, priority, createdAt
- `Ticket`: status, createdAt
- `MagicLink`: email, token
- `AuditLog`: actor, eventType, createdAt

### Database Commands

```bash
# Generate Prisma client
npx prisma generate

# Run migrations (development)
npx prisma migrate dev

# Run migrations (production)
npx prisma migrate deploy

# Seed templates
npm run db:seed

# Open Prisma Studio
npx prisma studio
```

---

## Testing

### Test Structure

- **Unit Tests** - Service and utility function tests with mocking
- **Integration Tests** - End-to-end API workflow tests
- **Load Tests** - Performance and concurrency testing with k6

### Run Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage report
npm run test:coverage

# Watch mode
npm run test:watch
```

### Load Testing

```bash
cd tests/load

# Smoke test (basic functionality)
k6 run --env TEST_TYPE=smoke k6-load-test.js

# Load test (normal usage)
k6 run --env TEST_TYPE=load k6-load-test.js

# Stress test (find breaking points)
k6 run --env TEST_TYPE=stress k6-load-test.js

# Spike test (sudden traffic)
k6 run --env TEST_TYPE=spike k6-load-test.js
```

### Performance Targets

| Metric | Target |
|--------|--------|
| Concurrent users | 100+ |
| Messages per second | 50+ |
| P95 response time | < 2 seconds |
| Error rate | < 1% |
| Cache hit rate | > 80% |

---

## Deployment

### Production with Docker Compose

```bash
# Configure production environment
cp .env.prod.example .env.prod

# Build and deploy
docker-compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker-compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Scale API servers
docker-compose -f docker-compose.prod.yml up -d --scale api=2

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Production Features

- **Multi-stage Docker builds** - Optimized image size
- **Non-root user** - Container security (nodejs:1001)
- **Health checks** - Automatic container recovery
- **Resource limits** - Memory and CPU constraints
- **Rolling updates** - Zero-downtime deployments
- **Network isolation** - Internal/external network separation
- **Graceful shutdown** - 30-second timeout for cleanup

### SSL/TLS Setup

Place certificates in `nginx/ssl/`:
- `fullchain.pem` - Certificate chain
- `privkey.pem` - Private key

### Database Operations

```bash
# Backup
docker exec jarvis-postgres pg_dump -U jarvis jarvis_db > backup_$(date +%Y%m%d).sql

# Restore
cat backup.sql | docker exec -i jarvis-postgres psql -U jarvis jarvis_db
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment instructions.

---

## Monitoring

### Start Monitoring Stack

```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

### Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Grafana | http://localhost:3001 | Dashboards and visualization |
| Prometheus | http://localhost:9090 | Metrics and queries |
| Alertmanager | http://localhost:9093 | Alert management |

### Available Metrics

- Request latency (P50, P95, P99)
- Message processing times
- CRM lookup performance
- LM Studio response times
- Error rates by endpoint
- Active WebSocket connections

### Log Aggregation

Logs are collected via Promtail and stored in Loki with 15-day retention. Query logs through Grafana's Explore interface.

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Nginx (SSL/Proxy)                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Load Balancer                              │
└─────────────────────────────────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   API Server    │   │   API Server    │   │   API Server    │
│   (Node.js)     │   │   (Node.js)     │   │   (Node.js)     │
│   + Socket.IO   │   │   + Socket.IO   │   │   + Socket.IO   │
└─────────────────┘   └─────────────────┘   └─────────────────┘
          │                     │                     │
          └─────────────────────┼─────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   PostgreSQL    │   │      Redis      │   │   LM Studio     │
│    Database     │   │      Cache      │   │   (Gemma 3)     │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

### Message Processing Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   WhatsApp   │────▶│ Evolution API│────▶│   Webhook    │
│ (Contractor) │     │              │     │   Handler    │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
┌──────────────────────────────────────────────────────────────┐
│                    Message Processing Pipeline                │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  │
│  │ Language │──▶│  Intent  │──▶│ Contract │──▶│   Spam   │  │
│  │Detection │   │  Classify│   │ Extract  │   │  Filter  │  │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘  │
│        │              │              │              │        │
│        └──────────────┴──────────────┴──────────────┘        │
│                              │                                │
│                    ┌─────────┴─────────┐                     │
│                    ▼                   ▼                     │
│              ┌──────────┐       ┌──────────┐                 │
│              │LM Studio │       │  Redis   │                 │
│              │(Gemma 3) │       │  Cache   │                 │
│              └──────────┘       └──────────┘                 │
└──────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│                       CRM Lookup                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                  │
│  │  Check   │──▶│Playwright│──▶│  Parse   │                  │
│  │  Cache   │   │ D2D Query│   │ Response │                  │
│  └──────────┘   └──────────┘   └──────────┘                  │
└──────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│                    Response Generation                        │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                  │
│  │ Template │──▶│ Bilingual│──▶│  Send    │                  │
│  │  Match   │   │ Render   │   │ Response │                  │
│  └──────────┘   └──────────┘   └──────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

---

## Security

### Authentication & Authorization

- **Magic Link Auth** - Passwordless email-based login (24-hour expiry)
- **JWT Sessions** - Secure token-based sessions with configurable expiry
- **Role-Based Access** - Admin, BO Team, Viewer roles
- **One-Time Tokens** - Magic links are invalidated after use

### API Security

- **HMAC Webhook Verification** - Signature validation for Evolution API
- **Rate Limiting** - Configurable per-endpoint limits
- **Helmet** - Security headers (XSS, CSRF, etc.)
- **CORS** - Configurable origin restrictions
- **Input Validation** - Zod schemas for all inputs

### Infrastructure Security

- **Non-root Docker** - Containers run as unprivileged user
- **Network Isolation** - Internal services on private network
- **Secret Management** - Environment-based configuration
- **Audit Logging** - All actions logged for compliance

### Best Practices

- Use strong JWT secrets (64+ characters)
- Enable HTTPS in production
- Regularly rotate API keys
- Monitor audit logs for anomalies
- Keep dependencies updated

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Run linting (`npm run lint`)
6. Commit changes (`git commit -m 'Add new feature'`)
7. Push to branch (`git push origin feature/new-feature`)
8. Open a Pull Request

### Code Style

- TypeScript strict mode enabled
- ESLint + Prettier for formatting
- Conventional commits recommended

```bash
# Check linting
npm run lint

# Auto-fix issues
npm run lint:fix

# Format code
npm run format
```

### Development Guidelines

- Write tests for new features
- Update documentation for API changes
- Follow existing code patterns
- Keep commits focused and atomic

---

## License

Proprietary - Orange Morocco

---

## Support

For issues and feature requests, please contact the development team or open an issue in the repository.

---

**JARVIS** - Intelligent Contractor Support & Operations Platform
