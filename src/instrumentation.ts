/**
 * Runs once when a server starts. Refuses to start with a model setting the
 * model would reject on every request (an unsupported thinking level).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkModelSettings } = await import("@/lib/llm/config");
  const problem = checkModelSettings();
  if (problem) throw new Error(`Planner model settings: ${problem}`);
}
