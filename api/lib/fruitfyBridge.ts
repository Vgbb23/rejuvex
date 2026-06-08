/** Lógica Fruitfy: Express (dev) + rotas serverless Vercel — fica em `api/lib` para o bundle ESM da Vercel resolver o módulo. */

async function readJsonFromResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  const t = text.trim();
  if (!t) return {};
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return { __nonJson: true, __preview: t.slice(0, 240) };
  }
}

function getEnv() {
  return {
    FRUITFY_API_BASE_URL: process.env.FRUITFY_API_BASE_URL || "https://api.fruitfy.io",
    FRUITFY_PIX_CHARGE_PATH: process.env.FRUITFY_PIX_CHARGE_PATH || "/api/pix/charge",
    FRUITFY_TOKEN: process.env.FRUITFY_TOKEN,
    FRUITFY_STORE_ID: process.env.FRUITFY_STORE_ID,
    FRUITFY_PRODUCT_ID: process.env.FRUITFY_PRODUCT_ID,
  };
}

function unwrapChargeData(responseJson: unknown): Record<string, unknown> {
  if (!responseJson || typeof responseJson !== "object") return {};
  const r = responseJson as { data?: unknown };
  let d: unknown = r.data ?? responseJson;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d) as unknown;
    } catch {
      return {};
    }
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) return {};
  return { ...(d as object) } as Record<string, unknown>;
}

function pickOrderUuid(obj: Record<string, unknown>): string | undefined {
  const direct = obj.uuid ?? obj.order_uuid;
  if (typeof direct === "string" && direct.length > 8) return direct;
  const order = obj.order;
  if (order && typeof order === "object" && order !== null) {
    const o = order as Record<string, unknown>;
    const id = o.uuid ?? o.id;
    if (typeof id === "string" && id.length > 8) return id;
  }
  return undefined;
}

function responseMightContainPixEmv(obj: unknown): boolean {
  try {
    return JSON.stringify(obj).includes("000201");
  } catch {
    return false;
  }
}

async function fetchFruitfyOrder(uuid: string): Promise<Record<string, unknown> | null> {
  const { FRUITFY_API_BASE_URL, FRUITFY_TOKEN, FRUITFY_STORE_ID } = getEnv();
  if (!FRUITFY_TOKEN || !FRUITFY_STORE_ID) return null;
  const r = await fetch(`${FRUITFY_API_BASE_URL}/api/order/${encodeURIComponent(uuid)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${FRUITFY_TOKEN}`,
      "Store-Id": FRUITFY_STORE_ID,
      Accept: "application/json",
      "Accept-Language": "pt_BR",
    },
  });
  if (!r.ok) return null;
  const parsed = await readJsonFromResponse(r);
  if (parsed && typeof parsed === "object" && (parsed as { __nonJson?: boolean }).__nonJson) return null;
  const j = parsed as { data?: unknown };
  const d = j?.data ?? j;
  if (d && typeof d === "object" && !Array.isArray(d)) return { ...(d as object) } as Record<string, unknown>;
  return null;
}

const pickValidUtm = (utm: Record<string, unknown> | undefined) => {
  if (!utm) return undefined;
  const entries = Object.entries(utm).filter(([, value]) => typeof value === "string" && value.trim().length > 0);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};

function mergeTrackingPayload(utm: unknown, urlParams: unknown): Record<string, unknown> | undefined {
  const a =
    utm && typeof utm === "object" && !Array.isArray(utm) ? (utm as Record<string, unknown>) : {};
  const b =
    urlParams && typeof urlParams === "object" && !Array.isArray(urlParams)
      ? (urlParams as Record<string, unknown>)
      : {};
  const merged = { ...b, ...a };
  return Object.keys(merged).length ? merged : undefined;
}

/** Doc Fruitfy: telefone só dígitos, ex. `5511999999999` (DDI 55 + DDD + número). */
function normalizeFruitfyPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return d;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

