import { defineConfig } from "@trigger.dev/sdk"

function requireProjectRef(): string {
  const projectRef = process.env.TRIGGER_PROJECT_REF?.trim()
  if (!projectRef) {
    throw new Error(
      "TRIGGER_PROJECT_REF is required to run the Trigger.dev development worker",
    )
  }

  return projectRef
}

export default defineConfig({
  project: requireProjectRef(),
  dirs: ["./trigger"],
  maxDuration: 60,
})
