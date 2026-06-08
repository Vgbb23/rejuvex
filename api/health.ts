import type { VercelRequest, VercelResponse } from "@vercel/node";

/** GET /api/health — confirma que as rotas serverless da raiz do repo estão ativas na Vercel. */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }
  res.status(200).json({
    ok: true,
    service: "zencialnovo",
    time: new Date().toISOString(),
  });
}
