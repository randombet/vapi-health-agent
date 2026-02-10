require("dotenv").config();

const express = require("express");
const logHealthStatus = require("./tools/log_health_status");
const scheduleFollowup = require("./tools/schedule_followup");

const app = express();
app.use(express.json());

const tools = {
  log_health_status: logHealthStatus.handler,
  schedule_followup: scheduleFollowup.handler,
};

/**
 * Vapi sends tool call webhooks as POST requests.
 * The request body contains:
 *   - message.type: "tool-calls"
 *   - message.toolCallList[]: array of { id, function: { name, arguments } }
 *
 * We must return { results: [{ toolCallId, result }] }
 */
app.post("/tool/:toolName", async (req, res) => {
  const { toolName } = req.params;
  const handler = tools[toolName];

  if (!handler) {
    return res.status(404).json({ error: `Unknown tool: ${toolName}` });
  }

  try {
    const toolCalls = req.body.message?.toolCallList || [];
    const results = [];

    for (const call of toolCalls) {
      const params =
        typeof call.function.arguments === "string"
          ? JSON.parse(call.function.arguments)
          : call.function.arguments;

      const result = await handler(params);
      results.push({ toolCallId: call.id, result: result.result });
    }

    return res.json({ results });
  } catch (err) {
    console.error(`[${toolName}] Error:`, err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Tool webhook server running on port ${port}`);
});
