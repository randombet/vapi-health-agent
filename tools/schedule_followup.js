/**
 * Tool definition for scheduling a follow-up call with a patient.
 * After logging health status, the assistant can offer to schedule
 * a check-in call using Vapi's schedulePlan API.
 */

const definition = {
  type: "function",
  function: {
    name: "schedule_followup",
    description:
      "Schedule a follow-up phone call with the patient. Use this when the patient agrees to a check-in call or when their symptoms warrant a follow-up.",
    parameters: {
      type: "object",
      properties: {
        patientName: {
          type: "string",
          description: "Full name of the patient",
        },
        patientPhone: {
          type: "string",
          description: "Patient phone number in E.164 format",
        },
        followUpDate: {
          type: "string",
          description:
            "ISO 8601 datetime for the follow-up call (e.g. 2026-03-15T14:00:00Z)",
        },
        reason: {
          type: "string",
          description: "Reason for the follow-up call",
        },
      },
      required: ["patientName", "patientPhone", "followUpDate", "reason"],
    },
  },
};

/**
 * Handle the tool call by scheduling an outbound call via Vapi's API.
 */
async function handler(params) {
  const apiKey = process.env.VAPI_API_KEY;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  const response = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Use the same follow-up assistant (created in deploy.js)
      assistant: {
        name: "HealthFollowUp",
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: [
                `You are a friendly health follow-up agent calling ${params.patientName}.`,
                `Reason for this call: ${params.reason}.`,
                "Ask how they are feeling since your last check-in.",
                "Log their updated health status using the log_health_status tool.",
                "If symptoms have worsened, recommend they contact their doctor.",
                "Keep responses under 30 words.",
              ].join(" "),
            },
          ],
        },
        voice: {
          provider: "azure",
          voiceId: "andrew",
        },
        firstMessage: `Hi ${params.patientName}, this is your health check-in calling about: ${params.reason}. How have you been feeling?`,
        firstMessageMode: "assistant-speaks-first",
      },
      phoneNumberId,
      customer: {
        number: params.patientPhone,
        name: params.patientName,
      },
      schedulePlan: {
        earliestAt: params.followUpDate,
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("[schedule_followup] Error:", data);
    return { result: `Failed to schedule follow-up: ${data.message || "unknown error"}` };
  }

  console.log("[schedule_followup] Scheduled call:", data.id);
  return {
    result: `Follow-up call scheduled for ${params.patientName} on ${params.followUpDate}. Call ID: ${data.id}.`,
  };
}

module.exports = { definition, handler };
