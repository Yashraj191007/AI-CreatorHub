# AI-CreatorHub - Low-Level Design (LLD)

## 1. Backend Directory Structure
```text
server/
├── app.ts                  # Express application setup and middleware registration
├── config/
│   └── prisma.ts           # Prisma singleton client instance
├── controllers/            # HTTP request/response handlers
│   ├── adminController.ts
│   ├── aiController.ts
│   ├── authController.ts
│   ├── billingController.ts
│   ├── contentController.ts
│   └── mediaController.ts
├── middleware/             # Express middlewares
│   ├── authMiddleware.ts
│   ├── errorHandler.ts
│   └── rateLimiter.ts
├── evals/                  # LLM evaluation benchmark suite
│   ├── evalDataset.ts      # Structured benchmark dataset (multi-category)
│   └── evalRunner.ts       # Evaluation runner producing score reports
├── models/                 # Mongoose schemas
│   ├── AIRequest.ts        # AI request log with token & cost fields
│   ├── Content.ts
│   ├── KnowledgeDoc.ts     # RAG vector knowledge store (embeddings)
│   ├── Media.ts
│   └── User.ts
├── routes/                 # Express routers
│   ├── adminRoutes.ts
│   ├── aiRoutes.ts         # All AI routes incl. RAG, agent, stream, usage-stats
│   ├── authRoutes.ts
│   ├── billingRoutes.ts
│   ├── contentRoutes.ts
│   └── mediaRoutes.ts
├── services/               # Core business logic
│   ├── billingService.ts
│   ├── geminiService.ts    # LLM API integration, streaming, function calling
│   ├── geminiTools.ts      # FunctionDeclaration[] and executeToolCall dispatcher
│   ├── multiStepAgentService.ts  # 4-stage agent pipeline (Planner→Retriever→Generator→Refiner)
│   └── ragService.ts       # RAG pipeline: embedding, chunking, cosine similarity, retrieval
├── tests/                  # Automated tests (Vitest)
│   ├── api/                # Integration tests
│   ├── evals/              # LLM evaluation benchmark tests
│   ├── unit/               # Unit tests
│   └── setup.ts            # Test environment configuration
├── utils/                  # Utility functions
│   ├── costMonitor.ts      # Token & cost monitoring, usage aggregation
│   ├── javascriptConcepts.ts
│   ├── promptDefense.ts
│   └── seedPlans.ts
└── validators/             # Zod validation schemas
    ├── aiValidator.ts
    ├── authValidator.ts
    └── contentValidator.ts
```

## 2. Frontend Directory Structure
```text
src/
├── components/             # Reusable UI components
│   ├── Navbar.tsx
│   ├── PromptInjectionWarning.tsx
│   └── Sidebar.tsx
├── context/                # React Context providers
│   └── AuthContext.tsx     # Authentication state management
├── pages/                  # Route-level components
│   ├── AdminPage.tsx
│   ├── AIAssistantPage.tsx
│   ├── ContentFormPage.tsx
│   ├── ContentListPage.tsx
│   ├── DashboardPage.tsx
│   ├── LandingPage.tsx
│   ├── LoginPage.tsx
│   ├── ProfilePage.tsx
│   └── RegisterPage.tsx
└── services/               # API communication
    └── api.ts              # Axios instance configuration
```

## 3. Detailed Module Responsibilities

### Controllers
- `authController.ts`: Handles `register`, `login`, and `getMe` requests.
- `contentController.ts`: Handles CRUD operations for Content documents.
- `mediaController.ts`: Handles the `uploadImage` POST request.
- `aiController.ts`: Handles all AI generation requests including caption generation, content drafting, function-calling assistant chat, multi-step agent orchestration (`handleMultiStepAgent`), RAG query and document indexing (`handleRAGSearch`, `handleIndexKnowledgeDoc`), SSE streaming (`handleStreamContent`), and usage statistics (`handleGetAIUsageStats`).
- `adminController.ts`: Handles the retrieval of platform statistics.
- `billingController.ts`: Handles `getPlans`, `subscribe`, and `getHistory`.

### Services
- `billingService.ts`: Manages PostgreSQL interactions for plans, creating subscriptions, and recording payments via Prisma.
- `geminiService.ts`: Initializes the `@google/genai` client. Implements `generateCaptions`, `generateContentDraft`, `rewriteContent`, `summarizeContent`, `generateHashtags`, `runAssistantToolChat` (function calling), and `generateContentStream` (SSE streaming via `ai.models.generateContentStream` async iterator).
- `geminiTools.ts`: Defines 4 `FunctionDeclaration[]` objects (`getUserContentStats`, `searchUserContent`, `getRecentContent`, `getContentById`) and the `executeToolCall()` dispatcher that routes Gemini function call results to MongoDB queries.
- `multiStepAgentService.ts`: Implements the 4-stage multi-step agent pipeline. Stage 1 (`executePlannerStage`) uses Gemini structured output (`responseMimeType: 'application/json'` + `responseSchema`) to enforce a typed JSON content strategy. Stage 2 (`executeRetrieverStage`) queries the RAG vector store. Stage 3 (`executeGeneratorStage`) synthesises a multi-section draft. Stage 4 (`executeRefinerStage`) applies prompt safety checks, readability scoring, and hashtag extraction.
- `ragService.ts`: Implements the full RAG pipeline — `chunkText` (overlapping text chunking), `generateEmbedding` (Google `text-embedding-004` or 64-dim fallback), `indexKnowledgeDocument` (chunk + embed + persist to MongoDB `KnowledgeDoc`), `cosineSimilarity`, `retrieveRelevantChunks` (top-K similarity ranking), and `generateRAGAugmentedResponse` (context-grounded Gemini generation).

