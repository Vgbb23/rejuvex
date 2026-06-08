import 'dotenv/config';
import express from 'express';

const app = express();

app.use(express.json({limit: '1mb'}));

const apiPort = Number(process.env.API_PORT || 3001);
const fruitfyBaseUrl = (process.env.FRUITFY_API_BASE_URL || 'https://api.fruitfy.io').replace(/\/+$/, '');
const fruitfyToken = process.env.FRUITFY_TOKEN;
const fruitfyStoreId = process.env.FRUITFY_STORE_ID;
const fruitfyProductId = process.env.FRUITFY_PRODUCT_ID;
const pixChargePath = process.env.FRUITFY_PIX_CHARGE_PATH || '/api/pix/charge';

type JsonObject = Record<string, unknown>;

function digitsOnly(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeBrazilPhone(value: unknown) {
  const digits = digitsOnly(value);

  if (digits.startsWith('55')) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Variavel de ambiente ausente: ${name}`);
  }
  return value;
}

function headers() {
  return {
    Authorization: `Bearer ${requiredEnv('FRUITFY_TOKEN', fruitfyToken)}`,
    'Store-Id': requiredEnv('FRUITFY_STORE_ID', fruitfyStoreId),
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Language': 'pt_BR',
  };
}

async function readFruitfyResponse(response: Response) {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      message: `Resposta invalida da Fruitfy (HTTP ${response.status}).`,
      raw: text,
    };
  }
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function getNestedString(source: unknown, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = source;

    for (const key of path) {
      current = asObject(current)[key];
    }

    if (typeof current === 'string' && current.trim()) {
      return current.trim();
    }
  }
}

function getNestedNumber(source: unknown, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = source;

    for (const key of path) {
      current = asObject(current)[key];
    }

    if (typeof current === 'number' && Number.isFinite(current)) {
      return current;
    }

    if (typeof current === 'string' && /^\d+$/.test(current)) {
      return Number(current);
    }
  }
}

function normalizePixResponse(raw: unknown, requestedAmount: number) {
  const root = asObject(raw);
  const data = asObject(root.data);
  const order = asObject(data.order ?? root.order);
  const pix = asObject(data.pix ?? root.pix ?? order.pix);
  const payment = asObject(data.payment ?? root.payment ?? order.payment);

  const searchRoot = {root, data, order, pix, payment};
  const pixCode = getNestedString(searchRoot, [
    ['root', 'pixCode'],
    ['root', 'pix_code'],
    ['root', 'copy_paste'],
    ['root', 'copyPaste'],
    ['root', 'qrcode'],
    ['root', 'qr_code'],
    ['data', 'pixCode'],
    ['data', 'pix_code'],
    ['data', 'copy_paste'],
    ['data', 'copyPaste'],
    ['data', 'qrcode'],
    ['data', 'qr_code'],
    ['pix', 'code'],
    ['pix', 'pixCode'],
    ['pix', 'pix_code'],
    ['pix', 'copy_paste'],
    ['pix', 'qrcode'],
    ['pix', 'qr_code'],
    ['payment', 'pixCode'],
    ['payment', 'pix_code'],
    ['payment', 'copy_paste'],
    ['payment', 'qrcode'],
    ['payment', 'qr_code'],
  ]);

  const qrCodeImage = getNestedString(searchRoot, [
    ['root', 'qrCodeImage'],
    ['root', 'qr_code_image'],
    ['root', 'qrcode_image'],
    ['data', 'qrCodeImage'],
    ['data', 'qr_code_image'],
    ['data', 'qrcode_image'],
    ['pix', 'qrCodeImage'],
    ['pix', 'qr_code_image'],
    ['pix', 'qrcode_image'],
    ['payment', 'qrCodeImage'],
    ['payment', 'qr_code_image'],
    ['payment', 'qrcode_image'],
  ]);

  const orderId = getNestedString(searchRoot, [
    ['root', 'order_uuid'],
    ['root', 'uuid'],
    ['root', 'order_id'],
    ['root', 'id'],
    ['data', 'order_uuid'],
    ['data', 'uuid'],
    ['data', 'order_id'],
    ['data', 'id'],
    ['order', 'uuid'],
    ['order', 'id'],
  ]);

  const amount = getNestedNumber(searchRoot, [
    ['root', 'amount'],
    ['root', 'total_gross_amount'],
    ['data', 'amount'],
    ['data', 'total_gross_amount'],
    ['order', 'total_gross_amount'],
    ['order', 'total_paid_amount'],
  ]) || requestedAmount;

  return {
    ...root,
    success: root.success !== false,
    data: {
      ...data,
      pixCode,
      pix_code: pixCode,
      qrCodeImage,
      qr_code_image: qrCodeImage,
      order_uuid: orderId,
      uuid: orderId,
      amount,
    },
    pixCode,
    pix_code: pixCode,
    qrCodeImage,
    qr_code_image: qrCodeImage,
    orderId,
    order_uuid: orderId,
    uuid: orderId,
    amount,
  };
}

async function fruitfyFetch(path: string, init: RequestInit) {
  const url = `${fruitfyBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, init);
  const json = await readFruitfyResponse(response);

  console.log(`[Fruitfy] ${init.method || 'GET'} ${path} -> HTTP ${response.status}`);

  return {response, json};
}

app.get('/health', (_request, response) => {
  response.json({ok: true});
});

app.post('/api/pix/charge', async (request, response) => {
  try {
    const productId = requiredEnv('FRUITFY_PRODUCT_ID', fruitfyProductId);
    const body = request.body ?? {};
    const amount = Number(body.amount);

    if (!body.name || !body.email || !body.cpf || !body.phone) {
      response.status(422).json({
        success: false,
        message: 'Preencha nome, e-mail, CPF e telefone para continuar.',
      });
      return;
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      response.status(422).json({
        success: false,
        message: 'Valor do pedido invalido.',
      });
      return;
    }

    const fruitfyPayload = {
      name: String(body.name).trim(),
      email: String(body.email).trim(),
      phone: normalizeBrazilPhone(body.phone),
      cpf: digitsOnly(body.cpf),
      items: [
        {
          id: productId,
          value: amount,
          quantity: 1,
        },
      ],
      utm: asObject(body.utm),
    };

    let {response: fruitfyResponse, json} = await fruitfyFetch(pixChargePath, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(fruitfyPayload),
    });

    if (fruitfyResponse.status === 404 && pixChargePath !== '/pix/charge') {
      ({response: fruitfyResponse, json} = await fruitfyFetch('/pix/charge', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(fruitfyPayload),
      }));
    }

    if (!fruitfyResponse.ok || asObject(json).success === false) {
      console.error('[Fruitfy] Erro ao criar PIX:', JSON.stringify(json, null, 2));

      response.status(fruitfyResponse.status || 500).json({
        success: false,
        message: String(asObject(json).message || 'Nao foi possivel criar cobranca PIX na Fruitfy.'),
        errors: asObject(json).errors,
        raw: json,
      });
      return;
    }

    const normalized = normalizePixResponse(json, amount);
    console.log('[Fruitfy] PIX criado:', {
      orderId: normalized.orderId,
      hasPixCode: Boolean(normalized.pixCode),
      amount: normalized.amount,
    });

    response.status(fruitfyResponse.status === 200 ? 201 : fruitfyResponse.status).json(normalized);
  } catch (error) {
    console.error('[Fruitfy] Falha interna ao criar PIX:', error);

    response.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Erro interno ao criar cobranca PIX.',
    });
  }
});

app.get('/api/order/:order', async (request, response) => {
  try {
    const orderId = request.params.order;
    const primaryPath = `/api/order/${encodeURIComponent(orderId)}`;

    let {response: fruitfyResponse, json} = await fruitfyFetch(primaryPath, {
      method: 'GET',
      headers: headers(),
    });

    if (fruitfyResponse.status === 404) {
      ({response: fruitfyResponse, json} = await fruitfyFetch(`/order/${encodeURIComponent(orderId)}`, {
        method: 'GET',
        headers: headers(),
      }));
    }

    response.status(fruitfyResponse.status).json(json);
  } catch (error) {
    response.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Erro interno ao consultar pedido.',
    });
  }
});

app.listen(apiPort, () => {
  console.log(`Fruitfy API proxy listening on http://localhost:${apiPort}`);
});
