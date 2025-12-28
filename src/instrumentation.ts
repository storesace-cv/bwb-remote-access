// Instrumentation hook kept lightweight to remain compatible with the Edge runtime used by Next.js.
// Node-specific bootstrap lives elsewhere (e.g., API routes and server-only modules).
export const runtime = "edge";

export async function register() {
  if (typeof console !== "undefined") {
    console.info("[instrumentation] Edge runtime active — skipping node-specific bootstrap tasks.");
  }
}
