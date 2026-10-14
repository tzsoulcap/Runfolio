// Development-only, read-only UI prototype on the existing /goals path.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

if (process.env.NODE_ENV === "production") {
  throw new Error("This throwaway prototype is for development only.");
}
const html = await readFile(fileURLToPath(new URL("../src/features/goals/goal-progress.prototype.html", import.meta.url)));
const port = Number(process.env.PROTOTYPE_PORT ?? 3030);
createServer((request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  if (path !== "/goals" && path !== "/") {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html);
}).listen(port, "0.0.0.0", () => {
  console.log(`Goal UI prototype: http://localhost:${port}/goals?variant=A`);
});
