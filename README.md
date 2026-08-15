# StoreSync - Modern Trade Platform

Phase 1 implementation: Public website and digital foundation.

## Architecture

- **Frontend**: Next.js 16 with TypeScript, Tailwind CSS
- **Backend**: Fastify with TypeScript, PostgreSQL
- **Database**: PostgreSQL with content management schema

## Project Structure

```
storesync/
├── frontend/          # Next.js frontend application
│   ├── src/
│   │   ├── app/       # Next.js App Router pages
│   │   ├── components/ # React components
│   │   └── lib/       # Utility functions
│   └── package.json
├── backend/           # Fastify backend API
│   ├── src/
│   │   ├── routes/    # API route handlers
│   │   ├── database/  # Database schema and connection
│   │   ├── middleware/ # Express middleware
│   │   └── utils/     # Utility functions
│   └── package.json
├── database/          # Database migrations and seeds
└── shared/            # Shared TypeScript types
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm or yarn

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env
```

Edit `.env` with your database connection string and other settings.

4. Run database migrations:
```bash
# Run schema.sql in your PostgreSQL database
psql -U your_user -d storesync -f ../database/schema.sql
```

5. Start development server:
```bash
npm run dev
```

Backend will run on `http://localhost:3001`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm run dev
```

Frontend will run on `http://localhost:3000`

## API Endpoints

### Public API

- `GET /api/health` - Health check
- `GET /api/health/db` - Database health check
- `GET /api/public/pages/:slug` - Get published content page
- `GET /api/public/stores` - Get all published stores
- `GET /api/public/stores/:id` - Get single store
- `GET /api/public/categories` - Get published categories
- `GET /api/public/products` - Get published products
- `GET /api/public/products/:id` - Get single product
- `GET /api/public/offers` - Get current offers
- `GET /api/public/faqs` - Get published FAQs
- `GET /api/public/services` - Get published services
- `POST /api/public/contact` - Submit contact form

### Admin API (Requires JWT authentication)

- `GET /api/admin/pages` - List all pages
- `POST /api/admin/pages` - Create page
- `PUT /api/admin/pages/:id` - Update page
- `GET /api/admin/stores` - List all stores
- `POST /api/admin/stores` - Create store
- `GET /api/admin/products` - List all products
- `POST /api/admin/products` - Create product
- `GET /api/admin/contact` - List contact submissions
- `PATCH /api/admin/contact/:id` - Update contact submission status

## Content Management

The system supports a publication workflow:

- **DRAFT**: Initial state, not visible publicly
- **REVIEW**: Under review
- **PUBLISHED**: Visible publicly
- **SCHEDULED**: Scheduled for future publication
- **UNPUBLISHED**: Previously published, now hidden
- **EXPIRED**: Content past its expiry date

All content changes are logged in the audit trail.

## Bilingual Support

The system supports English and Nepali content:

- Use `?lang=ne` query parameter to request Nepali content
- Default language is English
- Content falls back to English if Nepali version is not available

## Security Features

- Rate limiting on all public endpoints
- Server-side validation with Zod schemas
- No direct database access from frontend
- Safe error responses (no stack traces exposed)
- Helmet.js for security headers
- CORS configuration
- JWT authentication for admin endpoints

## SEO Features

- Dynamic sitemap generation
- Robots.txt configuration
- Open Graph and Twitter Card metadata
- Canonical URLs
- Structured data support

## Accessibility

The frontend is built with WCAG 2.2 AA compliance in mind:

- Semantic HTML
- Proper heading hierarchy
- Keyboard navigation support
- Focus indicators
- Color contrast compliance
- Screen reader friendly
- Responsive design

## Content Placeholders

The following content is currently placeholder and should be updated:

- Store addresses, hours, and contact information
- Product catalog and images
- Offer campaigns
- FAQ content
- About page company information
- Privacy policy and terms of service (legal review required)
- Service descriptions

These should be managed through the admin API once the database is populated.

## Next Steps

1. Set up PostgreSQL database and run schema migrations
2. Configure environment variables for both frontend and backend
3. Populate initial content through admin API
4. Test all public pages and API endpoints
5. Set up deployment pipeline
6. Configure monitoring and error tracking
7. Run accessibility and performance audits
8. Implement automated tests

## Phase 1 Status

- ✅ Project structure and tech stack
- ✅ Backend API with Fastify
- ✅ Database schema for content management
- ✅ Public API endpoints with validation
- ✅ Admin API with authentication
- ✅ Frontend with Next.js
- ✅ All required public pages
- ✅ Product and offer pages
- ✅ Bilingual content architecture
- ✅ SEO features (sitemap, robots, metadata)
- ✅ Security features
- ✅ Health check endpoints
- ⏳ Deployment pipeline configuration
- ⏳ Accessibility audit completion
- ⏳ Automated tests
- ⏳ Content population

## License

ISC
