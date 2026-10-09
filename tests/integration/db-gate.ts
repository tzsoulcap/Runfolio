import net from "node:net";

function tcpOk(host: string, port: number, ms = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (v: boolean) => {
      socket.destroy();
      resolve(v);
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.setTimeout(ms);
  });
}

export async function dbReachable(): Promise<boolean> {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) return false;
  try {
    const { hostname, port } = new URL(raw);
    return await tcpOk(hostname, Number(port) || 5432);
  } catch {
    return false;
  }
}

// Skips (loudly) only when Postgres is unreachable, e.g. sandboxed env.
// A skip is NOT a pass: run with DB access for a real result.
export const canRunDb = await dbReachable();
if (!canRunDb) {
  console.warn(
    "SKIP integration: Postgres unreachable — NOT verified, run with DB access.",
  );
}
