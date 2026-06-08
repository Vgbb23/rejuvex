export type CepAddress = {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
};

type CacheEntry = CepAddress | { notFound: true };

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function readCache(cep: string): CacheEntry | null {
  const entry = cache.get(cep);
  if (!entry) return null;
  return entry;
}

function writeCache(cep: string, entry: CacheEntry): void {
  cache.set(cep, entry);
  setTimeout(() => cache.delete(cep), CACHE_TTL_MS).unref?.();
}

function normalizeCep(raw: string): string | null {
  const cep = raw.replace(/\D/g, "").slice(0, 8);
  return cep.length === 8 ? cep : null;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function fromBrasilApi(json: Record<string, unknown>): CepAddress | null {
  const street = String(json.street ?? "").trim();
  const city = String(json.city ?? "").trim();
  const state = String(json.state ?? "").trim();
  if (!city || !state) return null;
  return {
    street,
    neighborhood: String(json.neighborhood ?? "").trim(),
    city,
    state,
  };
}

function fromViaCep(json: Record<string, unknown>): CepAddress | "notFound" | null {
  if (json.erro) return "notFound";
  const city = String(json.localidade ?? "").trim();
  const state = String(json.uf ?? "").trim();
  if (!city || !state) return null;
  return {
    street: String(json.logradouro ?? "").trim(),
    neighborhood: String(json.bairro ?? "").trim(),
    city,
    state,
  };
}

async function fetchBrasilApi(cep: string): Promise<CepAddress | "notFound" | null> {
  try {
    const res = await fetchWithTimeout(`https://brasilapi.com.br/api/cep/v1/${cep}`, 3500);
    if (res.status === 404) return "notFound";
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    return fromBrasilApi(json);
  } catch {
    return null;
  }
}

async function fetchViaCep(cep: string): Promise<CepAddress | "notFound" | null> {
  try {
    const res = await fetchWithTimeout(`https://viacep.com.br/ws/${cep}/json/`, 3500);
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    return fromViaCep(json);
  } catch {
    return null;
  }
}

/** Consulta CEP em paralelo (BrasilAPI + ViaCEP) com cache em memória. */
export async function lookupCep(
  rawCep: string,
): Promise<{ ok: true; data: CepAddress } | { ok: false; notFound?: boolean }> {
  const cep = normalizeCep(rawCep);
  if (!cep) return { ok: false };

  const cached = readCache(cep);
  if (cached) {
    if ("notFound" in cached) return { ok: false, notFound: true };
    return { ok: true, data: cached };
  }

  const results = await Promise.allSettled([fetchBrasilApi(cep), fetchViaCep(cep)]);

  let sawNotFound = false;
  for (const result of results) {
    if (result.status !== "fulfilled" || result.value == null) continue;
    if (result.value === "notFound") {
      sawNotFound = true;
      continue;
    }
    writeCache(cep, result.value);
    return { ok: true, data: result.value };
  }

  if (sawNotFound) {
    writeCache(cep, { notFound: true });
    return { ok: false, notFound: true };
  }

  return { ok: false };
}
