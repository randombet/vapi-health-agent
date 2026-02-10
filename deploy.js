/**
 * Vapi Health Check-In Agent - Deployment Script
 * 
 * This script creates a complete health check-in voice agent with:
 * - Google Sheets logging
 * - Automated follow-up call scheduling
 * - Emergency alert capability
 * 
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. Run: node deploy.js
 */

require('dotenv').config();

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

if (!VAPI_API_KEY) {
  console.error('❌ VAPI_API_KEY is required in .env');
  process.exit(1);
}

const VAPI_BASE_URL = 'https://api.vapi.ai';

async function vapiRequest(endpoint, method = 'GET', body = null) {
  const response = await fetch(`${VAPI_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : null
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`API Error: ${JSON.stringify(data)}`);
  }
  return data;
}

// ============================================
// TOOL DEFINITIONS
// ============================================

const LOG_HEALTH_STATUS_CODE = `const crypto = require('crypto');

const { overall_status, symptoms_reported, notes, followup_scheduled } = args;
const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, SPREADSHEET_ID } = env;

function createJWT(email, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signatureInput = \`\${base64Header}.\${base64Payload}\`;
  
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(privateKey, 'base64url');
  
  return \`\${signatureInput}.\${signature}\`;
}

async function getAccessToken() {
  const jwt = createJWT(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: \`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=\${jwt}\`
  });
  
  return await response.json();
}

const tokenResponse = await getAccessToken();
if (tokenResponse.error) {
  return { error: 'Failed to authenticate with Google', details: tokenResponse.error };
}

const timestamp = new Date().toISOString();
const values = [timestamp, overall_status || '', symptoms_reported || '', notes || '', followup_scheduled || ''];

const url = \`https://sheets.googleapis.com/v4/spreadsheets/\${SPREADSHEET_ID}/values/Sheet1:append?valueInputOption=USER_ENTERED\`;

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${tokenResponse.access_token}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ values: [values] })
});

const result = await response.json();

if (result.error) {
  return { error: 'Failed to append to sheet', details: result.error };
}

return { success: true, message: 'Health status logged successfully', updatedCells: result.updates?.updatedCells };`;

const SCHEDULE_FOLLOWUP_CODE = `const { customer_name, minutes_from_now, reason } = args;
const { VAPI_API_KEY, ASSISTANT_ID, PHONE_NUMBER_ID, CUSTOMER_PHONE } = env;

// Calculate scheduled time
const scheduledTime = new Date(Date.now() + minutes_from_now * 60 * 1000).toISOString();

// Create the scheduled call via Vapi API
const response = await fetch('https://api.vapi.ai/call', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${VAPI_API_KEY}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    assistantId: ASSISTANT_ID,
    phoneNumberId: PHONE_NUMBER_ID,
    customer: { 
      number: CUSTOMER_PHONE,
      name: customer_name || undefined
    },
    schedulePlan: {
      earliestAt: scheduledTime
    }
  })
});

const result = await response.json();

if (!response.ok) {
  return { 
    success: false, 
    error: result.message || 'Failed to schedule call' 
  };
}

return { 
  success: true, 
  message: \`Follow-up call scheduled for \${minutes_from_now} minutes from now\`,
  scheduledTime: scheduledTime,
  callId: result.id
};`;

const SYSTEM_PROMPT = `[Identity]
You are a warm and caring AI Health Check-In Assistant, like a compassionate nurse, calling customers to check on their health status.

[Style]
- Use a caring and empathetic tone, making the user feel heard and understood.
- Keep sentences short and conversational, suitable for voice interaction.
- Reassure customers with a calming voice, as needed.

[Response Guidelines]
- Begin responses with empathetic affirmations.
- Avoid medical jargon unless necessary, explaining terms in simple language.
- Maintain a supportive and non-alarming demeanor, even when prompting escalation.

[Task & Goals]
1. Greet the user warmly and ask how they are feeling today.
2. Inquire about any symptoms or recent changes in their health.
3. If the user mentions symptoms, use empathetic language to acknowledge their concerns.
4. Decide whether to reassure the customer or if the situation requires escalation:
   - If the symptoms are mild or typical, reassure them and offer general advice.
   - If serious symptoms are mentioned (chest pain, difficulty breathing, severe pain):
     - Call 'send_alert' immediately to notify health professionals.
     - Offer reassurance until professional assistance is provided.
5. Ask if they would like to schedule a follow-up appointment.
6. If they agree to a follow-up, call 'schedule_followup'.

[CRITICAL - Logging Requirement]
7. **ALWAYS call 'log_health_status' before ending the call or saying goodbye.** This is mandatory for every call, regardless of whether the user wants a follow-up or not. Log the health status as soon as you have gathered enough information about how they're feeling. Do not wait for the user to hang up.

[Error Handling / Fallback]
- If the customer's answer is unclear, ask gentle, clarifying questions.
- If a technical issue arises, apologize empathetically and attempt to continue the conversation.`;

// ============================================
// DEPLOYMENT
// ============================================

async function deploy() {
  console.log('🚀 Deploying Health Check-In Agent to Vapi...\n');

  // Step 1: Create Phone Number (or use existing)
  let phoneNumberId = process.env.PHONE_NUMBER_ID;
  
  if (!phoneNumberId) {
    console.log('📞 Provisioning phone number...');
    const phoneNumber = await vapiRequest('/phone-number', 'POST', {
      provider: 'vapi'
    });
    phoneNumberId = phoneNumber.id;
    console.log(`   ✅ Phone Number ID: ${phoneNumberId}`);
    console.log(`   📱 Number: ${phoneNumber.number || '(provisioning...)'}\n`);
  } else {
    console.log(`📞 Using existing phone number: ${phoneNumberId}\n`);
  }

  // Step 2: Create Tools
  console.log('🛠️  Creating tools...');

  // Tool 1: log_health_status (Google Sheets)
  let logHealthTool;
  if (GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY && SPREADSHEET_ID) {
    logHealthTool = await vapiRequest('/tool', 'POST', {
      type: 'code',
      function: {
        name: 'log_health_status',
        description: 'Log the customer\'s health status and call summary to Google Sheets. Call this at the end of every health check-in call.',
        parameters: {
          type: 'object',
          properties: {
            overall_status: { type: 'string', description: 'Overall health status: good, fair, poor, or critical' },
            symptoms_reported: { type: 'string', description: 'Comma-separated list of symptoms the customer mentioned' },
            notes: { type: 'string', description: 'Summary notes from the conversation' },
            followup_scheduled: { type: 'string', description: 'Whether a follow-up was scheduled: yes or no' }
          },
          required: ['overall_status', 'notes']
        }
      },
      environmentVariables: [
        { name: 'GOOGLE_CLIENT_EMAIL', value: GOOGLE_CLIENT_EMAIL },
        { name: 'GOOGLE_PRIVATE_KEY', value: GOOGLE_PRIVATE_KEY },
        { name: 'SPREADSHEET_ID', value: SPREADSHEET_ID }
      ],
      code: LOG_HEALTH_STATUS_CODE
    });
    console.log(`   ✅ log_health_status (Google Sheets): ${logHealthTool.id}`);
  } else {
    // Fallback: placeholder function tool
    logHealthTool = await vapiRequest('/tool', 'POST', {
      type: 'function',
      function: {
        name: 'log_health_status',
        description: 'Log the customer\'s health status. (Placeholder - configure Google Sheets credentials to enable)',
        parameters: {
          type: 'object',
          properties: {
            overall_status: { type: 'string' },
            notes: { type: 'string' }
          },
          required: ['overall_status', 'notes']
        }
      }
    });
    console.log(`   ⚠️  log_health_status (placeholder - no Google credentials): ${logHealthTool.id}`);
  }

  // Tool 2: send_alert (placeholder)
  const sendAlertTool = await vapiRequest('/tool', 'POST', {
    type: 'function',
    function: {
      name: 'send_alert',
      description: 'Send an urgent alert to health professionals when a customer reports serious symptoms or a critical health concern. Use for chest pain, difficulty breathing, severe symptoms, or any emergency situation.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'The name of the customer' },
          alert_level: { type: 'string', enum: ['warning', 'urgent', 'critical'], description: 'Severity level of the alert' },
          symptoms: { type: 'array', items: { type: 'string' }, description: 'List of concerning symptoms reported' },
          description: { type: 'string', description: 'Description of the health concern' }
        },
        required: ['alert_level', 'description']
      }
    }
  });
  console.log(`   ✅ send_alert (placeholder): ${sendAlertTool.id}`);

  // Step 3: Create Assistant (without schedule_followup for now)
  console.log('\n🤖 Creating assistant...');
  
  const assistant = await vapiRequest('/assistant', 'POST', {
    name: 'Health Check-In Agent',
    firstMessage: 'Hi there! This is your health check-in call. I just wanted to reach out and see how you\'re doing today. How are you feeling?',
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }],
      toolIds: [logHealthTool.id, sendAlertTool.id]
    },
    voice: {
      provider: '11labs',
      voiceId: 'sarah'
    },
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en'
    }
  });
  console.log(`   ✅ Assistant ID: ${assistant.id}`);

  // Tool 3: schedule_followup (needs assistant ID)
  const scheduleFollowupTool = await vapiRequest('/tool', 'POST', {
    type: 'code',
    function: {
      name: 'schedule_followup',
      description: 'Schedule a follow-up call for the customer. Use when the customer agrees to a follow-up call. The call will be automatically placed at the scheduled time.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'The name of the customer' },
          minutes_from_now: { type: 'number', description: 'How many minutes from now to schedule the call. For example: 5 for 5 minutes, 60 for 1 hour, 1440 for 1 day.' },
          reason: { type: 'string', description: 'Reason for the follow-up appointment' }
        },
        required: ['minutes_from_now', 'reason']
      }
    },
    environmentVariables: [
      { name: 'VAPI_API_KEY', value: VAPI_API_KEY },
      { name: 'ASSISTANT_ID', value: assistant.id },
      { name: 'PHONE_NUMBER_ID', value: phoneNumberId },
      { name: 'PHONE', value: 'call.customer.number}}' }
    ],
    code: SCHEDULE_FOLLOWUP_CODE
  });
  console.log(`   ✅ schedule_followup: ${scheduleFollowupTool.id}`);

