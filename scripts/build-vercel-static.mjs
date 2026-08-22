import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const port = "4173";
const origin = `http://127.0.0.1:${port}`;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function waitForPage() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${origin}/`);
      if (response.ok) return response.text();
    } catch {
      // The local renderer has not started yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out while rendering the static Vercel entry page.");
}

await run("npx", ["vinext", "build"], { env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" } });

const renderer = spawn("npx", ["vinext", "start", "--port", port], {
  env: { ...process.env, PORT: port, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
  stdio: "inherit",
});

try {
  const html = await waitForPage();
  await rm("vercel-dist", { recursive: true, force: true });
  await mkdir("vercel-dist", { recursive: true });
  await cp("dist/client", "vercel-dist", { recursive: true });
  await writeFile("vercel-dist/index.html", html);
} finally {
  renderer.kill("SIGTERM");
}
