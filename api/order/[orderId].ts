import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleOrderGet } from "../lib/fruitfyBridge.js";
import { loadProjectEnv, sendJson } from "../lib/vercelHelpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  loadProjectEnv();
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { success: false, message: "Method not allowed" });
      return;
    }
    const orderId = typeof req.query.orderId === "string" ? req.query.orderId : undefined;
    const out = await handleOrderGet(orderId);
    sendJson(res, out.status, out.body);
  } catch (err) {
    console.error("[api/order]", err);
    if (!res.headersSent) {
      sendJson(res, 500, {
        success: false,
        message: "Erro interno no servidor. Tente novamente em instantes.",
      });
    }
  }
}
