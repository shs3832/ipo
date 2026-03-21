import { eachDayOfInterval, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { TIME_ZONE } from "@/lib/types";

const pad = (value: number) => value.toString().padStart(2, "0");

export const kstDateKey = (date: Date) => formatInTimeZone(date, TIME_ZONE, "yyyy-MM-dd");

export const parseKstDate = (value: string) => new Date(`${value}T09:00:00+09:00`);

export const atKstTime = (value: string, hour: number, minute = 0) =>
  new Date(`${value}T${pad(hour)}:${pad(minute)}:00+09:00`);

export const formatDate = (date: Date, pattern = "yyyy.MM.dd") =>
  formatInTimeZone(date, TIME_ZONE, pattern);

export const formatDateTime = (date: Date, pattern = "yyyy.MM.dd HH:mm") =>
  formatInTimeZone(date, TIME_ZONE, pattern);

export const isSameKstDate = (left: Date, right: Date) => kstDateKey(left) === kstDateKey(right);

export const getMonthDays = (date: Date) => {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
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
