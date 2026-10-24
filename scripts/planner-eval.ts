import { randomUUID } from "node:crypto";
import { planConversation } from "../src/server/ai/planner";
import { plannerProblems, type PlannerSnapshot } from "../src/domain/planner";

async function main() {
  const snapshot: PlannerSnapshot = { id: randomUUID(), messages: [{ role: "user", content: "I am Ana. I want a relaxed birthday getaway to Oaxaca, Mexico, from March 1 to March 4, 2027. I love food and culture. Suggest a few things, with plenty of free time." }], draft: null, suggestions: [] };
  const reply = await planConversation(snapshot, { name: "Ana", homeTz: "America/Los_Angeles" });
  if (!reply) throw new Error("Configure GEMINI_API_KEY to run this evaluation.");
  const problems = plannerProblems(reply.draft, "Ana");
  console.log(JSON.stringify({ message: reply.message, destination: reply.draft.destination, startDate: reply.draft.startDate, endDate: reply.draft.endDate, items: reply.draft.items.length, problems }, null, 2));
  if (problems.length || !reply.draft.items.length) process.exitCode = 1;
}

main().catch((error) => {
  const clean = (value: unknown) => String(value || "").replaceAll(process.env.GEMINI_API_KEY || "__missing__", "[redacted]").slice(0, 2400);
  console.error(JSON.stringify({ name: error.name, status: error.statusCode, message: clean(error.message), response: clean(error.responseBody), cause: error.cause ? { name: error.cause.name, message: clean(error.cause.message) } : null }));
  process.exitCode = 1;
});
