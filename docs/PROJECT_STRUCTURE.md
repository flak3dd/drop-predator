# Drop Predator - Project Structure

This document outlines the reorganized file system structure for the Drop Predator project.

## Overview

Drop Predator is now organized as a unified Shopify app with an integrated autonomous product engine. The structure separates concerns while maintaining clear integration points.

## Directory Structure

```
drop-predator/
├── app/                          # Main Shopify application
│   ├── components/              # Reusable UI components
│   ├── routes/                  # React Router routes/pages
│   │   ├── _index/             # Landing page
│   │   ├── auth/               # Authentication routes
│   │   ├── api/                # API endpoints
│   │   │   ├── engine.jsx      # Engine API
│   │   │   └── drops.jsx       # Drops API
│   │   ├── app/                # Main app routes
│   │   │   ├── _index.jsx     # Dashboard
│   │   │   ├── engine.jsx      # Engine interface
│   │   │   ├── drops/          # Drop management
│   │   │   └── settings.jsx    # App settings
│   │   └── webhooks/           # Shopify webhooks
│   ├── services/               # Business logic
│   │   └── engine/            # Engine services (integrated)
│   │       ├── pipeline.js    # Orchestration
│   │       ├── scout.js       # Product sourcing
│   │       ├── negotiate.js    # Supplier negotiation
│   │       ├── price.js       # Dynamic pricing
│   │       ├── importer.js    # Shopify import
│   │       └── listing-generator.js
│   ├── lib/                    # Shared utilities
│   ├── hooks/                  # Custom React hooks
│   ├── styles/                 # Global styles
│   ├── db.server.js           # Database connection
│   ├── entry.server.jsx       # Server entry point
│   ├── root.jsx               # App root component
│   ├── routes.js              # Route configuration
│   └── shopify.server.js      # Shopify authentication
├── engine/                     # Autonomous product engine
│   ├── services/              # Engine-specific services
│   ├── data/                  # Engine data & catalogs
│   │   └── products.js        # Product catalogs
│   ├── workflows/             # Automation workflows
│   ├── server.js              # Standalone server (optional)
│   ├── index.html             # Standalone UI (optional)
│   └── .vibecheck/            # VibeCheck configuration
├── shared/                     # Shared utilities
│   ├── types/                 # TypeScript definitions
│   ├── utils/                 # Utility functions
│   └── constants/            # Shared constants
├── prisma/                     # Database layer
│   ├── schema.prisma          # Database schema
│   ├── migrations/            # Database migrations
│   └── dev.sqlite             # SQLite database (dev)
├── extensions/                 # Shopify app extensions
│   └── admin-action/          # Admin panel extensions
├── tests/                      # Test suite
│   ├── unit/                  # Unit tests
│   │   └── models.test.js
│   ├── integration/           # Integration tests
│   │   ├── api.drops.test.js
│   │   ├── webhooks.test.js
│   │   ├── dashboard.test.js
│   │   ├── drops.*.test.js
│   │   └── settings.test.js
│   ├── e2e/                   # End-to-end tests
│   └── setup.js               # Test configuration
├── scripts/                    # Utility scripts
│   └── crawl/                 # Web crawling utilities
├── docs/                       # Documentation
│   └── PROJECT_STRUCTURE.md  # This file
├── public/                     # Static assets
├── build/                      # Build output
├── node_modules/               # Dependencies
└── Configuration files        # Package.json, etc.
```

## Key Changes from Original Structure

### Renamed Directories
- `dropshipper/` → `engine/` (better semantic naming)
- `crawl/` → `scripts/crawl/` (utilities organization)

### Reorganized Tests
- Tests now separated by type: `unit/`, `integration/`, `e2e/`
- Better test organization and maintainability

### New Directories
- `app/components/` - Reusable UI components
- `app/lib/` - Shared utilities for the app
- `app/hooks/` - Custom React hooks
- `app/styles/` - Global styling
- `shared/` - Code shared between app and engine
- `docs/` - Project documentation
- `scripts/` - Utility and build scripts

### Data Movement
- `app/data/products.js` → `engine/data/products.js`
- Product catalogs now reside with the engine that uses them

## Integration Points

### Engine Integration
- Engine services are in `app/services/engine/`
- Engine data is in `engine/data/`
- Import paths updated to reflect new structure
- API endpoints in `app/routes/api.engine.jsx`

### Database Layer
- Unified Prisma schema with engine models
- Single database for app and engine data
- Models: `Session`, `Drop`, `DropProduct`, `Setting`, `EngineRun`, `EngineProduct`, `ProductListing`

### Shopify Integration
- Standard Shopify app structure maintained
- Extensions in `extensions/`
- Webhooks in `app/routes/webhooks/`
- Authentication via `shopify.server.js`

## Development Workflow

### Running the App
```bash
npm run dev          # Start Shopify app development
npm run build        # Build for production
npm run test         # Run tests
```

### Engine Development
- Engine services are integrated into the app
- Can be tested via the Engine UI at `/app/engine`
- Standalone engine still available in `engine/` directory

### Testing
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

### Database
```bash
npx prisma generate   # Generate Prisma client
npx prisma migrate dev # Create migration
npx prisma studio     # Open Prisma Studio
```

## Benefits of New Structure

1. **Clear Separation of Concerns**: App, engine, and shared code are properly separated
2. **Better Organization**: Tests, utilities, and components have dedicated homes
3. **Scalability**: Easy to add new features without cluttering root directory
4. **Maintainability**: Logical grouping makes code easier to find and modify
5. **Integration**: Clear integration points between app and engine
6. **Testing**: Organized test structure for different test types

## Migration Notes

If you have existing code referencing the old structure:
- Update `dropshipper` references to `engine`
- Update `app/data/products.js` imports to `engine/data/products.js`
- Update test import paths if moving test files
- Check for any hardcoded paths in configuration files

## Future Enhancements

Potential areas for further organization:
- Add `app/lib/validators/` for form validation
- Add `app/lib/api/` for API client utilities
- Add `shared/middleware/` for Express middleware
- Add `docs/api/` for API documentation
- Add `docs/deployment/` for deployment guides
