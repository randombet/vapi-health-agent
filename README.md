# Vapi Health Check-In Agent

A voice AI agent that calls customers to check on their health status, logs data to Google Sheets, and can schedule follow-up calls automatically.

## Features

- 🩺 **Health Check-Ins**: Warm, caring voice agent asks about symptoms and well-being
- 📊 **Google Sheets Logging**: Automatically logs call summaries to a spreadsheet
- 📅 **Follow-Up Scheduling**: Schedules automated callback calls via Vapi
- 🚨 **Emergency Alerts**: Triggers alerts for serious symptoms (placeholder - add your webhook)

## Prerequisites

- Node.js 18+
- [Vapi Account](https://vapi.ai) with API key
- Google Cloud Service Account (for Sheets integration)
- A Google Sheet shared with the service account

## Demo
```
vapi assistant get 44c70365-7563-4f59-8d73-ebe978d954a6 > assistant.json
```

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/vapi-health-agent.git
   cd vapi-health-agent
   ```
2. **Install dependencies**
  ```bash
  npm install dotenv
  ```

3. **Configure environment variables**
  ```bash
  cp .env.example .env
  ```
Then edit .env with your credentials:
```
VAPI_API_KEY=your-vapi-private-api-key
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SPREADSHEET_ID=your-google-spreadsheet-id
```

4. **Prepare your Google Sheet**

Create a new Google Sheet
Add headers in row 1: timestamp | overall_status | symptoms_reported | notes | followup_scheduled
Share the sheet with your service account email (Editor access)

5. **Deploy**
  ```bash
  npm run deploy
  ```