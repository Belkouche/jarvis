# JARVIS

**TKTM Orange Contractor Support & Operations Platform**

A WhatsApp-based intelligent assistant system for Orange Morocco field contractors, featuring AI-powered message analysis, CRM integration, complaint management, and a real-time admin dashboard.

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
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

## Overview

JARVIS enables Orange Morocco contractors to check contract status and file complaints via WhatsApp. The platform processes messages using a local LLM (Gemma 3 12B via LM Studio), queries the D2D Portal CRM via browser automation, and delivers bilingual responses (French/Arabic).

### Key Capabilities

- **WhatsApp Integration**: Receive and respond to contractor messages via Evolution API
- **AI-Powered Analysis**: Intent detection, language recognition, and contract extraction using LM Studio
- **CRM Automation**: Playwright-based D2D Portal scraping for real-time contract status
- **Complaint Management**: End-to-end workflow with escalation to Orange
- **Admin Dashboard**: Real-time analytics, message history, and complaint tracking
- **Passwordless Auth**: Magic link authentication for secure admin access

## Features

### Message Processing Pipeline

1. **Incoming Message Reception** - WhatsApp messages via Evolution API webhook
2. **AI Analysis** - Language detection (FR/AR/Darija/EN), intent classification, contract extraction
3. **CRM Lookup** - Automated D2D Portal query with Redis caching
4. **Response Generation** - Template-based bilingual messages (French + Arabic)
5. **Delivery Tracking** - Message status monitoring and latency logging

### Complaint Management

- 8 complaint types: Installation delay, Contract cancellation, Wrong contact, Wrong address, Blocked case, Second contract, Appointment, Other
- Priority levels: Low, Medium, High, Critical
- Status workflow: Open → Assigned → Escalated → Resolved
- Orange ticket escalation with status synchronization

### Admin Dashboard

- Real-time analytics and statistics
- Message history with advanced filtering
- Complaint management interface
- CSV/JSON data export
- WebSocket-powered live notifications

## Technology Stack

### Backend

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20 |
| Language | TypeScript 5.3 |
| Framework | Express.js 4.18 |
| Database | PostgreSQL 15 |
| ORM | Prisma 5.8 |
| Cache | Redis 7 |
| Real-time | Socket.IO 4.7 |
| AI | LM Studio (Gemma 3 12B) |
| Browser Automation | Playwright 1.41 |
| Email | Resend API |
| Validation | Zod |
| Logging | Winston |

### Frontend

| Component | Technology |
|-----------|------------|
| Framework | React 18 |
| Bundler | Vite 5 |
| Styling | TailwindCSS 3.4 |
| Routing | React Router 6 |
| State | Zustand |
| Data Fetching | TanStack Query 5 |
| Charts | Recharts |

## Project Structure

```
Jarvis/
├── src/                      # Backend source code
│   ├── app.ts               # Express app & WebSocket setup
│   ├── config/              # Configuration modules
│   ├── controllers/         # Request handlers
│   ├── middleware/          # Express middleware
│   ├── routes/              # API route definitions
│   ├── services/            # Business logic
│   ├── types/               # TypeScript definitions
│   └── utils/               # Utility functions
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── pages/           # Page components
│   │   ├── components/      # Reusable components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── services/        # API client
│   │   ├── stores/          # Zustand stores
│   │   └── types/           # Frontend types
│   └── vite.config.ts
├── prisma/                   # Database schema & migrations
│   └── schema.prisma
├── tests/                    # Test suite
│   ├── unit/
│   ├── integration/
│   └── load/
├── docker-compose.yml        # Development environment
├── docker-compose.prod.yml   # Production environment
├── Dockerfile               # Multi-stage build
└── DEPLOYMENT.md            # Deployment guide
```

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- LM Studio (with Gemma 3 12B model)

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
npm run db:generate
npm run db:push
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
- Start local server on port 5000

### Docker Development

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

## Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://jarvis:password@localhost:5432/jarvis_db
REDIS_URL=redis://localhost:6379/0

# LM Studio
LM_STUDIO_URL=http://localhost:5000
LM_STUDIO_TIMEOUT=10000

# Evolution API (WhatsApp)
EVOLUTION_API_URL=https://evo.example.com
EVOLUTION_API_KEY=your_api_key
EVOLUTION_WEBHOOK_SECRET=your_webhook_secret

