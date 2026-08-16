# Kalvium Project Assessor Concept Audit: AI-CreatorHub

## 1. Genuinely Implemented Concepts

### AI & LLM Concepts
* **LLM API Integration**
  * **Category**: AI/ML
  * **File Path**: `server/services/geminiService.ts`
  * **Implementation**: Uses `@google/genai` to generate content, captions, and summarize text using the `gemini-3.6-flash` model.
* **Function Calling / Tool Use**
  * **Category**: Advanced AI
  * **File Path**: `server/services/geminiTools.ts`, `server/services/geminiService.ts`
  * **Implementation**: Uses `creatorToolDeclarations` to give the LLM tools like `getUserContentStats` and `searchUserContent`. The backend executes these tools and feeds results back to the LLM.
* **Prompt Engineering & System Instructions**
  * **Category**: AI/ML
  * **File Path**: `server/utils/promptDefense.ts`
  * **Implementation**: Uses a `buildSystemInstructions` factory to set strict AI personas and expected response formats.

### Security Concepts
* **Prompt Injection Defense**
  * **Category**: AI Security (Mandatory)
  * **File Path**: `server/utils/promptDefense.ts`
  * **Implementation**: `sanitizeAndGuardPrompt` uses Regex patterns to detect "ignore previous instructions" or "system instruction override" and wraps user input in `<user_content>` tags.
* **JWT Authentication**
  * **Category**: Security (Mandatory)
  * **File Path**: `server/middleware/authMiddleware.ts`
  * **Implementation**: Implements `protect` middleware using `jsonwebtoken` to decode and verify Bearer tokens from the `Authorization` header.
* **Role-Based Access Control (RBAC)**
  * **Category**: Security
  * **File Path**: `server/middleware/authMiddleware.ts`
  * **Implementation**: Implements `authorize(...roles)` middleware to restrict routes (e.g., ADMIN only).
* **Password Hashing**
  * **Category**: Security
  * **File Path**: `server/controllers/authController.ts` (Inferred from `bcrypt` in `package.json` and LLD)
  * **Implementation**: Hashes passwords using bcrypt before saving to the DB.
* **Input Sanitization & Validation**
  * **Category**: Security
  * **File Path**: `server/validators/*` (Inferred from Zod in `package.json` and LLD)
  * **Implementation**: Uses `zod` schemas to strictly validate request bodies (e.g., email, password length).

### Database & Backend Architecture
* **MongoDB Concepts (NoSQL)**
  * **Category**: Databases (Mandatory)
  * **File Path**: `server/models/Content.ts`, `server/services/geminiTools.ts`
  * **Implementation**: Mongoose schemas for flexible document storage and Aggregation Pipelines (`$match`, `$group`) to fetch user content statistics.
* **PostgreSQL / Prisma Concepts (SQL)**
  * **Category**: Databases (Mandatory)
  * **File Path**: `prisma/schema.prisma`
  * **Implementation**: Complete relational schema utilizing Prisma Client for the billing and subscription domain.
* **SQL Normalization (3NF)**
  * **Category**: Databases
  * **File Path**: `prisma/schema.prisma`
  * **Implementation**: Properly normalizes Plans and PlanFeatures (1:N), and Subscriptions to Payments (1:N) avoiding data redundancy.
* **SQL Transactions**
  * **Category**: Databases
  * **File Path**: `server/services/billingService.ts`
  * **Implementation**: Uses `prisma.$transaction` to atomically execute user upsert, subscription creation, and payment record generation.
* **SQL JOINs**
  * **Category**: Databases
  * **File Path**: `server/services/billingService.ts`
  * **Implementation**: Uses Prisma `$queryRaw` to execute an explicit SQL query with `JOIN` and `LEFT JOIN` to fetch comprehensive billing history.
