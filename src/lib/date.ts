import { eachDayOfInterval, endOfWeek, startOfWeek } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { TIME_ZONE } from "@/lib/types";

const pad = (value: number) => value.toString().padStart(2, "0");
const toKstDateString = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
const getShiftedYearMonth = (year: number, month: number, offset: number) => {
  const totalMonth = year * 12 + (month - 1) + offset;
  const shiftedYear = Math.floor(totalMonth / 12);
  const shiftedMonth = (totalMonth % 12) + 1;

  return {
    year: shiftedYear,
    month: shiftedMonth,
  };
};

export const getKstDateParts = (date = new Date()) => {
  const [year, month, day] = formatInTimeZone(date, TIME_ZONE, "yyyy-MM-dd").split("-").map(Number);

  return {
    year,
    month,
    day,
  };
};

export const getKstTodayKey = (date = new Date()) => {
  const { year, month, day } = getKstDateParts(date);
  return toKstDateString(year, month, day);
};

export const getKstMonthRange = (date = new Date(), offset = 0) => {
  const { year, month } = getKstDateParts(date);
  const shifted = getShiftedYearMonth(year, month, offset);
  const endDay = getDaysInMonth(shifted.year, shifted.month);

  return {
    year: shifted.year,
    month: shifted.month,
    key: `${shifted.year}-${pad(shifted.month)}`,
    label: `${shifted.year}년 ${pad(shifted.month)}월`,
    startKey: toKstDateString(shifted.year, shifted.month, 1),
    endKey: toKstDateString(shifted.year, shifted.month, endDay),
    start: parseKstDate(toKstDateString(shifted.year, shifted.month, 1)),
    end: parseKstDate(toKstDateString(shifted.year, shifted.month, endDay)),
  };
};

export const getKstMonthStart = (date = new Date(), offset = 0) => getKstMonthRange(date, offset).start;

export const getKstMonthEnd = (date = new Date(), offset = 0) => getKstMonthRange(date, offset).end;

export const kstDateKey = (date: Date) => formatInTimeZone(date, TIME_ZONE, "yyyy-MM-dd");

export const parseKstDate = (value: string) => new Date(`${value}T09:00:00+09:00`);

export const atKstTime = (value: string, hour: number, minute = 0) =>
  new Date(`${value}T${pad(hour)}:${pad(minute)}:00+09:00`);

export const shiftKstDateKey = (value: string, offset: number) => {
  const date = parseKstDate(value);
  date.setUTCDate(date.getUTCDate() + offset);
  return kstDateKey(date);
};

export const isOnOrAfterKstDayOffset = (
  value: Date | null | undefined,
  offset: number,
  now = new Date(),
) => {
  if (!value) {
    return false;
  }

  return value >= atKstTime(shiftKstDateKey(getKstTodayKey(now), offset), 0);
};

export const formatDate = (date: Date, pattern = "yyyy.MM.dd") =>
  formatInTimeZone(date, TIME_ZONE, pattern);

export const formatDateTime = (date: Date, pattern = "yyyy.MM.dd HH:mm") =>
  formatInTimeZone(date, TIME_ZONE, pattern);

export const isSameKstDate = (left: Date, right: Date) => kstDateKey(left) === kstDateKey(right);

export const getKstDayOfWeek = (date: Date) => parseKstDate(kstDateKey(date)).getUTCDay();

export const getMonthDays = (date: Date) => {
  const { year, month } = getKstDateParts(date);
  const monthStart = parseKstDate(toKstDateString(year, month, 1));
  const monthEnd = parseKstDate(toKstDateString(year, month, getDaysInMonth(year, month)));
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  return eachDayOfInterval({ start: gridStart, end: gridEnd });
};

export const formatMoney = (value: number | null | undefined) => {
  if (value == null) {
    return "-";
  }

  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatPercent = (value: number | null | undefined) => {
  if (value == null) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
};

export const formatSignedPercentValue = (value: number | null | undefined) => {
  if (value == null) {
    return "-";
  }

  const formatted = new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);

  return `${value > 0 ? "+" : ""}${formatted}%`;
};
