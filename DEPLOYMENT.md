# JARVIS Deployment Guide

This guide covers deployment of JARVIS to production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Development Setup](#development-setup)
4. [Production Deployment](#production-deployment)
5. [Configuration](#configuration)
6. [Monitoring & Operations](#monitoring--operations)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js** 18+ (LTS recommended)
- **Docker** 20.10+ and Docker Compose v2
- **PostgreSQL** 15+ (if not using Docker)
- **Redis** 7+ (if not using Docker)
- **LM Studio** with Gemma 3 12B model

### External Services

- **Evolution API** - WhatsApp integration
- **Resend** - Email delivery for magic links
- **Orange D2D Portal** access - CRM lookup
- **Orange API** (optional) - Ticket escalation

---

## Architecture Overview

```
                    ┌─────────────┐
                    │   Nginx     │
                    │  (Reverse   │
                    │   Proxy)    │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │   Frontend  │ │   API       │ │   API       │
    │  Dashboard  │ │  Server 1   │ │  Server 2   │
    └─────────────┘ └──────┬──────┘ └──────┬──────┘
                           │               │
                    ┌──────┴───────────────┘
                    │
           ┌────────┴────────┐
           │                 │
           ▼                 ▼
    ┌─────────────┐   ┌─────────────┐
    │ PostgreSQL  │   │    Redis    │
    │  Database   │   │    Cache    │
    └─────────────┘   └─────────────┘
```

---

## Development Setup

### Quick Start

```bash
# Clone the repository
git clone https://github.com/tktm/jarvis.git
cd jarvis

# Run setup script
./scripts/setup.sh

# Start development servers
npm run dev              # Backend (port 3000)
cd frontend && npm run dev  # Frontend (port 3001)
```

### Manual Setup

1. **Install dependencies:**
   ```bash
   npm install
   cd frontend && npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Start databases:**
   ```bash
   docker-compose up -d postgres redis
   ```

4. **Run migrations:**
   ```bash
   npx prisma migrate deploy
   ```

5. **Start the application:**
   ```bash
   npm run dev
   ```

---

## Production Deployment

### Using Docker Compose

1. **Prepare environment:**
   ```bash
   cp .env.prod.example .env.prod
   # Edit .env.prod with production values
   source .env.prod
   ```

2. **Deploy:**
   ```bash
   ./scripts/deploy.sh
   ```

### Manual Deployment

1. **Build the application:**
   ```bash
   npm run build
   cd frontend && npm run build
   ```

2. **Set up SSL certificates:**
   ```bash
   mkdir -p nginx/ssl
   # Copy your certificates to nginx/ssl/
   # - fullchain.pem
   # - privkey.pem
   ```

3. **Start services:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Scaling

To scale API servers:

```bash
docker-compose -f docker-compose.prod.yml up -d --scale api=3
```

### Rolling Updates

The deployment script handles rolling updates automatically:

```bash
./scripts/deploy.sh
```

For manual updates:

```bash
# Build new images
docker-compose -f docker-compose.prod.yml build

# Update services one at a time
docker-compose -f docker-compose.prod.yml up -d --no-deps --scale api=2 api
```

---

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `JWT_SECRET` | Secret for JWT tokens (min 64 chars) | Yes |
| `EVOLUTION_API_URL` | Evolution API endpoint | Yes |
| `EVOLUTION_API_KEY` | Evolution API key | Yes |
| `LM_STUDIO_URL` | LM Studio API endpoint | Yes |
| `D2D_PORTAL_URL` | D2D Portal URL | Yes |
| `D2D_USERNAME` | D2D Portal username | Yes |
| `D2D_PASSWORD` | D2D Portal password | Yes |
| `RESEND_API_KEY` | Resend API key for emails | Yes |
| `ADMIN_EMAILS` | Comma-separated admin emails | No |
| `ORANGE_API_URL` | Orange ticket API | No |
| `ORANGE_API_KEY` | Orange API key | No |

### LM Studio Setup

1. Install LM Studio and download Gemma 3 12B model
2. Start LM Studio server on port 5000
3. Configure `LM_STUDIO_URL=http://localhost:5000`

### Evolution API Setup

1. Deploy Evolution API instance
2. Create WhatsApp instance
3. Configure webhook URL: `https://your-domain.com/api/webhook/message`

---

## Monitoring & Operations

### Health Checks

- **Application:** `GET /health`
- **Ready check:** `GET /health/ready`

Example health check response:
```json
{
  "status": "healthy",
  "services": {
    "database": "ok",
    "redis": "ok",
    "lmStudio": "ok"
  },
  "uptime": 3600
}
```

### Logs

View logs:
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f api

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100 api
```

### Database Backups

Automatic backup during deployment. Manual backup:

```bash
docker exec jarvis-postgres pg_dump -U jarvis jarvis_db > backup.sql
```

Restore:
```bash
cat backup.sql | docker exec -i jarvis-postgres psql -U jarvis jarvis_db
```

### Redis Management

```bash
# Connect to Redis
docker exec -it jarvis-redis redis-cli -a $REDIS_PASSWORD

# Clear cache
docker exec jarvis-redis redis-cli -a $REDIS_PASSWORD FLUSHDB
```

---

## Troubleshooting

### Common Issues

#### API not responding

1. Check container status:
   ```bash
   docker-compose -f docker-compose.prod.yml ps
   ```

2. Check logs:
   ```bash
   docker-compose -f docker-compose.prod.yml logs api
   ```

3. Verify health:
   ```bash
   curl http://localhost:3000/health
   ```

#### Database connection errors

1. Verify PostgreSQL is running:
   ```bash
   docker exec jarvis-postgres pg_isready
   ```

2. Check connection string in environment

3. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

#### LM Studio timeout

1. Check LM Studio is running
2. Verify URL is accessible from container:
   ```bash
   docker exec jarvis-api wget -q -O - http://host.docker.internal:5000/health
   ```

3. Increase timeout:
   ```bash
   LM_STUDIO_TIMEOUT=15000
   ```

#### Playwright/CRM errors

1. Ensure Chromium is installed in container
2. Check D2D Portal credentials
3. Verify headless browser works:
   ```bash
   docker exec jarvis-api npx playwright install chromium
   ```

### Rollback

If deployment fails:

```bash
./scripts/deploy.sh --rollback
```

Or manually:

```bash
docker-compose -f docker-compose.prod.yml down
# Restore from backup
docker-compose -f docker-compose.prod.yml up -d
```

---

## Security Considerations

1. **Never commit secrets** - Use environment variables
2. **Use HTTPS** - Configure SSL in nginx
3. **Rotate JWT secrets** periodically
4. **Keep dependencies updated** - Run `npm audit` regularly
5. **Restrict database access** - Use internal network only
6. **Enable rate limiting** - Already configured in nginx

---

## Support

For issues and questions:
- Create an issue in the repository
- Contact: jarvis@tktm.ma
