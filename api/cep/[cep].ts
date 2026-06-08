import type { VercelRequest, VercelResponse } from "@vercel/node";
import { lookupCep } from "../lib/cepLookup.js";
import { sendJson } from "../lib/vercelHelpers.js";

/** GET /api/cep/:cep — busca endereço por CEP (BrasilAPI + ViaCEP, com cache). */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  const cep = String(req.query.cep ?? "");
  const result = await lookupCep(cep);

  if (result.ok) {
    sendJson(res, 200, { ok: true, ...result.data });
    return;
  }

  if (result.notFound) {
    sendJson(res, 404, { ok: false, notFound: true, message: "CEP não encontrado." });
    return;
  }

  sendJson(res, 502, { ok: false, message: "Não foi possível consultar o CEP." });
}
