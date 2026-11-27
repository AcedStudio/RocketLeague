// qa only: integration tests and the Next build run side by side; the build fails if either fails.
import { spawn } from "node:child_process";

const run = (name, cmd, env = {}) =>
  new Promise((resolve) => {
    const started = Date.now();
    const p = spawn(cmd, { shell: true, stdio: "inherit", env: { ...process.env, ...env } });
    p.on("exit", (code) => {
      console.log(`[qa] ${name} finished in ${Math.round((Date.now() - started) / 1000)}s with code ${code}`);
      resolve(code ?? 1);
    });
  });

const [tests, build] = await Promise.all([
  run("integration tests", "tsx --conditions=react-server tests/integration.ts", { DATABASE_URL: process.env.QA_DATABASE_URL }),
  run("next build", "next build"),
]);
process.exit(tests || build ? 1 : 0);