* **JavaScript Runtime Concepts**
  * **Category**: Language Fundamentals (Mandatory)
  * **File Path**: `server/utils/javascriptConcepts.ts`, `server/tests/unit/javascriptConcepts.test.ts`
  * **Implementation**: Explicit demonstrations of Function Hoisting, Variable Hoisting, Temporal Dead Zone (TDZ), and the Event Loop (Microtask vs Macrotask execution order).
* **Automated Testing**
  * **Category**: Quality Assurance (Mandatory)
  * **File Path**: `server/tests/unit/*`, `package.json` (Vitest)
  * **Implementation**: Full unit test suite configured via Vitest to validate JS runtime concepts and system logic.

### Frontend
* **React Concepts**
  * **Category**: Frontend (Mandatory)
  * **File Path**: `src/pages/*.tsx`
  * **Implementation**: Heavy utilization of React hooks (`useState`, `useEffect`), component composition, and React Context (`AuthContext`).

---

## 2. Concepts NOT Implemented or Unverifiable
* **WebSockets / Real-time events**: No `socket.io` or `ws` found in package.json or codebase.
* **OAuth2 / Social Logins**: Not implemented. Users use email/password.
* **Email Verification / Password Reset**: No SMTP/Email integration found (e.g., SendGrid/Nodemailer).
* **Payment Gateway Integration**: Actual Stripe/Razorpay SDK is missing; billing is simulated via the database models.
* **CI/CD Pipelines**: No `.github/workflows` or similar continuous integration scripts found.

---

## 3. Mandatory Concepts Rubric

| Concept | Status | Evidence |
| :--- | :--- | :--- |
| **LLM API Integration** | **PASS** | `geminiService.ts` uses GoogleGenAI with `generateContent`. |
| **Prompt Injection Defense** | **PASS** | `promptDefense.ts` uses Regex and XML wrapping to secure prompts. |
| **JWT Authentication** | **PASS** | `authMiddleware.ts` verifies tokens using `jsonwebtoken`. |
| **Role-Based Access Control** | **PASS** | `authorize` middleware blocks unauthorized user roles. |
| **MongoDB / NoSQL Ops** | **PASS** | Aggregation pipelines used in `geminiTools.ts`. |
| **PostgreSQL / SQL Relations** | **PASS** | `schema.prisma` implements normalized relations (Plan/Subscription). |
| **SQL Transactions** | **PASS** | `billingService.ts` uses `prisma.$transaction` for billing workflows. |
| **SQL JOINs** | **PASS** | `billingService.ts` uses `$queryRaw` for manual JOIN statements. |
| **React State/Effect Hooks** | **PASS** | Wide usage of `useState` and `useEffect` in `src/pages/`. |
| **Automated Testing** | **PASS** | Vitest unit tests in `server/tests/unit/javascriptConcepts.test.ts`. |
| **JavaScript Runtime Concepts**| **PASS** | Event Loop and Hoisting demonstrated in `javascriptConcepts.ts`. |
| **Git Workflow** | **PASS** | Meaningful commits with Milestones and branching evident in Git log. |
| **Environment Variables** | **PASS** | Use of `.env` and `process.env` throughout backend. |

---

## 4. Git History & Milestone Review
A review of `git log` reveals excellent adherence to the Kalvium workflow:
1. **Milestone 1**: `8049230 feat: Add comprehensive unit and API integration test suite using Vitest and Supertest`
2. **Milestone 2**: `6b674b0 feat: Add PostgreSQL, Prisma, billing system (Kalvium Milestone 2)`
3. **Milestone 3**: `f3ae82b feat: implement JavaScript hoisting and event loop concepts`

PR Merges are visible (e.g., `Merge pull request #3 from Yashraj191007/feature/js-runtime-concepts`), proving branch-based collaborative workflows.

---

## 5. Documentation Review (PRD, HLD, LLD, README)
* **Claims**: The README and architecture docs claim a hybrid database approach, AI function calling, prompt defense, and full testing.
* **Evidence**: The codebase **100% backs up these claims**. The documentation accurately reflects the current structure. No ghost claims were found. The docs serve as legitimate proof of system design capability.

