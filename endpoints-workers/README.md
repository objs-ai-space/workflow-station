# Endpoint Workers

These Cloudflare Workers handle external API calls with retry logic and can be used as steps in workflows.

## Features

- ✅ External API call support (GET, POST, PUT, PATCH, DELETE)
- ✅ Configurable retry logic with exponential backoff
- ✅ Request timeout handling
- ✅ Error handling and response parsing
- ✅ CORS support

## Deployment

### Deploy All Workers

```bash
cd endpoints-workers
./deploy-all.sh
```

### Deploy Individual Workers

```bash
cd endpoint-1
npm run deploy

cd ../endpoint-2
npm run deploy

cd ../endpoint-3
npm run deploy
```

## Usage in Workflows

### Endpoint Instruction Format

```json
{
  "type": "endpoint",
  "endpointUrl": "https://endpoint-1.your-subdomain.workers.dev",
  "apiUrl": "https://api.example.com/data",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer token"
  },
  "body": {
    "key": "value"
  },
  "retries": 3,
  "retryDelay": 1000,
  "timeout": 30000,
  "description": "Fetch user data from external API"
}
```

### Example Workflow

```json
{
  "context": "Fetch data from external API",
  "instructions": [
    {
      "type": "endpoint",
      "endpointUrl": "https://endpoint-1.your-subdomain.workers.dev",
      "apiUrl": "https://api.example.com/users",
      "method": "GET",
      "retries": 3,
      "description": "Fetch user data"
    },
    "Process the fetched data using LLM"
  ],
  "provider": "openai"
}
```

## Configuration

### Request Parameters

- `url` (required): External API URL to call
- `method` (optional): HTTP method (default: GET)
- `headers` (optional): Custom headers
- `body` (optional): Request body (for POST, PUT, PATCH)
- `retries` (optional): Number of retry attempts (default: 3)
- `retryDelay` (optional): Delay between retries in milliseconds (default: 1000)
- `timeout` (optional): Request timeout in milliseconds (default: 30000)

### Response Format

```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "headers": {},
  "body": {},
  "attempts": 1,
  "duration": 123
}
```

## Error Handling

The endpoint workers automatically retry failed requests with exponential backoff. If all retries are exhausted, the response will include:

```json
{
  "success": false,
  "status": 500,
  "statusText": "Internal Server Error",
  "error": "Error message",
  "attempts": 3,
  "duration": 5000
}
```

## Integration with Workflow Engine

The workflow engine automatically handles endpoint instructions:

1. When an endpoint instruction is encountered, it calls the specified endpoint worker
2. The endpoint worker makes the external API call with retry logic
3. The response is converted to a string and passed to the next step
4. Subsequent LLM steps can process the API response

## Local Development

```bash
cd endpoint-1
npm run dev
```

The worker will be available at `http://localhost:8787`

## Testing

```bash
cd endpoint-1
npm test
```