// Step 4: Update assistant with all tools including schedule_followup
  console.log('\n🔗 Linking all tools to assistant...');
  await vapiRequest(`/assistant/${assistant.id}`, 'PATCH', {
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }],
      toolIds: [logHealthTool.id, scheduleFollowupTool.id, sendAlertTool.id]
    }
  });
  console.log('   ✅ All tools linked');

  // Step 5: Summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ DEPLOYMENT COMPLETE');
  console.log('='.repeat(50));
  console.log(`
📋 Resources Created:

   Assistant:
   - ID: ${assistant.id}
   - Name: Health Check-In Agent

   Tools:
   - log_health_status: ${logHealthTool.id}
   - schedule_followup: ${scheduleFollowupTool.id}
   - send_alert: ${sendAlertTool.id}

   Phone Number:
   - ID: ${phoneNumberId}

🚀 To make an outbound call:

   curl -X POST "https://api.vapi.ai/call" \\
     -H "Authorization: Bearer ${VAPI_API_KEY.slice(0, 8)}..." \\
     -H "Content-Type: application/json" \\
     -d '{
       "assistantId": "${assistant.id}",
       "phoneNumberId": "${phoneNumberId}",
       "customer": { "number": "+1XXXXXXXXXX" }
     }'

📝 Don't forget to:
   1. Add headers to your Google Sheet: timestamp | overall_status | symptoms_reported | notes | followup_scheduled
   2. Share your Google Sheet with: ${GOOGLE_CLIENT_EMAIL || '(configure GOOGLE_CLIENT_EMAIL)'}
   3. Configure a webhook server for send_alert if you want real alerts
`);

  return {
    assistantId: assistant.id,
    phoneNumberId,
    toolIds: {
      logHealthStatus: logHealthTool.id,
      scheduleFollowup: scheduleFollowupTool.id,
      sendAlert: sendAlertTool.id
    }
  };
}

// Run deployment
deploy().catch(error => {
  console.error('❌ Deployment failed:', error.message);
  process.exit(1);
});
