import type { CustomsFile, TaxResult } from "../shared/types";

export function calculateTax(file: CustomsFile): TaxResult {
  const goodsTotalUSD = file.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceUSD, 0);
  const cifUSD = roundMoney(goodsTotalUSD + file.freightUSD + file.insuranceUSD);
  const customsDutyRate = 0.027;
  const vatRate = 0.2;
  const customsDutyUSD = roundMoney(cifUSD * customsDutyRate);
  const vatBaseUSD = roundMoney(cifUSD + customsDutyUSD);
  const vatUSD = roundMoney(vatBaseUSD * vatRate);
  const totalUSD = roundMoney(customsDutyUSD + vatUSD);
  const totalTRY = roundMoney(totalUSD * file.fxRate);

  return {
    cifUSD,
    customsDutyRate,
    customsDutyUSD,
    vatBaseUSD,
    vatRate,
    vatUSD,
    totalUSD,
    totalTRY
  };
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
