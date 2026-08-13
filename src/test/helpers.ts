import { createServer, request as httpRequest, type Server } from "node:http";
import { connect as tcpConnect } from "node:net";

export interface TestProxy {
  server: Server;
  port: number;
  hits: () => number;
  close: () => Promise<void>;
}

/**
 * Minimal forward proxy for tests. undici's `ProxyAgent` tunnels everything via
 * HTTP CONNECT, so the proxy must bridge the CONNECTed socket to the target.
 */
export async function startForwardProxy(): Promise<TestProxy> {
  let count = 0;
  const server = createServer((req, res) => {
    // Absolute-form fallback for proxies that don't tunnel.
    const target = new URL(req.url ?? "", "http://invalid");
    count += 1;
    const upstream = httpRequest(
      target,
      { method: req.method, headers: req.headers },
      (pres) => {
        res.writeHead(pres.statusCode ?? 200, pres.headers);
        pres.pipe(res);
      },
    );
    req.pipe(upstream);
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
  });

  server.on("connect", (req, clientSocket, head) => {
    count += 1;
    const target = new URL(`http://${req.url}`);
    const serverSocket = tcpConnect(Number(target.port), target.hostname, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });
    serverSocket.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => serverSocket.destroy());
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  return {
    server,
    port: addr && typeof addr === "object" ? addr.port : 0,
    hits: () => count,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
