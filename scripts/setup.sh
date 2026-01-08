#!/bin/bash

# JARVIS Setup Script
# This script sets up the development environment

set -e

echo "🤖 JARVIS Setup Script"
echo "======================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for required tools
check_requirements() {
    echo -e "\n${YELLOW}Checking requirements...${NC}"

    # Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        echo -e "${GREEN}✓${NC} Node.js $NODE_VERSION"
    else
        echo -e "${RED}✗${NC} Node.js not found. Please install Node.js 18+"
        exit 1
    fi

    # npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm -v)
        echo -e "${GREEN}✓${NC} npm $NPM_VERSION"
    else
        echo -e "${RED}✗${NC} npm not found"
        exit 1
    fi

    # Docker (optional)
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version)
        echo -e "${GREEN}✓${NC} $DOCKER_VERSION"
    else
        echo -e "${YELLOW}⚠${NC} Docker not found (optional for development)"
    fi

    # Docker Compose (optional)
    if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
        echo -e "${GREEN}✓${NC} Docker Compose available"
    else
        echo -e "${YELLOW}⚠${NC} Docker Compose not found (optional for development)"
    fi
}

# Setup environment file
setup_env() {
    echo -e "\n${YELLOW}Setting up environment...${NC}"

    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            echo -e "${GREEN}✓${NC} Created .env from .env.example"
            echo -e "${YELLOW}⚠${NC} Please update .env with your actual values"
        else
            echo -e "${RED}✗${NC} .env.example not found"
            exit 1
        fi
    else
        echo -e "${GREEN}✓${NC} .env already exists"
    fi
}

# Install dependencies
install_deps() {
    echo -e "\n${YELLOW}Installing backend dependencies...${NC}"
    npm install

    echo -e "\n${YELLOW}Installing frontend dependencies...${NC}"
    cd frontend && npm install && cd ..

    echo -e "${GREEN}✓${NC} Dependencies installed"
}

# Setup Prisma
setup_prisma() {
    echo -e "\n${YELLOW}Setting up Prisma...${NC}"

    # Generate Prisma client
    npx prisma generate
    echo -e "${GREEN}✓${NC} Prisma client generated"
}

# Setup database (if Docker is available)
setup_database() {
    if command -v docker &> /dev/null; then
        echo -e "\n${YELLOW}Setting up database with Docker...${NC}"

        # Start only database services
        docker-compose up -d postgres redis

        echo -e "${YELLOW}Waiting for database to be ready...${NC}"
        sleep 5

        # Run migrations
        echo -e "${YELLOW}Running database migrations...${NC}"
        npx prisma migrate deploy

        echo -e "${GREEN}✓${NC} Database setup complete"
    else
        echo -e "\n${YELLOW}⚠${NC} Docker not available. Please set up PostgreSQL and Redis manually."
        echo "   - PostgreSQL: localhost:5432"
        echo "   - Redis: localhost:6379"
        echo "   - Update DATABASE_URL and REDIS_URL in .env"
    fi
}

# Install Playwright browsers
setup_playwright() {
    echo -e "\n${YELLOW}Installing Playwright browsers...${NC}"
    npx playwright install chromium
    echo -e "${GREEN}✓${NC} Playwright browsers installed"
}

# Build the project
build_project() {
    echo -e "\n${YELLOW}Building backend...${NC}"
    npm run build

    echo -e "\n${YELLOW}Building frontend...${NC}"
    cd frontend && npm run build && cd ..

    echo -e "${GREEN}✓${NC} Build complete"
}

# Main setup
main() {
    check_requirements
    setup_env
    install_deps
    setup_prisma
    setup_database
    setup_playwright

    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}JARVIS setup complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Update .env with your configuration"
    echo "  2. Run 'npm run dev' to start development server"
    echo "  3. Run 'cd frontend && npm run dev' for frontend"
    echo ""
    echo "Or use Docker:"
    echo "  docker-compose up -d"
    echo ""
}

# Run main function
main "$@"
