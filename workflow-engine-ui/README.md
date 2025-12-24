# Cloudflare Workflow Station UI

A modern web interface for interacting with Cloudflare Workflows that process context through OpenAI LLM in two steps.

## Features

- **Two-Step LLM Processing**: Process context through GPT-5-nano with sequential instructions
- **Real-time Status Updates**: Automatic polling to track workflow progress
- **Results Display**: View both intermediate and final results
- **Model Selection**: Choose between GPT-5-nano variants or GPT-4o-mini
- **Configurable API URL**: Connect to local or deployed Cloudflare Workers

## Prerequisites

1. **Cloudflare Workflow Backend**: Make sure your Cloudflare Worker is running
   - Local development: `http://localhost:8788`
   - Or your deployed Worker URL

2. **Node.js**: Version 18 or higher

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Development Server

```bash
npm run dev
```

### 3. Open the Application

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Starting a Workflow

1. **Configure API URL**: Enter your Cloudflare Worker URL (default: `http://localhost:8788`)

2. **Enter Context**: Provide the text/content you want to process

3. **First Instruction**: Specify what the LLM should do with the context
   - Example: "Summarize this text in one sentence."

4. **Second Instruction**: Specify what the LLM should do with the first result
   - Example: "Rewrite the summary to be more formal."

5. **Select Model**: Choose from:
   - GPT-5 Nano (default)
   - GPT-5 Nano (2025-08-07)
   - GPT-4o Mini

6. **Start Workflow**: Click "Start Workflow" to begin processing

### Monitoring Workflow Status

- The UI automatically polls for status updates every 2 seconds
- Status indicators:
  - 🟡 **QUEUED**: Workflow is waiting to start
  - 🔵 **RUNNING**: Workflow is processing (with animated indicator)
  - 🟢 **COMPLETE**: Workflow finished successfully
  - 🔴 **ERRORED**: Workflow encountered an error

### Viewing Results

Once complete, you'll see:
- **Step 1 Result**: The output from the first LLM call
- **Step 2 Result**: The final output after processing the first result
- **Original Context**: The input you provided

## API Integration

The UI communicates with the Cloudflare Workflow API:

### Start Workflow
```http
POST / HTTP/1.1
Content-Type: application/json

{
  "context": "Your context here",
  "firstInstruction": "First instruction",
  "secondInstruction": "Second instruction",
  "model": "gpt-5-nano"
}
```

### Check Status
```http
GET /?instanceId=<instance-id>
```

## Project Structure

```
workflow-engine-ui/
├── app/
│   ├── page.tsx          # Main workflow UI component
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── package.json
└── README.md
```

## Development

### Build for Production

```bash
npm run build
npm start
```

### Environment Variables

You can configure the default API URL by setting:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8788
```

## Troubleshooting

### Workflow Not Starting
- Verify the Cloudflare Worker is running
- Check the API URL is correct
- Ensure the Worker has the `OPENAI_API_KEY` secret configured

### Status Not Updating
- Check browser console for errors
- Verify network connectivity to the API
- Ensure the instance ID is valid

### Workflow Errors
- Check Cloudflare Worker logs
- Verify OpenAI API key is valid
- Ensure model name is correct

## Related Projects

- **Cloudflare Workflow Backend**: `/workflow-engine` - The workflow implementation
- **Workflow Engine**: `/workflow-engine` - Python-based workflow engine

## License

MIT