export async function handlePixChargePost(body: unknown): Promise<{ status: number; body: unknown }> {
  try {
    const { FRUITFY_TOKEN, FRUITFY_STORE_ID, FRUITFY_PRODUCT_ID, FRUITFY_API_BASE_URL, FRUITFY_PIX_CHARGE_PATH } =
      getEnv();
    if (!FRUITFY_TOKEN || !FRUITFY_STORE_ID || !FRUITFY_PRODUCT_ID) {
      return {
        status: 500,
        body: {
          success: false,
          message:
            "Configuração da Fruitfy incompleta. Verifique FRUITFY_TOKEN, FRUITFY_STORE_ID e FRUITFY_PRODUCT_ID.",
        },
      };
    }

    const reqBody = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const { name, email, cpf, phone, amount, quantity, utm, urlParams: urlParamsBody } = reqBody;

    if (!name || !email || !cpf || !phone || !amount) {
      return {
        status: 400,
        body: {
          success: false,
          message: "Campos obrigatórios ausentes: name, email, cpf, phone, amount.",
        },
      };
    }

    const parsedAmount = Number(amount);
    const parsedQuantity = Number(quantity || 1);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return {
        status: 422,
        body: {
          success: false,
          message: "Valor inválido. Envie o amount em centavos.",
        },
      };
    }

    const tracking = mergeTrackingPayload(utm, urlParamsBody);
    const fruitfyBody: Record<string, unknown> = {
      name: String(name),
      email: String(email),
      cpf: String(cpf).replace(/\D/g, ""),
      phone: normalizeFruitfyPhone(String(phone)),
      items: [
        {
          id: FRUITFY_PRODUCT_ID,
          value: Math.round(parsedAmount),
          quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1,
        },
      ],
    };
    const utmClean = pickValidUtm(tracking);
    if (utmClean) fruitfyBody.utm = utmClean;

    const fruitfyHeaders = {
      Authorization: `Bearer ${FRUITFY_TOKEN}`,
      "Store-Id": FRUITFY_STORE_ID,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Language": "pt_BR",
    } as const;

    let gatewayResponse = await fetch(`${FRUITFY_API_BASE_URL}${FRUITFY_PIX_CHARGE_PATH}`, {
      method: "POST",
      headers: { ...fruitfyHeaders },
      body: JSON.stringify(fruitfyBody),
    });

    if (gatewayResponse.status === 404 && FRUITFY_PIX_CHARGE_PATH !== "/pix/charge") {
      gatewayResponse = await fetch(`${FRUITFY_API_BASE_URL}/pix/charge`, {
        method: "POST",
        headers: { ...fruitfyHeaders },
        body: JSON.stringify(fruitfyBody),
      });
    }

    const responseJson = (await readJsonFromResponse(gatewayResponse)) as {
      success?: boolean;
      message?: string;
      data?: unknown;
      errors?: unknown;
      __nonJson?: boolean;
    };

    if (responseJson && typeof responseJson === "object" && responseJson.__nonJson) {
      return {
        status: 502,
        body: {
          success: false,
          message:
            "A API da Fruitfy devolveu uma resposta inválida. Confira FRUITFY_TOKEN, Store e Product no painel da Vercel.",
        },
      };
    }

    if (!gatewayResponse.ok) {
      return {
        status: gatewayResponse.status,
        body: {
          success: false,
          message: responseJson?.message || "Erro ao criar cobrança PIX na Fruitfy.",
          errors: responseJson?.errors || null,
        },
      };
    }

    let merged = unwrapChargeData(responseJson);
    const orderUuid = pickOrderUuid(merged);

    if (orderUuid && !responseMightContainPixEmv(merged)) {
      const orderData = await fetchFruitfyOrder(orderUuid);
      if (orderData) merged = { ...merged, ...orderData };
    }

    return {
      status: 201,
      body: {
        success: true,
        message: "Cobrança PIX gerada com sucesso.",
        data: merged,
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        success: false,
        message: "Erro interno ao integrar com a Fruitfy.",
        error: error instanceof Error ? error.message : "unknown_error",
      },
    };
  }
}

export async function handleOrderGet(orderIdRaw: string | undefined): Promise<{ status: number; body: unknown }> {
  try {
    const { FRUITFY_TOKEN, FRUITFY_STORE_ID } = getEnv();
    if (!FRUITFY_TOKEN || !FRUITFY_STORE_ID) {
      return {
        status: 500,
        body: {
          success: false,
          message: "Configuração da Fruitfy incompleta.",
        },
      };
    }
    const orderId = orderIdRaw?.trim();
    if (!orderId || orderId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(orderId)) {
      return {
        status: 400,
        body: {
          success: false,
          message: "ID do pedido inválido.",
        },
      };
    }
    const data = await fetchFruitfyOrder(orderId);
    if (!data) {
      return {
        status: 404,
        body: {
          success: false,
          message: "Pedido não encontrado.",
        },
      };
    }
    return {
      status: 200,
      body: {
        success: true,
        data,
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        success: false,
        message: "Erro ao consultar pedido na Fruitfy.",
        error: error instanceof Error ? error.message : "unknown_error",
      },
    };
  }
}

/** Catálogo de preços dos kits — reexportado junto ao bridge para manter uma única fonte na API. */
export {
  KIT_CATALOG,
  formatBRL,
  installment12Label,
  listPriceBRLFromKit,
} from "./kitPrices.js";