### Middleware
- `authMiddleware.ts`: Exports `protect` (verifies JWT) and `authorize` (verifies role arrays).
- `errorHandler.ts`: Catches exceptions, logs them, and returns a uniform JSON error payload.
- `rateLimiter.ts`: Uses `express-rate-limit` to apply the `apiLimiter` to incoming traffic.

## 4. Validation Schemas (Zod)
- `authValidator.ts`: Validates `registerSchema` (email, password, name) and `loginSchema` (email, password).
- `contentValidator.ts`: Validates `contentSchema` (title, body, status).
- `aiValidator.ts`: Validates `generateSchema` (prompt string).

## 5. Database Schemas (MongoDB / Mongoose)
- **User**: `name` (string), `email` (string, unique), `password` (string), `role` (enum: 'USER', 'ADMIN').
- **Content**: `title` (string), `body` (string), `userId` (ObjectId ref User), `status` (enum: 'draft', 'published').
- **Media**: `filename` (string), `originalName` (string), `mimeType` (string), `path` (string), `userId` (ObjectId ref User).
- **AIRequest**: `userId` (ObjectId ref User), `operationType` (enum), `prompt` (string), `result` (string), `isSuspicious` (boolean), `toolCallsCount` (number), `promptTokens` (number), `candidateTokens` (number), `totalTokens` (number), `estimatedCostUSD` (number), `createdAt`.
- **KnowledgeDoc**: `userId` (ObjectId ref User), `title` (string), `category` (string), `content` (string, full source text), `chunkText` (string, 300-word overlapping chunk), `chunkIndex` (number), `embedding` ([Number], 768-dim or 64-dim vector), `createdAt`. Used by the RAG pipeline for vector similarity search.

## 6. Database Models (PostgreSQL / Prisma)
Referenced in `prisma/schema.prisma`:
- **Plan**: `id`, `name`, `price`.
- **PlanFeature**: `id`, `planId` (ref Plan), `description`.
- **User**: `id` (matches Mongo ID), `email`.
- **Subscription**: `id`, `userId` (ref User), `planId` (ref Plan), `status`, `startDate`, `endDate`.
- **Payment**: `id`, `subscriptionId` (ref Subscription), `amount`, `status`, `paymentDate`.

## 7. Security Implementation

### Authentication
- `authController.ts` uses `bcrypt.hash()` on registration and `bcrypt.compare()` on login.
- `jsonwebtoken.sign()` generates a token payload containing `{ id, role }`.
- `authMiddleware.ts` extracts the token from the `Authorization: Bearer <token>` header and verifies it.

### Prompt Injection Defense
- `utils/promptDefense.ts` implements a Regex-based defense.
- Scans user prompts for phrases like "ignore previous instructions" or "system prompt".
- Throws an error before `geminiService.ts` is invoked if a match is detected.

## 8. Billing Implementation & Transactions
- Defined in `server/services/billingService.ts`.
- `subscribeToPlan` initiates a transaction: `prisma.$transaction(async (tx) => { ... })`.
- Within `tx`, it sequentially:
  1. `tx.user.upsert` (Syncs the MongoDB user to Postgres lazily).
  2. `tx.subscription.create`.
  3. `tx.payment.create`.
- If any operation fails, the transaction is automatically rolled back by Prisma.
- `getBillingHistory` demonstrates explicit relational SQL by using `prisma.$queryRaw` with manual `JOIN` clauses.

## 9. File Upload Implementation
- Defined in `server/routes/mediaRoutes.ts` using `multer`.
- Configured with `multer.diskStorage()` to save files into the root `/uploads` directory.
- Static file serving is enabled in `server/app.ts` via `app.use('/uploads', express.static(...))`.

## 10. AI Function Calling Implementation
- Defined in `server/services/geminiTools.ts`.
- Exports `creatorToolDeclarations: FunctionDeclaration[]` with 4 tools: `getUserContentStats`, `searchUserContent`, `getRecentContent`, `getContentById`.
- Exports `executeToolCall(userId, toolName, args)` dispatcher that routes calls to MongoDB aggregation queries.
- In `server/services/geminiService.ts` (`runAssistantToolChat`), the service passes `tools: [{ functionDeclarations: creatorToolDeclarations }]` to `ai.models.generateContent()`. It inspects `response.functionCalls`, executes via `executeToolCall()`, and sends the result back to Gemini in a follow-up call for final synthesis.

