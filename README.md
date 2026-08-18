# AI CreatorHub

AI CreatorHub is a full-stack, AI-powered content management platform designed for modern creators. It enables users to generate, manage, and optimize their content seamlessly using Google's advanced Gemini AI. The platform features robust authentication, an administrative dashboard, secure AI interactions, and comprehensive testing infrastructure.

---

## 🌟 Features

- **AI Content Generation**: Leverages Google Gemini API for intelligent text generation, assisted writing, and creative ideation.
- **Robust Security & Prompt Defense**: Built-in mechanisms to detect and block prompt injection attempts, ensuring safe interactions with the LLM.
- **Secure Authentication**: End-to-end JWT-based authentication with secure password hashing (bcrypt).
- **Role-Based Access Control (RBAC)**: Distinct permissions for standard users and administrators, including a secure Admin portal.
- **Content Management**: Create, read, update, and delete (CRUD) operations for creative content with seamless MongoDB integration.
- **Responsive UI**: A modern, mobile-friendly interface built with React, Tailwind CSS, and Framer Motion.
- **Comprehensive Testing**: Automated unit and API integration testing suite ensuring platform stability.

---

## 🛠️ Technology Stack

**Frontend**
- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- Framer Motion
- React Router DOM
- Axios

**Backend**
- Node.js
- Express.js
- MongoDB & Mongoose
- Google Gemini API (`@google/genai`)
- JWT & bcryptjs
- Zod (Input Validation)
- Helmet & Express Rate Limit (Security)

**Testing**
- Vitest
- Supertest
- MongoDB Memory Server

---

## 📐 Architecture Overview

The application follows a traditional MERN-stack pattern augmented with AI capabilities:
- **Frontend**: A React SPA (Single Page Application) built with Vite. It handles routing, state management, and user interactions.
- **Backend**: An Express.js REST API providing secure endpoints for authentication, content management, media uploads, and AI processing.
- **Database**: MongoDB serves as the primary data store, utilizing Mongoose for schema validation, aggregation, and querying.
- **AI Layer**: Integrates with the Google Gemini API to process prompts and return generative content, mediated by strict backend prompt-defense sanitization.

---

## 📁 Project Structure

```text
ai-creatorhub/
├── src/                 # Frontend React application
│   ├── components/      # Reusable UI components
│   ├── context/         # React Context (Auth)
│   ├── pages/           # Route views (Dashboard, AI Assistant, etc.)
│   └── services/        # API client configuration
├── server/              # Backend Express application
│   ├── controllers/     # Route business logic
│   ├── middleware/      # Auth, security, and error handlers
│   ├── models/          # Mongoose database schemas
│   ├── routes/          # API route definitions
│   ├── services/        # External services (Gemini AI tools)
│   ├── tests/           # Unit and API integration tests
│   ├── utils/           # Helper functions (Prompt Defense)
│   └── validators/      # Zod validation schemas
├── uploads/             # Media upload directory
├── server.ts            # Backend application entry point
├── package.json         # Project dependencies & scripts
└── .env                 # Environment configuration (ignored in Git)
```

---

## ⚙️ Environment Variables & Secrets Management

Secrets and sensitive API credentials are strictly excluded from version control via `.gitignore` (`.env*`, `!.env.example`).
Create a `.env` file in the root directory based on `.env.example`:

```env
# Application Server Port
PORT=5000

# Application Base URL
APP_URL=http://localhost:5000

# MongoDB Connection String (Mongoose document store)
MONGODB_URI=mongodb://localhost:27017/ai-creatorhub

# PostgreSQL / Prisma Relational Database URL
DATABASE_URL=postgresql://user:password@localhost:5432/aicreatorhub_db

# Authentication Security (JWT Token Signing Secret)
JWT_SECRET=your_jwt_secret_key_here

# JWT Expiration Period
JWT_EXPIRES_IN=7d

# Google Gemini AI Service API Key
GEMINI_API_KEY=your_gemini_api_key_here
```

### Security & Secrets Guarantees:
- `.env` files are ignored in Git (`.gitignore` line 7: `.env*`).
- `.env.example` provides the safe key blueprint with no real secrets.
- Secrets are accessed securely in backend modules via `process.env.*` (e.g. `authMiddleware.ts`, `geminiService.ts`, `db.ts`, `prisma.ts`).

---

## 🚀 Local Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Yashraj191007/AI-CreatorHub.git
   cd AI-CreatorHub
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up your environment variables:**
   - Copy `.env.example` to `.env` and fill in local credentials.

---

## 💻 Development Commands

Start the full-stack development server (Frontend and Backend concurrently):

```bash
npm run dev
```

---

## 🧪 Testing

We use Vitest and Supertest for our automated testing suite.

**Run the complete test suite (Unit & Integration):**
```bash
npx vitest run
```

---

## 🛡️ Security & Architecture Notes

