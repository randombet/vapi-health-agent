/**
 * Tool definition for logging a patient's health status during a call.
 * The assistant collects symptoms, mood, and vitals from the conversation
 * and calls this tool to persist the record.
 */

const definition = {
  type: "function",
  function: {
    name: "log_health_status",
    description:
      "Log the patient's current health status. Call this after collecting symptoms, mood, and any vitals from the patient.",
    parameters: {
      type: "object",
      properties: {
        patientName: {
          type: "string",
          description: "Full name of the patient",
        },
        patientPhone: {
          type: "string",
          description: "Patient phone number in E.164 format (e.g. +11234567890)",
        },
        symptoms: {
          type: "array",
          items: { type: "string" },
          description: "List of symptoms the patient reported",
        },
        mood: {
          type: "string",
          enum: ["good", "fair", "poor"],
          description: "Patient's self-reported mood",
        },
        notes: {
          type: "string",
          description: "Any additional notes from the conversation",
        },
      },
      required: ["patientName", "patientPhone", "symptoms", "mood"],
    },
  },
};

/**
 * Handle the tool call from Vapi's webhook.
 * In production, replace the console.log with a database write or EHR API call.
 */
function handler(params) {
  const record = {
    ...params,
    timestamp: new Date().toISOString(),
  };

  // Replace with your database / EHR integration
  console.log("[log_health_status] Recorded:", JSON.stringify(record, null, 2));

  return {
    result: `Health status logged for ${params.patientName}. Symptoms: ${params.symptoms.join(", ")}. Mood: ${params.mood}.`,
  };
}

module.exports = { definition, handler };
