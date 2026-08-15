# ConsultNow Backend API

![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)
![Express](https://img.shields.io/badge/Express-v5-blue.svg)
![Prisma](https://img.shields.io/badge/Prisma-v7.8-indigo.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue.svg)
![Socket.IO](https://img.shields.io/badge/Socket.IO-Realtime-black.svg)
![Gemini AI](https://img.shields.io/badge/Google%20Gemini-AI%20Powered-orange.svg)

The **ConsultNow Backend** is a high-performance RESTful API and real-time communication server built for the ConsultNow 1-on-1 Expert Advisory & Mentorship platform. It powers expert discovery, AI problem matching, multi-currency payment processing (INR & USD), real-time messaging, affiliate referral tracking, and programmatic SEO.

---

## 🚀 System Architecture & Key Features

### 1. 🌟 Expert Discovery & Featured Mentors
- **Experience-Based Ranking**: Queries automatically sort mentors by `yearsExperience` descending, placing top-tier experienced professionals at index 0 as **⭐ Featured Mentors** in each category.
- **Category Grouping**: Supports endpoint filtering and grouping (`GET /api/experts?groupBy=subjectExpertise`).
- **Detailed Expert Metrics**: Aggregates verified total earnings, completed sessions count, and client feedback ratings.

### 2. 🤖 AI-Powered Smart Matcher & AI Twins (Google Gemini)
- **Natural Language Triage**: Powered by `@google/generative-ai` (Gemini API) to triage client inquiries and match them with appropriate categories (*IT Career Guidance*, *HR Services*, *Student Tutoring Services*).
- **Emergency / High-Risk Guardrails**: Automatically detects crisis/emergency keywords and issues safety disclaimers.
- **AI Expert Summarizer**: Generates dynamic summaries explaining why a specific mentor matches the user's inquiry.

### 3. 💳 Multi-Currency & Payment Processing (Razorpay & PayPal)
- **Razorpay Order Creation**: Secure order generation and webhook signature verification (`HMAC-SHA256`).
- **Dynamic Currency Switching**: Native support for **INR (₹)** and **USD ($)** transactions with automatic currency rate conversion.
- **Transaction Logs**: Tracks transaction status (`CREATED`, `PAID`, `FAILED`) and handles referral commissions automatically upon payment completion.

### 4. ⚡ Real-Time Chat Infrastructure (Socket.io)
- **Instant Messaging**: Real-time room-based WebSocket chat between clients and mentors.
- **Live Status & Notifications**: Emits online status updates and message delivery confirmations.

### 5. 👥 Affiliate & Referral Program
- **Referral Tracking**: Unique referral codes for experts and users.
- **Automated Commission Distribution**: Calculates and credits referral earnings (`ReferralLog`) upon successful paid bookings.
- **Affiliate Balance Dashboard**: Tracks total referrals, balance, and payout logs.

### 6. 🔍 Programmatic SEO & Dynamic Metadata
- **Dynamic Sitemap & Robots**: Root endpoints `/sitemap.xml` and `/robots.txt` for search engine crawling.
- **SEO Slugs & Profile Routes**: Pre-generated SEO metadata, custom service descriptions, and FAQs per expert (`/api/seo/expert/:slug`).

### 7. ✉️ Email Notifications & Calendar Integration
- **Transactional Emails**: Powered by `Nodemailer` for expert registration notifications and booking confirmation alerts.
- **Google Calendar API**: Automatic scheduling and video meet link generation.

---

## 🗄️ Database Schema & Models (Prisma ORM)

The backend utilizes **Prisma ORM** with **PostgreSQL**. Key database models include:

| Model | Description |
| :--- | :--- |
| `Expert` | Stores mentor credentials, experience, hourly rate, currency, status (`APPROVED`, `PENDING`), bio, and SEO metadata. |
| `User` | Stores client account details, timezone, and affiliate referral information. |
| `Booking` | Stores 1-on-1 consultation sessions, schedule times, meeting links, status, and synopses. |
| `Transaction` | Records payment orders, Razorpay payment signatures, subunit amounts, and payment status. |
| `ReferralLog` | Logs earned affiliate commissions and payout statuses. |
| `Feedback` | Client star ratings (1–5 stars), comments, and extracted keyword bubbles. |

---

## 📋 API Endpoints Reference

### 🔐 Auth Routes (`/api/auth`)
- `POST /api/auth/register` - Register a new expert profile (status defaults to `PENDING`).
- `POST /api/auth/login` - Authenticate expert credentials and return JWT token.
- `POST /api/auth/reset-password` - Reset expert password securely.

### 👨‍🏫 Expert Routes (`/api/experts`)
- `GET /api/experts` - Fetch available experts (supports `groupBy=subjectExpertise`, sorted by `yearsExperience` desc).
- `GET /api/experts/:id` - Fetch detailed expert profile with aggregate ratings, sessions, and earnings.
- `PUT /api/experts/:id` - Update expert bio, marketing snippet, or hourly rate (Auth required).

### 📅 Booking Routes (`/api/bookings`)
- `POST /api/bookings` - Create a new consultation session booking.
- `GET /api/bookings/expert/:expertId` - Retrieve bookings associated with an expert.
- `PUT /api/bookings/:id/status` - Update session status (`ACCEPTED`, `COMPLETED`, `CANCELLED`).

### 💳 Payment Routes (`/api/payment`)
- `POST /api/payment/create-order` - Generate Razorpay order for booking.
- `POST /api/payment/verify` - Verify Razorpay payment signature and complete transaction.

### 🤖 AI Routes (`/api/ai`)
- `POST /api/ai/triage` - Triage user inquiry and return recommended category using Gemini AI.
- `POST /api/ai/summarize-experts` - Generate custom mentor recommendation snippets based on prompt.

### 🔗 Affiliate Routes (`/api/affiliate`)
- `GET /api/affiliate/stats/:userId` - Fetch referral counts, earnings, and log history.

### 🌟 Feedback Routes (`/api/feedback`)
- `POST /api/feedback` - Submit client feedback rating and comment.
- `GET /api/feedback/expert/:expertId` - Fetch all feedback reviews for an expert.

### 🌐 SEO Routes (`/api/seo` & root)
- `GET /sitemap.xml` - Generate dynamic XML sitemap for SEO crawlers.
- `GET /robots.txt` - Serve search engine robot rules.
- `GET /api/seo/expert/:slug` - Fetch expert SEO metadata by slug.

---

## ⚙️ Environment Variables Configuration

Create a `.env` file in the root of `consultnow-backend`:

```env
# Database Connection (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/consultnow_db?schema=public"

# Application Port
PORT=3000

# JSON Web Token Secret
JWT_SECRET="your_jwt_secret_key_here"

# Google Gemini AI API Key
GEMINI_API_KEY="your_gemini_api_key"

# Razorpay Credentials
RAZORPAY_KEY_ID="rzp_test_xxxxxx"
RAZORPAY_KEY_SECRET="your_razorpay_secret"

# Email SMTP Settings (Nodemailer)
EMAIL_SERVICE="gmail"
EMAIL_USER="no-reply@consultnow.in"
EMAIL_PASS="your_email_app_password"

# Optional Redis Cache
REDIS_URL="redis://localhost:6379"
```

---

## 🛠️ Getting Started & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Migration & Seed
```bash
# Run Prisma migrations to set up PostgreSQL tables
npm run prisma:migrate

# Seed initial categories and experienced mentor profiles
npx prisma db seed
```

### 3. Run Development Server
```bash
npm run dev
```
The server will start on `http://localhost:3000` (or `PORT` specified in `.env`).

### 4. Run Unit Tests
```bash
npm test
```

---

## 📄 License

This project is licensed under the ISC License.
