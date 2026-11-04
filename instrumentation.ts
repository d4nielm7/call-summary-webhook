export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DEMO_MODE !== "1") return;

  console.log("\n  Demo mode, all data is fictional. Open the Local URL above.\n");

  if (process.env.DEMO_LIVE !== "0") {
    const { startLiveSimulation } = await import("./lib/demo/runtime");
    startLiveSimulation();
  }
}
