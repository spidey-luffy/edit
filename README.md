# TripXplo AI - Travel Assistant

A chat-based AI travel assistant built with Next.js 14, TypeScript, and OpenAI GPT.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env.local`:
```
OPENAI_API_KEY=your_openai_api_key_here
TRIPXPLO_EMAIL=tour@tripmilestone.com
TRIPXPLO_PASSWORD=tripxplo_admin_password
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Test the Assistant

Try asking questions like:
- "Can you show me some adventure packages from TripXplo?"
- "What travel packages do you have?"
- "Show me some Himachal packages"

## Debug

If the Ai is not working, check the console for errors.

## Architecture

- **Frontend**: Next.js 14 with App Router, TailwindCSS
- **Backend**: Next.js API routes
- **AI**: OpenAI GPT with function calling
- **API**: TripXplo REST API integration

## Project Structure

```
├── app/
│   ├── components/          # React components
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Home page
├── lib/
│   ├── ai/                 # AI integration
│   │   ├── ai.ts      # OpenAI GPT client
│   │   └── tools.ts        # Tool definitions
│   └── api/                # API clients
│       └── tripxplo.ts     # TripXplo API client
└── pages/api/
    └── ai-agent.ts   
    └── welcome.ts       # AI agent API route
```