## 11. Structured Outputs
- Implemented in `server/services/multiStepAgentService.ts` (`executePlannerStage`).
- Uses the official Gemini SDK structured output API: `config: { responseMimeType: 'application/json', responseSchema: PLANNER_OUTPUT_SCHEMA }`.
- `PLANNER_OUTPUT_SCHEMA` is a `Schema` object (from `@google/genai`) with `Type.OBJECT` and typed properties for `targetAudience` (STRING), `keyAngles` (ARRAY of STRING), `suggestedSections` (ARRAY of STRING), and `retrievalKeywords` (STRING).
- Enforces the JSON schema at the API level — the model is required to return valid JSON matching the schema, not just instructed to do so via prompt.

## 12. RAG — Embeddings & Vector Retrieval
- Implemented in `server/services/ragService.ts` and `server/models/KnowledgeDoc.ts`.
- **Indexing flow** (`POST /api/ai/rag/index`): `chunkText()` splits documents into 300-word overlapping chunks → `generateEmbedding()` calls `ai.models.embedContent({ model: 'text-embedding-004' })` → `KnowledgeDoc.create()` persists chunk + embedding vector to MongoDB.
- **Retrieval flow** (`POST /api/ai/rag`): `generateEmbedding(query)` embeds the query → `KnowledgeDoc.find({ userId })` fetches stored vectors → `cosineSimilarity()` ranks all chunks → top-K chunks are injected as context into a `generateContent()` call (`generateRAGAugmentedResponse`).

## 13. Multi-Step Agent Pipeline
- Implemented in `server/services/multiStepAgentService.ts`. Route: `POST /api/ai/multi-step-agent`.
- **Stage 1 (Planner)**: Calls Gemini with `responseMimeType: 'application/json'` + `responseSchema` to produce a typed content strategy (targetAudience, keyAngles, suggestedSections, retrievalKeywords).
- **Stage 2 (Retriever)**: Uses `plannerOutput.retrievalKeywords` to query the RAG vector store via `retrieveRelevantChunks()`.
- **Stage 3 (Generator)**: Uses Stage 1 plan + Stage 2 context to synthesise a multi-section draft via `generateContent()`.
- **Stage 4 (Refiner)**: Applies `sanitizeAndGuardPrompt()`, extracts hashtags, and computes a readability score.
- Each stage records `startedAt`, `completedAt`, `durationMs`, and structured output.

## 14. Streaming Responses
- Implemented in `server/services/geminiService.ts` (`generateContentStream`) and `server/controllers/aiController.ts` (`handleStreamContent`). Route: `POST /api/ai/stream`.
- Uses `ai.models.generateContentStream()` with a `for await (const chunk of responseStream)` async iterator.
- Express controller sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive` headers and writes `data: { chunk }` SSE events for each chunk, then `data: { done: true }` and `res.end()`.

## 15. Token & Cost Monitoring
- Implemented in `server/utils/costMonitor.ts`. Usage stats route: `GET /api/ai/usage-stats`.
- `calculateTokenUsageAndCost(prompt, result, model, usageMetadata?)`: Extracts `promptTokenCount`/`candidatesTokenCount` from Gemini `usageMetadata`; falls back to character ratio (1 token ≈ 4 chars) if metadata is absent. Computes `estimatedCostUSD` from configurable per-model pricing.
- All AI requests persist `promptTokens`, `candidateTokens`, `totalTokens`, `estimatedCostUSD` to `AIRequest` (MongoDB).
- `aggregateUsageStats()` sums all per-request fields for the usage dashboard endpoint.

## 16. LLM Evaluation Suite
- Implemented in `server/evals/evalDataset.ts` and `server/evals/evalRunner.ts`.
- `EVALUATION_DATASET` contains benchmark cases across: `security_injection`, `caption_constraints`, `multi_step_agent`, `rag_relevance`, `json_schema`.
- `runLLMEvalSuite(dataset)` iterates over cases, executes live application pipeline components (`sanitizeAndGuardPrompt`, `executePlannerStage`, `retrieveRelevantChunks`), asserts criteria, and returns `EvalReport { totalCases, passedCases, overallScorePercentage, categoryScores }`.
- Benchmark suite test in `server/tests/evals/llmEval.test.ts` verifies ≥80% overall pass rate.

## 11. Testing Structure
- Uses `vitest` for the test runner and assertions.
- Uses `supertest` in `server/tests/api/` for simulating HTTP requests.
- Uses `mongodb-memory-server` to mock the NoSQL database during testing.
- Uses `DATABASE_URL_TEST` environment variable to connect to a live Prisma/PostgreSQL test database.
- `server/tests/unit/javascriptConcepts.test.ts` executes pure JS runtime verifications for hoisting and event loop concepts.
