#!/bin/bash

# JARVIS Production Deployment Script
# This script deploys JARVIS to production

set -e

echo "🚀 JARVIS Deployment Script"
echo "============================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
DEPLOY_ENV=${DEPLOY_ENV:-production}
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="./backups"

# Ensure we're in the project root
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}Error: $COMPOSE_FILE not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Check required environment variables
check_env() {
    echo -e "\n${YELLOW}Checking environment variables...${NC}"

    REQUIRED_VARS=(
        "DB_PASSWORD"
        "REDIS_PASSWORD"
        "JWT_SECRET"
        "EVOLUTION_API_URL"
        "EVOLUTION_API_KEY"
    )

    MISSING=0
    for VAR in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!VAR}" ]; then
            echo -e "${RED}✗${NC} $VAR is not set"
            MISSING=1
        else
            echo -e "${GREEN}✓${NC} $VAR is set"
        fi
    done

    if [ $MISSING -eq 1 ]; then
        echo -e "\n${RED}Please set all required environment variables${NC}"
        echo "You can use: source .env.prod"
        exit 1
    fi
}

# Backup database before deployment
backup_database() {
    echo -e "\n${YELLOW}Backing up database...${NC}"

    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/jarvis_db_$TIMESTAMP.sql"

    # Check if postgres container is running
    if docker ps | grep -q jarvis-postgres; then
        docker exec jarvis-postgres pg_dump -U "${DB_USER:-jarvis}" "${DB_NAME:-jarvis_db}" > "$BACKUP_FILE"
        gzip "$BACKUP_FILE"
        echo -e "${GREEN}✓${NC} Database backed up to ${BACKUP_FILE}.gz"
    else
        echo -e "${YELLOW}⚠${NC} Database container not running, skipping backup"
    fi
}

# Pull latest images
pull_images() {
    echo -e "\n${YELLOW}Pulling latest images...${NC}"
    docker-compose -f "$COMPOSE_FILE" pull
    echo -e "${GREEN}✓${NC} Images pulled"
}

# Build custom images
build_images() {
    echo -e "\n${YELLOW}Building custom images...${NC}"
    docker-compose -f "$COMPOSE_FILE" build --no-cache
    echo -e "${GREEN}✓${NC} Images built"
}

# Run database migrations
run_migrations() {
    echo -e "\n${YELLOW}Running database migrations...${NC}"

    # Start database first
    docker-compose -f "$COMPOSE_FILE" up -d postgres

    # Wait for database
    echo "Waiting for database..."
    sleep 10

    # Run migrations using a temporary container
    docker-compose -f "$COMPOSE_FILE" run --rm api npx prisma migrate deploy

    echo -e "${GREEN}✓${NC} Migrations complete"
}

# Deploy services
deploy_services() {
    echo -e "\n${YELLOW}Deploying services...${NC}"

    # Deploy with rolling update
    docker-compose -f "$COMPOSE_FILE" up -d --remove-orphans

    echo -e "${GREEN}✓${NC} Services deployed"
}

# Health check
health_check() {
    echo -e "\n${YELLOW}Running health checks...${NC}"

    # Wait for services to start
    sleep 10

    # Check API health
    MAX_ATTEMPTS=30
    ATTEMPT=0

    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        if curl -s http://localhost/health | grep -q "healthy"; then
            echo -e "${GREEN}✓${NC} API is healthy"
            return 0
        fi
        ATTEMPT=$((ATTEMPT + 1))
        echo "Waiting for API... (attempt $ATTEMPT/$MAX_ATTEMPTS)"
        sleep 2
    done

    echo -e "${RED}✗${NC} API health check failed"
    return 1
}

# Cleanup old images
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"

    # Remove unused images
    docker image prune -f

    # Remove old backups (keep last 7)
    if [ -d "$BACKUP_DIR" ]; then
        ls -t "$BACKUP_DIR"/*.gz 2>/dev/null | tail -n +8 | xargs -r rm
    fi

    echo -e "${GREEN}✓${NC} Cleanup complete"
}

# Rollback function
rollback() {
    echo -e "\n${RED}Rolling back deployment...${NC}"

    docker-compose -f "$COMPOSE_FILE" down

    # Restore from latest backup
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.gz 2>/dev/null | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        echo "Restoring from $LATEST_BACKUP"
        gunzip -c "$LATEST_BACKUP" | docker exec -i jarvis-postgres psql -U "${DB_USER:-jarvis}" "${DB_NAME:-jarvis_db}"
    fi

    echo -e "${YELLOW}Rollback complete. Please investigate the issue.${NC}"
    exit 1
}

# Main deployment
main() {
    echo "Environment: $DEPLOY_ENV"
    echo "Compose file: $COMPOSE_FILE"
    echo ""

    # Trap errors for rollback
    trap rollback ERR

    check_env
    backup_database
    pull_images
    build_images
    run_migrations
    deploy_services

    if health_check; then
        cleanup
        echo -e "\n${GREEN}========================================${NC}"
        echo -e "${GREEN}Deployment successful!${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        echo "Services:"
        docker-compose -f "$COMPOSE_FILE" ps
    else
        rollback
    fi
}

# Parse arguments
case "$1" in
    --build-only)
        build_images
        ;;
    --migrate-only)
        run_migrations
        ;;
    --rollback)
        rollback
        ;;
    *)
        main
        ;;
esac
