import { formatDate, kstDateKey, parseKstDate } from "@/lib/date";
import type { IpoStatus } from "@/lib/types";

export const ipoUnavailableLabel = "데이터 미확보";
export const ipoNeedsReviewLabel = "확인 필요";
export const ipoNotApplicableLabel = "해당 없음";

export type IpoDisplayStatus = "CONFIRMED" | "ESTIMATED" | "MISSING" | "NEEDS_REVIEW" | "NOT_APPLICABLE";

export type IpoDisplayValue = {
  value: string;
  status: IpoDisplayStatus;
};

type DateLike = Date | string | null | undefined;

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

const toKstDateKey = (value: DateLike) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return kstDateKey(value);
  }

  return kstDateKey(dateKeyPattern.test(value) ? parseKstDate(value) : new Date(value));
};

const toDate = (value: DateLike) => {
  const key = toKstDateKey(value);
  return key ? parseKstDate(key) : null;
};

export const isKnownMarket = (value: string | null | undefined) =>
  Boolean(value && value.trim() && value.trim() !== "기타법인");

export const isKnownLeadManager = (value: string | null | undefined) =>
  Boolean(value && value.trim() && value.trim() !== "-");

export const isWithdrawnStatus = (status: IpoStatus | null | undefined) => status === "WITHDRAWN";

export const isChronologicallyValidListingDate = ({
  listingDate,
  subscriptionEnd,
}: {
  listingDate: DateLike;
  subscriptionEnd: DateLike;
}) => {
  const listingDateKey = toKstDateKey(listingDate);
  const subscriptionEndKey = toKstDateKey(subscriptionEnd);

  if (!listingDateKey || !subscriptionEndKey) {
    return true;
  }

  return listingDateKey > subscriptionEndKey;
};

export const getUsableListingDate = ({
  listingDate,
  subscriptionEnd,
}: {
  listingDate: DateLike;
  subscriptionEnd: DateLike;
}) => {
  if (!listingDate || !isChronologicallyValidListingDate({ listingDate, subscriptionEnd })) {
    return null;
  }

  return toDate(listingDate);
};

export const getUsableListingDateKey = ({
  listingDate,
  subscriptionEnd,
}: {
  listingDate: DateLike;
  subscriptionEnd: DateLike;
}) => {
  const date = getUsableListingDate({ listingDate, subscriptionEnd });
  return date ? kstDateKey(date) : null;
};

export const getRejectedListingDateNote = ({
  listingDate,
  subscriptionEnd,
}: {
  listingDate: DateLike;
  subscriptionEnd: DateLike;
}) => {
  const listingDateKey = toKstDateKey(listingDate);
  const subscriptionEndKey = toKstDateKey(subscriptionEnd);

  if (!listingDateKey || !subscriptionEndKey || listingDateKey > subscriptionEndKey) {
    return null;
  }

  return `상장예정일 ${listingDateKey}은 청약 마감일 ${subscriptionEndKey} 이전 또는 당일이라 확인 필요로 제외`;
};

export const getMarketDisplay = (market: string | null | undefined): IpoDisplayValue =>
  isKnownMarket(market)
    ? { value: (market ?? "").trim(), status: "CONFIRMED" }
    : { value: "시장 미확인", status: "MISSING" };

export const getLeadManagerDisplay = ({
  leadManager,
  coManagers = [],
}: {
  leadManager: string | null | undefined;
  coManagers?: string[];
}): IpoDisplayValue => {
  const normalizedLeadManager = leadManager?.trim() ?? "";
  const normalizedCoManagers = coManagers.map((manager) => manager.trim()).filter(Boolean);

  if (!isKnownLeadManager(normalizedLeadManager)) {
    return {
      value: "주관사 미확인",
      status: "MISSING",
    };
  }

  return {
    value: normalizedCoManagers.length
      ? `${normalizedLeadManager} / ${normalizedCoManagers.join(", ")}`
      : normalizedLeadManager,
    status: "CONFIRMED",
  };
};

export const getRefundDateDisplay = ({
  refundDate,
  status,
}: {
  refundDate: DateLike;
  status?: IpoStatus | null;
}): IpoDisplayValue => {
  if (isWithdrawnStatus(status)) {
    return {
      value: ipoNotApplicableLabel,
      status: "NOT_APPLICABLE",
    };
  }

  const date = toDate(refundDate);
  if (!date) {
    return {
      value: "환불일 미확보",
      status: "MISSING",
    };
  }

  return {
    value: formatDate(date),
    status: "CONFIRMED",
  };
};

export const getListingDateDisplay = ({
  listingDate,
  subscriptionEnd,
  status,
}: {
  listingDate: DateLike;
  subscriptionEnd: DateLike;
  status?: IpoStatus | null;
}): IpoDisplayValue => {
  if (isWithdrawnStatus(status)) {
    return {
      value: ipoNotApplicableLabel,
      status: "NOT_APPLICABLE",
    };
  }

  if (listingDate && !isChronologicallyValidListingDate({ listingDate, subscriptionEnd })) {
    return {
      value: "상장일 확인 필요",
      status: "NEEDS_REVIEW",
    };
  }

  const date = toDate(listingDate);
  if (!date) {
    return {
      value: "상장일 미확보",
      status: "MISSING",
    };
  }

  return {
    value: formatDate(date),
    status: "CONFIRMED",
  };
};