- **Prompt Injection Defense**: All AI prompts pass through a strict sanitization layer (`server/utils/promptDefense.ts`) to prevent system instruction overrides.
- **Authentication**: Passwords are one-way hashed using `bcrypt` before storage. Sessions are managed via HttpOnly/Bearer JSON Web Tokens.
- **Rate Limiting**: Applied to sensitive routes (Auth, AI Generation) to prevent brute force and DoS attacks.
- **Data Validation**: Request bodies are strictly validated against `Zod` schemas before hitting the controllers.

---

## 🌿 Git Workflow

AI-CreatorHub follows a structured feature-branch Git workflow:

1. **Branch Naming Standard**:
   - `main`: Production-ready, stable codebase.
   - `feature/<feature-name>`: Isolated feature development (e.g., `feature/testing-setup`, `feature/postgresql-prisma`, `feature/js-runtime-concepts`).

2. **Commit Standard**:
   - Prefix commits with conventional descriptors: `feat:`, `fix:`, `test:`, `docs:`.
   - Examples in Git history:
     - `feat: Add comprehensive unit and API integration test suite using Vitest and Supertest`
     - `feat: Add PostgreSQL, Prisma, billing system (Kalvium Milestone 2)`
     - `feat: implement JavaScript hoisting and event loop concepts`

3. **Pull Request (PR) & Code Review Flow**:
   - Create feature branch → Push to GitHub → Open PR targeting `main`.
   - Automated Vitest test suite validation.
   - Formal PR merges documented in repository history:
     - **PR #1**: `Merge pull request #1 from Yashraj191007/feature/testing-setup`
     - **PR #2**: `Merge pull request #2 from Yashraj191007/feature/postgresql-prisma`
     - **PR #3**: `Merge pull request #3 from Yashraj191007/feature/js-runtime-concepts`

---

## 🎓 Viva 4 Concept Evidence Map

| Concept | Repository File Evidence | Implementation & Technical Detail |
| :--- | :--- | :--- |
| **1. Environment Variables & Secrets Management** | `.env.example`, `.gitignore`, `server.ts`, `server/middleware/authMiddleware.ts` | Secrets (`GEMINI_API_KEY`, `JWT_SECRET`, `DATABASE_URL`) are read via `process.env`. `.env*` is excluded in `.gitignore`. Blueprint provided in `.env.example`. |
| **2. Git Workflow** | Git commit log, `README.md` | Standard feature branch workflow (`feature/*` -> PR -> `main`). Proven by PR #1, PR #2, PR #3 merges in git history and conventional commit standard. |
| **3. JavaScript — Async/Await** | `server/controllers/aiController.ts`, `server/services/geminiService.ts` | `handleGenerateCaptions` uses `async/await` with `try...catch` to await asynchronous Gemini API calls and asynchronous Mongoose database writes sequentially. |
| **4. JavaScript — Closures** | `server/middleware/authMiddleware.ts`, `server/utils/javascriptConcepts.ts` | `authorize(...roles)` returns an inner middleware closure encapsulating outer scope `roles`. `createRateLimiterClosure` encapsulates `callCount` across function invocations. |
| **5. JavaScript — Event Loop** | `server/utils/javascriptConcepts.ts`, `server/tests/unit/javascriptConcepts.test.ts` | `demonstrateEventLoopOrder()` proves execution order: Call Stack (Synchronous) -> Microtask Queue (Promises) -> Macrotask Queue (`setTimeout`). Tested in Vitest. |
| **6. JavaScript — Hoisting** | `server/utils/javascriptConcepts.ts`, `server/tests/unit/javascriptConcepts.test.ts` | Demonstrates Function Declaration hoisting, `var` hoisting (initialized to `undefined`), and Temporal Dead Zone (TDZ) for `let`/`const` (throwing `ReferenceError`). |
| **7. JavaScript — Promises vs Callbacks** | `server/utils/javascriptConcepts.ts`, `server/tests/unit/javascriptConcepts.test.ts` | Compares traditional error-first callbacks (`fetchContentWithCallback`), ES6 Promises (`fetchContentWithPromise`), and Promise Chaining (`fetchContentWithPromiseChain` `.then/.catch`). |
| **8. CRUD Operations (Mongo)** | `server/models/User.ts`, `server/models/Content.ts`, `server/tests/unit/userModel.test.ts` | Explicit Mongoose unit tests validating MongoDB CREATE (`User.create`), READ (`findById`/`findOne`), UPDATE (`findByIdAndUpdate`), and DELETE (`findByIdAndDelete`) with before/after state verification. |
| **9. Relational Schema Design (PK/FK)** | `prisma/schema.prisma`, `server/services/billingService.ts`, `server/tests/api/billing.test.ts` | PostgreSQL normalized schema (3NF) in Prisma. Explicit PK (`@id`), FK (`@relation(fields: [...], references: [...])`), and `onDelete` cascade/restrict rules across `User`, `Plan`, `PlanFeature`, `Subscription`, `Payment`. |

---

**Author**: Yashraj Jagtap

