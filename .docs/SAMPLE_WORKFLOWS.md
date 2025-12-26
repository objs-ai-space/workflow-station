# Sample Workflows for Testing

This document describes the pre-configured sample workflows available in the UI.

## 🧮 Math Chain

**Purpose:** Tests workflow independence - each step processes only the previous result.

**Steps:**
1. Extract number from input (8)
2. Add 7 → 15
3. Multiply by 2 → 30
4. Subtract 5 → 25
5. Check if divisible by 5 (conditional)
   - If YES → Step 6 (Success path)
   - If NO → Step 7 (Alternate path)
6. Success message
7. Alternate message with remainder

**Use Case:** Demonstrates sequential processing and conditional branching.

---

## 🔗 Text Chain

**Purpose:** Text modification with approval/rejection workflow.

**Steps:**
1. Rewrite text to be more formal
2. Add outdoor activity suggestion
3. Compare with original text
4. Conditional check if changes are sufficient
   - If YES → Step 5 (Approved)
   - If NO → Step 6 (Rejected)
5. Approved: Summarize modifications
6. Rejected: List improvements needed

**Use Case:** Content review and approval workflows.

---

## 🌐 API + LLM Chain

**Purpose:** Fetch data from external API and process with LLM.

**Steps:**
1. **Endpoint:** Fetch user data from JSONPlaceholder API
   - URL: `https://jsonplaceholder.typicode.com/users/1`
   - Method: GET
   - Retries: 3
2. Extract user's name, email, and company
3. Analyze user data and provide professional summary
4. Generate personalized greeting message

**Use Case:** 
- Data enrichment workflows
- API data processing
- Personalized content generation

**API Used:** JSONPlaceholder (public test API)

---

## 🔄 Multi-Endpoint Chain

**Purpose:** Call multiple APIs sequentially and combine results.

**Steps:**
1. **Endpoint 1:** Fetch first post (`/posts/1`)
2. **Endpoint 2:** Fetch second post (`/posts/2`)
3. **Endpoint 3:** Fetch third post (`/posts/3`)
4. Combine titles from all three posts
5. Create summary explaining what posts are about

**Use Case:**
- Aggregating data from multiple sources
- Batch API processing
- Data consolidation workflows

**API Used:** JSONPlaceholder (public test API)

---

## ⚡ Conditional API Chain

**Purpose:** Fetch data, check condition, then process conditionally.

**Steps:**
1. **Endpoint:** Fetch user data (`/users/1`)
2. Check if email domain is 'example.com'
3. **Conditional:** Based on email domain check
   - If YES (example.com) → Step 4 (Internal user)
   - If NO → Step 5 (External user)
4. Generate welcome message for internal user
5. Generate welcome message for external user

**Use Case:**
- User segmentation workflows
- Conditional data processing
- Role-based content generation

**API Used:** JSONPlaceholder (public test API)

---

## 📤 API POST Chain

**Purpose:** Send data to API, then process response.

**Steps:**
1. **Endpoint:** Create new post via POST request
   - URL: `https://jsonplaceholder.typicode.com/posts`
   - Method: POST
   - Body: `{ title: "My Test Post", body: "...", userId: 1 }`
2. Extract post ID from response
3. Analyze created post content
4. Suggest improvements to make post more engaging

**Use Case:**
- Content creation workflows
- API submission and validation
- Post-processing of API responses

**API Used:** JSONPlaceholder (public test API)

---

## Testing Tips

### 1. Verify Endpoint Workers
Before testing, ensure endpoint workers are deployed:
```bash
cd endpoints-workers
./deploy-all.sh
```

### 2. Check Endpoint URLs
Make sure endpoint URLs in the UI match your deployed workers:
- `https://endpoint-1.developer-f79.workers.dev`
- `https://endpoint-2.developer-f79.workers.dev`
- `https://endpoint-3.developer-f79.workers.dev`

### 3. Test Workflow Steps
- Click a sample workflow button to load it
- Review the configured steps
- Click "Start Workflow" to execute
- Monitor step-by-step execution in the status panel

### 4. Expected Behavior
- **Endpoint steps:** Should show API call duration and response
- **LLM steps:** Should show processing time and result
- **Conditional steps:** Should show condition evaluation and branch taken
- **Multi-step:** Each step should process the previous step's result

### 5. Troubleshooting
- **Endpoint failures:** Check API URL is accessible
- **Retry logic:** Failed requests will retry automatically
- **Timeout errors:** Increase timeout in endpoint configuration
- **LLM errors:** Verify API keys are set correctly

---

## Customizing Samples

You can modify any sample workflow:
1. Load a sample workflow
2. Edit individual steps
3. Add/remove steps
4. Change endpoint URLs or API endpoints
5. Modify LLM instructions
6. Adjust conditional logic

---

## API Endpoints Used

All samples use **JSONPlaceholder** - a free fake REST API for testing:
- Base URL: `https://jsonplaceholder.typicode.com`
- Endpoints:
  - `/users/{id}` - Get user data
  - `/posts/{id}` - Get post data
  - `/posts` - Create new post (POST)

**Note:** JSONPlaceholder is a public test API. For production, replace with your own APIs.

