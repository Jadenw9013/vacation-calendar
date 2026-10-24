import { createServer } from "node:http";

// A separate origin for production history tests; never accepts credentials.
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
  response.end("<!doctype html><title>External sign-in fixture</title><h1>External sign-in fixture</h1>");
});
server.listen(3301, "127.0.0.1");
process.on("SIGTERM", () => server.close());
