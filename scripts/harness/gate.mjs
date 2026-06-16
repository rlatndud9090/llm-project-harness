#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  ["npm", ["run", "harness:check"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "test:run"]],
];

for (const [command, args] of steps) {
  console.log(`[harness:gate] ${command} ${args.join(" ")}`);

  // The test step runs with --passWithNoTests, so a project with zero tests
  // exits 0 and looks identical to a real pass. Capture its output, surface a
  // WARNING when no tests were collected, and require the report to disclose it.
  if (args.includes("test:run")) {
    const result = spawnSync(command, args, { encoding: "utf8" });
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
    if (/no test files found/i.test(`${result.stdout ?? ""}${result.stderr ?? ""}`)) {
      console.log(
        "[harness:gate] WARNING: no tests collected (test:run passed via --passWithNoTests). Disclose this in the report and the commit Not-tested: trailer.",
      );
    }
    continue;
  }

  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("[harness:gate] ok");
