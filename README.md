# Globrixa B2B Backend

A production-grade REST API for a **B2B Export Marketplace** — connecting international buyers and suppliers through RFQ workflows, product catalogs, real-time messaging, order management, and contracts.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Overview](#api-overview)
- [Authentication](#authentication)
- [Real-time Events](#real-time-events)
- [Database Schema](#database-schema)
- [Security](#security)
- [Logging](#logging)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js >= 18.0.0 |
| Framework | Express.js 4.x |
| Database | PostgreSQL (via `pg` with connection pooling) |
| Cache / Real-time | Redis |
| WebSockets | Socket.IO 4.x |
| Auth | JWT (access + refresh tokens) |
| Password Hashing | bcrypt (12 rounds) |
| Validation | express-validator |
| Rate Limiting | express-rate-limit |
| Security Headers | Helmet |
| Logging | Winston |
| Dev Server | Nodemon |

---

## Architecture

```
Request → Rate Limiter → Auth Middleware → Validation → Route Handler
                                                              ↓
                                                         Service Layer
                                                              ↓
                                                        Model (SQL)
                                                              ↓
                                                         PostgreSQL
```

- **Layered**: Routes → Services → Models → Database
- **Direct SQL**: Raw parameterized queries via `pg` (no ORM)
- **Connection Pooling**: Max 10 connections, 30s idle timeout
- **Transactional**: Multi-step operations use `BEGIN / COMMIT / ROLLBACK`
- **Role-Based Access Control**: Permission middleware per module and action
- **Real-time**: Socket.IO events for live marketplace updates

---

## Features

### Authentication & Sessions
- User registration with buyer / supplier roles
- JWT access tokens (15 min) + refresh tokens (7 days) with rotation
- Session tracking by device and IP
- Secure token hashing (SHA-256) before storage
- Account activation and deactivation

### Company Management
- Multi-user company accounts
- Buyer / Supplier role assignment per company
- Company profiles: legal name, brand, country, city, website, employee count
- Member management (add / remove users)

### Product Catalog
- Supplier-managed product listings
- Categories with attributes and tags
- Multiple product images with sort order
- Variants, specifications, and visibility controls (active / inactive / draft)

### RFQ (Request For Quotation)
- Buyers post RFQs with title, description, category, quantity, unit, budget, deadline, destination
- Suppliers browse and respond to active RFQs
- Suppliers submit quotes with price, delivery time, MOQ, and validity period
- RFQ status lifecycle: `active → closed → cancelled`
- Real-time notifications when new RFQs or quotes arrive

### Order Management
- Convert accepted quotes into purchase orders
- Order status workflow: `confirmed → in_production → shipped → delivered → cancelled`
- Order line items, currency, and delivery deadline tracking
- Role-gated visibility for buyers and suppliers

### Contract Management
- Auto-generated contract numbers (`CTR-YYYY-####`)
- Full contract details: payment terms, incoterms, delivery terms, quality standards, warranty
- Dual signature tracking (buyer + supplier)
- Contract status lifecycle management

### Messaging
- Buyer–Supplier conversations linked to RFQs
- Message read status and unread counts
- Real-time message delivery via Socket.IO
- Admin visibility across all conversations

### Notifications
- System-wide notification management
- Real-time delivery via Socket.IO

### Admin
- Dashboard statistics and analytics
- Company verification and filtering
- User role and permission configuration

---

## Project Structure

```
b2b-backend/
├── config/
│   ├── db.js               # PostgreSQL connection pool
│   └── redis.js            # Redis client setup
├── middleware/
│   ├── auth.js             # JWT verification & RBAC permission checks
│   ├── rateLimit.js        # Rate limiting middleware
│   ├── error.js            # Global error handler
│   └── validate.js         # express-validator helper
├── models/
│   ├── user.js             # User CRUD
│   ├── company.js          # Company management
│   ├── companyUser.js      # Company–User relationships
│   ├── product.js          # Product catalog
│   ├── permission.js       # Role-based permissions
│   └── session.js          # Refresh token / session management
├── routes/
│   ├── auth.js             # POST /auth/login, /register, /refresh, /logout
│   ├── users.js            # User profile endpoints
│   ├── companies.js        # Company CRUD & member management
│   ├── permissions.js      # Role/permission configuration
│   ├── products.js         # Product catalog
│   ├── rfqs.js             # RFQ management
│   ├── quotes.js           # Supplier quote responses
│   ├── orders.js           # Purchase orders
│   ├── contracts.js        # Contract management
│   ├── messages.js         # Conversations & messaging
│   ├── notifications.js    # Notification system
│   ├── stats.js            # Analytics
│   └── admin.js            # Admin operations
├── services/
│   └── authService.js      # Authentication business logic
├── utils/
│   └── logger.js           # Winston logger
├── server.js               # App entry point, Socket.IO setup
├── .env.example            # Environment variable template
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL (SSL-enabled instance recommended)
- Redis

### Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd b2b-backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 4. Start development server
npm run dev

# 5. Start production server
npm start
```

The API will be available at `http://localhost:8000` by default.

**Health check:**
```
GET / → { message: "API version info" }
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
# Server
PORT=8000

# PostgreSQL (SSL required for cloud hosts like Aiven)
DATABASE_URL=postgres://user:password@host:port/dbname?sslmode=require

# Redis (local, Railway, or Upstash)
REDIS_URL=redis://localhost:6379

# JWT — generate with: openssl rand -hex 64
JWT_SECRET=<64-char random hex string>

# CORS — no trailing slash
FRONTEND_URL=http://localhost:5173

# Logging: debug | info | warn | error
LOG_LEVEL=info
```

---

## API Overview

All endpoints are prefixed accordingly. Authenticated routes require a `Bearer` token in the `Authorization` header.

| Router | Base Path | Auth Required |
|---|---|---|
| Auth | `/api/auth` | Partial (login/register are public) |
| Users | `/api/users` | Yes |
| Companies | `/api/companies` | Yes |
| Permissions | `/api/permissions` | Yes (Admin) |
| Products | `/api/products` | Partial |
| RFQs | `/api/rfqs` | Yes |
| Quotes | `/api/quotes` | Yes |
| Orders | `/api/orders` | Yes |
| Contracts | `/api/contracts` | Yes |
| Messages | `/api/messages` | Yes |
| Notifications | `/api/notifications` | Yes |
| Stats | `/api/stats` | Yes |
| Admin | `/api/admin` | Yes (Admin) |

---

## Authentication

The API uses a **dual-token strategy**:

| Token | Expiry | Purpose |
|---|---|---|
| Access Token | 15 minutes | Authenticate API requests |
| Refresh Token | 7 days | Obtain new access tokens |

**Flow:**
1. `POST /api/auth/login` → returns `accessToken` + `refreshToken`
2. Include `Authorization: Bearer <accessToken>` on all protected routes
3. When access token expires, call `POST /api/auth/refresh` with the refresh token
4. On logout, `POST /api/auth/logout` invalidates the session

Refresh tokens are stored hashed (SHA-256) and are rotated on every refresh call.

---

## Real-time Events

The server exposes a Socket.IO endpoint at `/socket.io`.

| Event | Trigger |
|---|---|
| `rfq:new` | A buyer posts a new RFQ |
| `quote:new` | A supplier submits a quote on an RFQ |
| `order:statusUpdated` | An order status changes |
| Message events | A new message is sent in a conversation |

---

## Database Schema

The database uses **PostgreSQL** with raw SQL (no ORM). Key tables:

| Table | Description |
|---|---|
| `users` | User accounts and credentials |
| `roles` | Role definitions (buyer, supplier, admin) |
| `companies` | Company profiles |
| `company_users` | User–company membership |
| `products` | Supplier product listings |
| `categories` | Product categories and attributes |
| `product_images` | Product image URLs with sort order |
| `rfqs` | Buyer RFQ postings |
| `rfq_responses` | Supplier quotes on RFQs |
| `orders` | Purchase orders |
| `order_items` | Line items within orders |
| `contracts` | Trade contracts |
| `conversations` | Buyer–supplier conversations |
| `messages` | Individual messages |
| `permissions` | Role-based access control rules |
| `sessions` | Refresh token records |

Fields use UUIDs for primary keys, `NUMERIC` for prices and quantities, `JSONB` where applicable, and standard `created_at` / `updated_at` timestamps.

> Database migrations are managed externally. The server performs a connectivity health check on startup but does not auto-migrate.

---

## Security

- **Helmet** — Sets secure HTTP response headers
- **CORS** — Restricted to `FRONTEND_URL`
- **Rate Limiting** — Applied globally to all routes
- **bcrypt** — Passwords hashed with 12 salt rounds
- **JWT** — Short-lived access tokens with refresh token rotation
- **Token Hashing** — Refresh tokens are SHA-256 hashed before storage
- **Parameterized Queries** — All SQL uses placeholders, preventing SQL injection
- **RBAC** — Per-route permission checks by module and action

---

## Logging

Logging is powered by **Winston** with multiple transports:

| Transport | Detail |
|---|---|
| Console | Pretty-print in development, JSON in production |
| `logs/error.log` | Error-level logs only |
| `logs/combined.log` | All log levels |

Log level is controlled via the `LOG_LEVEL` environment variable (`debug / info / warn / error`). Custom levels `logger.success()` and `logger.fail()` are available for semantic clarity.

---

## Scripts

```bash
npm run dev    # Start development server with Nodemon (auto-reload)
npm start      # Start production server
```

---

## License

Private — All rights reserved.
