import { formatMoney } from "@/lib/date";

export type IpoPriceDisplayInput = {
  offerPrice?: number | null;
  priceBandLow?: number | null;
  priceBandHigh?: number | null;
  minimumSubscriptionShares?: number | null;
  depositRate?: number | null;
};

export type PriceDisplay = {
  label: string;
  value: string | null;
  isEstimated: boolean;
};

export const hasPriceBandReference = ({ priceBandLow, priceBandHigh }: IpoPriceDisplayInput) =>
  priceBandLow != null || priceBandHigh != null;

export const formatPriceBandRange = ({ priceBandLow, priceBandHigh }: IpoPriceDisplayInput) => {
  if (priceBandLow != null && priceBandHigh != null) {
    return `${formatMoney(priceBandLow)} ~ ${formatMoney(priceBandHigh)}`;
  }

  if (priceBandLow != null) {
    return `${formatMoney(priceBandLow)} ~ 미확인`;
  }

  if (priceBandHigh != null) {
    return `미확인 ~ ${formatMoney(priceBandHigh)}`;
  }

  return null;
};

export const getIpoPriceDisplay = (ipo: IpoPriceDisplayInput): PriceDisplay => {
  if (ipo.offerPrice != null) {
    return {
      label: "확정 공모가",
      value: formatMoney(ipo.offerPrice),
      isEstimated: false,
    };
  }

  return {
    label: "희망 공모가",
    value: formatPriceBandRange(ipo),
    isEstimated: true,
  };
};

export const getMinimumDepositAmount = ({
  offerPrice,
  minimumSubscriptionShares,
  depositRate,
}: IpoPriceDisplayInput) => {
  if (offerPrice == null || minimumSubscriptionShares == null || depositRate == null) {
    return null;
  }

  return Math.round(offerPrice * minimumSubscriptionShares * depositRate);
};

export const getMinimumDepositDisplay = (ipo: IpoPriceDisplayInput): PriceDisplay => {
  const confirmedAmount = getMinimumDepositAmount(ipo);

  if (confirmedAmount != null) {
    return {
      label: "최소청약금액",
      value: formatMoney(confirmedAmount),
      isEstimated: false,
    };
  }

  if (
    ipo.priceBandLow != null
    && ipo.priceBandHigh != null
    && ipo.minimumSubscriptionShares != null
    && ipo.depositRate != null
  ) {
    const lowAmount = Math.round(ipo.priceBandLow * ipo.minimumSubscriptionShares * ipo.depositRate);
    const highAmount = Math.round(ipo.priceBandHigh * ipo.minimumSubscriptionShares * ipo.depositRate);

    return {
      label: "예상 최소청약금액",
      value: `${formatMoney(lowAmount)} ~ ${formatMoney(highAmount)}`,
      isEstimated: true,
    };
  }

  return {
    label: "최소청약금액",
    value: null,
    isEstimated: false,
  };
};
