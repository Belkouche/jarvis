-- JARVIS Database Initialization Script
-- This script runs when the PostgreSQL container is first created

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- Create indexes for performance (Prisma will handle most, but these help)
-- Note: Run after Prisma migrations

-- Grant permissions (if using a separate application user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO jarvis_app;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO jarvis_app;

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'JARVIS database initialized at %', NOW();
END $$;