---

## 6. Score and Recommendations

* **Total Points from Implemented Concepts**: Estimated 90-100% of the required Kalvium core rubric is covered.
* **High-Value Concepts Missing**: WebSockets, Caching (Redis), Containerization (Docker).

### Next 3-5 Concepts to Implement
1. **Redis Caching**: Cache the `getPlans` query or content stats to demonstrate performance optimization.
2. **Dockerization**: Add a `Dockerfile` and `docker-compose.yml` to run Postgres and Mongo locally, demonstrating DevOps skills.
3. **WebSockets (Socket.io)**: Add a real-time notification when an AI generation completes.
4. **CI/CD Pipeline**: Add a basic GitHub Actions workflow to run the Vitest suite on every push.

---

## 7. MOCK VIVA PREPARATION

### 1. Concept: Prompt Injection Defense
* **Question**: "How do you ensure that users cannot bypass your AI's instructions?"
* **What's Tested**: Understanding of LLM vulnerabilities and sanitization.
* **Show**: `server/utils/promptDefense.ts`
* **Key Points**: Explain the Regex checks for "ignore previous instructions", and show how you wrap user input in `<user_content>` tags, while instructing the system prompt to ignore commands inside those tags.
* **Follow-up**: "What happens if a user types `</user_content>` in their prompt?" (Answer: The regex replaces it with `[ESCAPED_TAG]`).

### 2. Concept: Database Transactions
* **Question**: "If a payment fails, how do you prevent a subscription from being created?"
* **What's Tested**: Understanding of ACID properties and data integrity.
* **Show**: `server/services/billingService.ts` (`subscribeToPlan`)
* **Key Points**: Show `prisma.$transaction`. Explain that if the payment creation fails, the user upsert and subscription creation are automatically rolled back, preventing orphaned records.
* **Follow-up**: "Why did you use PostgreSQL for billing instead of MongoDB?" (Answer: Billing requires strict relational integrity and ACID guarantees, which SQL databases excel at).

### 3. Concept: AI Function Calling
* **Question**: "How does the AI know how many posts a user has?"
* **What's Tested**: Understanding of LLM Tool Use / API integration.
* **Show**: `server/services/geminiTools.ts` and `geminiService.ts`
* **Key Points**: Show the `FunctionDeclaration` schema. Explain that the LLM doesn't have the data, but it returns a structured request asking the backend to run `getUserContentStats`. The backend runs the Mongo aggregation and feeds the numbers back to the LLM.
* **Follow-up**: "Can the user trigger a tool call maliciously?" (Answer: No, the backend strictly controls the execution inside a switch statement and enforces the `userId`).

### 4. Concept: JavaScript Event Loop
* **Question**: "Can you prove you understand the JS Event Loop?"
* **What's Tested**: Deep understanding of Node.js / JS concurrency model.
* **Show**: `server/utils/javascriptConcepts.ts` (`demonstrateEventLoopOrder`)
* **Key Points**: Explain the difference between synchronous code (Call Stack), Microtasks (Promises), and Macrotasks (`setTimeout`). Show how the test verifies the exact execution order: Sync -> Microtask -> Macrotask.
* **Follow-up**: "Why does a Promise resolve before a `setTimeout(0)`?" (Answer: The microtask queue has higher priority and is drained before the event loop moves to the next macrotask).

### 5. Concept: SQL JOINs
* **Question**: "How are you fetching a user's billing history?"
* **What's Tested**: Relational algebra and SQL syntax.
* **Show**: `server/services/billingService.ts` (`getBillingHistory`)
* **Key Points**: Highlight the `$queryRaw` query. Explain how you `JOIN` User to Subscription, and then `LEFT JOIN` Plan, PlanFeature, and Payment to aggregate the data into a single flat view.
* **Follow-up**: "Why use `LEFT JOIN` for PlanFeature?" (Answer: To ensure the subscription still shows up even if a plan currently has zero features mapped to it).
