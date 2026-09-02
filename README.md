# AI CreatorHub

AI CreatorHub is a full-stack, AI-powered content management platform designed for modern creators. It enables users to generate, manage, and optimize their content seamlessly using Google's advanced Gemini AI. The platform features robust authentication, an administrative dashboard, secure AI interactions, and comprehensive testing infrastructure.

---

## 🌟 Features

- **LLM API Integration**: Integrates the Google Gemini API (`@google/genai` SDK) for all AI generation tasks. Calls `ai.models.generateContent()` and `ai.models.generateContentStream()` with structured prompts, function declarations, and response schemas.
- **Function Calling / Tool Use**: Implements `FunctionDeclaration[]` in `server/services/geminiTools.ts` for 4 tools (`getUserContentStats`, `searchUserContent`, `getRecentContent`, `getContentById`). `runAssistantToolChat()` passes `tools: [{ functionDeclarations }]` to Gemini, reads `response.functionCalls`, executes via `executeToolCall()`, and feeds results back for final synthesis.
- **Structured Outputs**: The Multi-Step Agent planner uses the official Gemini structured output API — `config: { responseMimeType: 'application/json', responseSchema: PLANNER_OUTPUT_SCHEMA }` — enforcing a typed JSON schema (`targetAudience`, `keyAngles`, `suggestedSections`, `retrievalKeywords`) at the API level, not just via prompt instructions. Implemented in `server/services/multiStepAgentService.ts`.
- **RAG — Embeddings & Vector Retrieval**: `server/services/ragService.ts` implements a full RAG pipeline: text chunking (`chunkText`), vector embedding via `text-embedding-004` (`generateEmbedding`), MongoDB storage of embedding vectors (`KnowledgeDoc` model), cosine similarity ranking (`cosineSimilarity`), top-K retrieval (`retrieveRelevantChunks`), and Gemini augmented generation grounded on retrieved context (`generateRAGAugmentedResponse`). Routes: `POST /api/ai/rag/index` and `POST /api/ai/rag`.
- **Multi-Step Agent**: `server/services/multiStepAgentService.ts` implements a 4-stage orchestrated pipeline via the `AgentOrchestrator` class: Stage 1 (Planner — structured JSON strategy), Stage 2 (Retriever — RAG vector lookup using planner keywords), Stage 3 (Generator — multi-section draft using plan + context), Stage 4 (Refiner — prompt defense, readability scoring, hashtag extraction). Route: `POST /api/ai/multi-step-agent`.
- **Streaming Responses**: `generateContentStream()` in `server/services/geminiService.ts` uses `ai.models.generateContentStream()` with an async iterator to yield token chunks progressively. `handleStreamContent()` (`POST /api/ai/stream`) configures Express SSE headers (`Content-Type: text/event-stream`) and writes `data: { chunk }` events incrementally to the HTTP response.
- **Token & Cost Monitoring**: `server/utils/costMonitor.ts` captures Gemini `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`) when available, with a character-ratio fallback. Computes `estimatedCostUSD` per model pricing. Every AI request persists `promptTokens`, `candidateTokens`, `totalTokens`, and `estimatedCostUSD` to `AIRequest` (MongoDB). Aggregate statistics available at `GET /api/ai/usage-stats`.
- **LLM Evaluation Suite**: `server/evals/evalDataset.ts` contains a structured benchmark dataset across 5 categories (`security_injection`, `caption_constraints`, `multi_step_agent`, `rag_relevance`, `json_schema`). `server/evals/evalRunner.ts` executes test cases against live application pipeline components and produces per-category and overall score reports. Run tests via the explicit command `npm run eval`.
- **AI Content Generation**: Leverages Google Gemini API for caption generation, content drafting, rewriting, summarization, and hashtag extraction.
- **Input Sanitization & Prompt Injection Defense**: Features a layered defense strategy. `inputSanitization.ts` middleware recursively scrubs dangerous HTML/scripts from untrusted JSON request bodies before they reach controllers. Separately, `promptDefense.ts` provides AI-specific protection by detecting jailbreak patterns and structurally sandboxing user input within `<user_content>` delimiters.
- **Prompt Engineering**: Centralized in `server/utils/promptTemplates.ts`. Reusable prompt template functions (e.g., `getPlannerPromptTemplate`) clearly separate intended AI instructions from the defense layer.
- **Secure Authentication**: End-to-end JWT-based authentication with secure password hashing (bcrypt).
- **Role-Based Access Control (RBAC)**: Distinct permissions for standard users and administrators, including a secure Admin portal.
- **Content Management**: Create, read, update, and delete (CRUD) operations for creative content with seamless MongoDB integration.
- **Responsive UI**: A modern, mobile-friendly interface built with React, Tailwind CSS, and Framer Motion.
- **Comprehensive Testing**: Automated unit and API integration testing suite ensuring platform stability (67 tests across 14 files).

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

2. **Development & Commit Standard**:
   - Features are developed and committed on their respective feature branches.
   - Prefix commits with conventional descriptors: `feat:`, `fix:`, `test:`, `docs:`.
   - Examples in Git history:
     - `feat: Add comprehensive unit and API integration test suite using Vitest and Supertest`
     - `feat: Add PostgreSQL, Prisma, billing system`
     - `feat: implement JavaScript hoisting and event loop concepts`

3. **Testing Before Merge**:
   - Before merging a feature branch, the automated test suite is executed using:
     ```bash
     npx vitest run
     ```
   - The suite includes unit and API integration tests using Vitest and Supertest.
   - Changes are merged only after verifying that the relevant tests pass.

4. **Pull Request & Merge Flow**:
   - Create feature branch → Implement changes → Run automated tests → Push branch to GitHub → Open PR targeting `main` → Review changes → Merge PR.
   - Formal PR merges are preserved in repository history, including:
     - **PR #1**: `Merge pull request #1 from Yashraj191007/feature/testing-setup`
     - **PR #2**: `Merge pull request #2 from Yashraj191007/feature/postgresql-prisma`
     - **PR #3**: `Merge pull request #3 from Yashraj191007/feature/js-runtime-concepts`
     - **PR #8**: `Merge pull request #8 from Yashraj191007/feature/project-documentation`

This workflow keeps `main` stable while providing traceable feature development, automated verification, code review, and documented integration history.
---

**Author**: Yashraj Jagtap

