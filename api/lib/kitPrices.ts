/**
 * Catálogo dos kits Envy Hair — mesmos valores da landing (`envy-skin-clone`).
 * O bridge PIX (`fruitfyBridge`) encaminha `amount` em centavos vindo do checkout;
 * este arquivo documenta os preços base esperados por kit.
 */

export type KitCatalogEntry = {
  id: number;
  name: string;
  treatmentLabel: string;
  /** Preço à vista / principal (R$). */
  priceBRL: number;
  image: string;
  popular: boolean;
};

export const KIT_CATALOG: readonly KitCatalogEntry[] = [
  {
    id: 1,
    name: "1 Unidade",
    treatmentLabel: "Protocolo 1 mês",
    priceBRL: 39.9,
    image: "https://i.ibb.co/BdwCQtm/image.png",
    popular: false,
  },
  {
    id: 2,
    name: "2 Unidades",
    treatmentLabel: "Protocolo 2 meses",
    priceBRL: 59.9,
    image: "https://i.ibb.co/60k3jnSk/image.png",
    popular: true,
  },
  {
    id: 3,
    name: "3 Unidades",
    treatmentLabel: "Protocolo 3 meses",
    priceBRL: 69.9,
    image: "https://i.ibb.co/35X4dLv2/image.png",
    popular: false,
  },
];

/** Preço “de” (riscado) = 2× o preço promocional, como na UI. */
export function listPriceBRLFromKit(priceBRL: number): number {
  return Math.round(priceBRL * 2 * 100) / 100;
}

export function formatBRL(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/** Parcela 12× a partir do total do kit. */
export function installment12Label(priceBRL: number): string {
  return formatBRL(Math.round((priceBRL / 12) * 100) / 100);
}
