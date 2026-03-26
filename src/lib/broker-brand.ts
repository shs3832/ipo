type BrokerBrand = {
  label: string;
  mark: string;
  start: string;
  end: string;
  ink: string;
  asset?:
    | {
        kind: "image";
        src: string;
        width: number;
        height: number;
      }
    | {
        kind: "sprite";
        src: string;
        width: number;
        height: number;
        backgroundWidth: number;
        backgroundHeight: number;
        backgroundPosition: string;
      };
};

const BROKER_CANONICAL_ALIASES: Record<string, string> = {
  "케이비증권": "kb증권",
  "엔에이치투자증권": "nh투자증권",
  "한국투자": "한국투자증권",
  "미래에셋": "미래에셋증권",
};

const BROKER_BRANDS: Record<string, BrokerBrand> = {
  "nh투자증권": {
    label: "NH투자증권",
    mark: "NH",
    start: "#1e6ae6",
    end: "#173b87",
    ink: "#ffffff",
    asset: { kind: "image", src: "/brokers/nh-investment.png", width: 108, height: 17 },
  },
  "한국투자증권": {
    label: "한국투자증권",
    mark: "한투",
    start: "#0f8b8d",
    end: "#105e62",
    ink: "#ffffff",
    asset: { kind: "image", src: "/brokers/korea-investment.svg", width: 110, height: 17 },
  },
  "미래에셋증권": {
    label: "미래에셋증권",
    mark: "M",
    start: "#2251d1",
    end: "#f47c20",
    ink: "#ffffff",
    asset: { kind: "image", src: "/brokers/mirae-asset.png", width: 74, height: 26 },
  },
  "신한투자증권": {
    label: "신한투자증권",
    mark: "신한",
    start: "#1b4db1",
    end: "#0f2b71",
    ink: "#ffffff",
    asset: {
      kind: "sprite",
      src: "/brokers/shinhan-securities-sprite.png",
      width: 108,
      height: 19,
      backgroundWidth: 428,
      backgroundHeight: 106,
      backgroundPosition: "0 0",
    },
  },
  "삼성증권": {
    label: "삼성증권",
    mark: "삼성",
    start: "#1b4db1",
    end: "#2da5f7",
    ink: "#ffffff",
    asset: { kind: "image", src: "/brokers/samsung-securities.gif", width: 98, height: 11 },
  },
  "kb증권": { label: "KB증권", mark: "KB", start: "#5a4625", end: "#be8d2f", ink: "#ffffff" },
  "키움증권": { label: "키움증권", mark: "키움", start: "#7f3bd2", end: "#4f1b9b", ink: "#ffffff" },
  "하나증권": { label: "하나증권", mark: "하나", start: "#0f8f78", end: "#0b6152", ink: "#ffffff" },
  "대신증권": { label: "대신증권", mark: "대신", start: "#405067", end: "#1f2937", ink: "#ffffff" },
  "유안타증권": { label: "유안타증권", mark: "유안", start: "#d64657", end: "#8e1f37", ink: "#ffffff" },
  "ls증권": { label: "LS증권", mark: "LS", start: "#105e62", end: "#0c3f42", ink: "#ffffff" },
  "메리츠증권": { label: "메리츠증권", mark: "MZ", start: "#8b1e3f", end: "#5c1028", ink: "#ffffff" },
  "db금융투자": { label: "DB금융투자", mark: "DB", start: "#0f8a63", end: "#0c5e45", ink: "#ffffff" },
  "ibk투자증권": { label: "IBK투자증권", mark: "IBK", start: "#1657b8", end: "#123781", ink: "#ffffff" },
  "bnk투자증권": { label: "BNK투자증권", mark: "BNK", start: "#d62d52", end: "#8b1530", ink: "#ffffff" },
  "sk증권": { label: "SK증권", mark: "SK", start: "#e45b1c", end: "#c22127", ink: "#ffffff" },
  "교보증권": { label: "교보증권", mark: "교보", start: "#2f7f44", end: "#1d5b2d", ink: "#ffffff" },
  "한화투자증권": { label: "한화투자증권", mark: "한화", start: "#ff7a00", end: "#d55200", ink: "#ffffff" },
  "현대차증권": { label: "현대차증권", mark: "현대", start: "#002c5f", end: "#0a4f94", ink: "#ffffff" },
  "신영증권": { label: "신영증권", mark: "신영", start: "#6f4c2f", end: "#3b2517", ink: "#ffffff" },
  "상상인증권": { label: "상상인증권", mark: "상상", start: "#df3d6f", end: "#9f1544", ink: "#ffffff" },
  "im증권": { label: "iM증권", mark: "iM", start: "#1d6aff", end: "#15378a", ink: "#ffffff" },
  "토스증권": { label: "토스증권", mark: "토스", start: "#0064ff", end: "#0037cc", ink: "#ffffff" },
  "신한금융투자": {
    label: "신한투자증권",
    mark: "신한",
    start: "#1b4db1",
    end: "#0f2b71",
    ink: "#ffffff",
    asset: {
      kind: "sprite",
      src: "/brokers/shinhan-securities-sprite.png",
      width: 108,
      height: 19,
      backgroundWidth: 428,
      backgroundHeight: 106,
      backgroundPosition: "0 0",
    },
  },
};

export const normalizeBrokerName = (value: string) => {
  const normalized = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/주식회사|\(주\)|㈜/g, "")
    .toLowerCase();

  return BROKER_CANONICAL_ALIASES[normalized] ?? normalized;
};

const toFallbackMark = (value: string) => {
  const cleaned = value.replace(/[^\p{Script=Hangul}A-Za-z0-9]/gu, "");
  if (!cleaned) {
    return "IPO";
  }

  if (/^[A-Za-z0-9]+$/.test(cleaned)) {
    return cleaned.slice(0, 3).toUpperCase();
  }

  return cleaned.slice(0, 2);
};

export const getBrokerBrand = (name: string): BrokerBrand => {
  const normalized = normalizeBrokerName(name);
  const brand = BROKER_BRANDS[normalized];

  if (brand) {
    return brand;
  }

  return {
    label: name.trim(),
    mark: toFallbackMark(name),
    start: "#4a5a74",
    end: "#1f2937",
    ink: "#ffffff",
  };
};
