import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handlePixChargePost } from "../lib/fruitfyBridge.js";
import { loadProjectEnv, parseJsonBody, sendJson } from "../lib/vercelHelpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  loadProjectEnv();
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { success: false, message: "Method not allowed" });
      return;
    }
    const out = await handlePixChargePost(parseJsonBody(req));
    sendJson(res, out.status, out.body);
  } catch (err) {
    console.error("[api/pix/charge]", err);
    if (!res.headersSent) {
      sendJson(res, 500, {
        success: false,
        message: "Erro interno no servidor. Tente novamente em instantes.",
      });
    }
  }
}