# Email (Resend)
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=noreply@example.com

# Authentication
SESSION_SECRET=generate_secure_random_string
JWT_SECRET=generate_secure_random_string
JWT_EXPIRY=86400

# D2D Portal (CRM)
D2D_PORTAL_URL=https://d2d.orange.ma
D2D_USERNAME=bot_username
D2D_PASSWORD=bot_password

# Dashboard
DASHBOARD_URL=https://admin.example.com
```

See `.env.example` for all configuration options.

## API Reference

### Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhook/message` | Receive WhatsApp messages |
| POST | `/api/webhook/status` | Message delivery status |
| GET | `/api/webhook/health` | Webhook health check |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/magic-link/request` | Request magic link |
| GET | `/api/auth/magic-link/verify` | Verify token |
| POST | `/api/auth/logout` | End session |
| GET | `/api/auth/me` | Get current user |

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/messages` | List messages (paginated) |
| GET | `/api/dashboard/messages/:id` | Message details |
| GET | `/api/dashboard/stats` | Statistics |
| GET | `/api/dashboard/export` | Export data (CSV/JSON) |

### Complaints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/complaints` | List complaints |
| GET | `/api/complaints/:id` | Complaint details |
| PATCH | `/api/complaints/:id/status` | Update status |
| POST | `/api/complaints/:id/assign` | Assign to user |
| POST | `/api/complaints/:id/notes` | Add notes |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Application health |
| GET | `/health/ready` | Readiness check |

## Database Schema

### Core Models

- **Message** - WhatsApp messages with analysis results
- **Complaint** - Filed complaints with workflow status
- **Ticket** - Orange escalation tickets
- **MagicLink** - Passwordless auth tokens
- **Session** - User sessions
- **AuditLog** - Compliance audit trail
- **MessageTemplate** - Bilingual response templates
- **AdminUser** - Dashboard users

### Schema Diagram

```
Message ────────┬──── Complaint ──── Ticket
                │          │
                │          └──── AdminUser
                │
MessageTemplate │
                │
AuditLog        │
                │
MagicLink ──────┴──── Session
```

Run migrations:

```bash
npx prisma migrate dev    # Development
npx prisma migrate deploy # Production
```

## Testing

### Run Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage
npm run test:coverage
```

### Test Structure

- **Unit Tests** - Service and utility function tests
- **Integration Tests** - API endpoint and workflow tests
- **Load Tests** - Concurrency and performance tests

## Deployment

### Production with Docker Compose

```bash
# Configure production environment
cp .env.prod.example .env.prod
source .env.prod

# Build and deploy
docker-compose -f docker-compose.prod.yml up -d

# Scale API servers
docker-compose -f docker-compose.prod.yml up -d --scale api=3
```

### Database Backup

```bash
# Backup
docker exec jarvis-postgres pg_dump -U jarvis jarvis_db > backup.sql

# Restore
cat backup.sql | docker exec -i jarvis-postgres psql -U jarvis jarvis_db
```

### Health Monitoring

```bash
# Application health
curl http://localhost:3000/health

# Readiness check
curl http://localhost:3000/health/ready
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment instructions.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Nginx (SSL/Proxy)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer                            │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   API Server  │    │   API Server  │    │   API Server  │
│   (Node.js)   │    │   (Node.js)   │    │   (Node.js)   │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  PostgreSQL   │    │     Redis     │    │   LM Studio   │
│   Database    │    │     Cache     │    │   (AI/LLM)    │
└───────────────┘    └───────────────┘    └───────────────┘
```

### Message Flow

```
WhatsApp → Evolution API → Webhook → AI Analysis → CRM Lookup → Response → WhatsApp
                                          ↓              ↓
                                     LM Studio     D2D Portal
                                     (Gemma 3)    (Playwright)
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit changes (`git commit -m 'Add new feature'`)
4. Push to branch (`git push origin feature/new-feature`)
5. Open a Pull Request

### Code Style

- TypeScript strict mode
- ESLint + Prettier formatting
- Conventional commits

```bash
npm run lint        # Check linting
npm run lint:fix    # Auto-fix issues
npm run format      # Format code
```

## License

Proprietary - TKTM Orange Morocco

---

**JARVIS** - Intelligent Contractor Support Platform
