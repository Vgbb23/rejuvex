import type { VercelRequest, VercelResponse } from "@vercel/node";
import { config } from "dotenv";
import { existsSync } from "fs";
import { join } from "path";

/** Carrega .env da pasta do app (útil em dev local; na Vercel usam-se as env do painel). */
export function loadProjectEnv(): void {
  try {
    const envDir = join(process.cwd(), "envy-skin-clone");
    if (existsSync(join(envDir, ".env"))) config({ path: join(envDir, ".env") });
    if (existsSync(join(envDir, ".env.local"))) config({ path: join(envDir, ".env.local"), override: true });
  } catch {
    /* noop */
  }
}

/** Corpo JSON em serverless (objeto, string ou Buffer). */
export function parseJsonBody(req: VercelRequest): unknown {
  const b = req.body as unknown;
  if (b == null) return {};
  if (typeof b === "object" && !Buffer.isBuffer(b)) return b;
  const raw = Buffer.isBuffer(b) ? b.toString("utf8") : String(b);
  const t = raw.trim();
  if (!t) return {};
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return {};
  }
}

export function sendJson(res: VercelResponse, status: number, data: unknown): void {
  try {
    res.status(status).json(data);
  } catch (err) {
    console.error("[sendJson] falha ao serializar resposta", err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Erro interno ao preparar a resposta.",
      });
    }
  }
}
