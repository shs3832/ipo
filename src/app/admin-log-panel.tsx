"use client";

import { useMemo, useState } from "react";
import styles from "@/app/admin-log-panel.module.scss";

type OperationLogRecord = {
  id: string;
  level: "INFO" | "WARN" | "ERROR";
  source: string;
  action: string;
  message: string;
  context: Record<string, unknown> | null;
  createdAtLabel: string;
};

type LogFilter = "ALL" | "ERROR" | "WARN" | "INFO";

const filterItems: Array<{ id: LogFilter; label: string }> = [
  { id: "ALL", label: "전체" },
  { id: "ERROR", label: "ERROR" },
  { id: "WARN", label: "WARN" },
  { id: "INFO", label: "INFO" },
];

const levelClassNames: Record<OperationLogRecord["level"], string> = {
  INFO: styles.levelInfo,
  WARN: styles.levelWarn,
  ERROR: styles.levelError,
};

export function AdminLogPanel({ logs }: { logs: OperationLogRecord[] }) {
  const [filter, setFilter] = useState<LogFilter>("ALL");

  const counts = useMemo(
    () => ({
      ALL: logs.length,
      ERROR: logs.filter((log) => log.level === "ERROR").length,
      WARN: logs.filter((log) => log.level === "WARN").length,
      INFO: logs.filter((log) => log.level === "INFO").length,
    }),
    [logs],
  );

  const filteredLogs = useMemo(
    () => (filter === "ALL" ? logs : logs.filter((log) => log.level === filter)),
    [filter, logs],
  );

  const formatContext = (context: OperationLogRecord["context"]) =>
    context ? JSON.stringify(context, null, 2) : "추가 컨텍스트 없음";

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2 className="section-title">최근 운영 로그</h2>
          <p className="section-copy">전체 로그에서 원하는 레벨만 빠르게 좁혀볼 수 있습니다.</p>
        </div>
        <div className={styles.filterRow}>
          {filterItems.map((item) => (
            <button
              className={`${styles.filterPill} ${filter === item.id ? styles.filterPillActive : ""}`}
              key={item.id}
              onClick={() => setFilter(item.id)}
              type="button"
            >
              <span>{item.label}</span>
              <strong>{counts[item.id]}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.list}>
        {filteredLogs.length ? (
          filteredLogs.map((log) => (
            <div className={styles.row} key={log.id}>
              <div className={styles.logMeta}>
                <span className={`${styles.level} ${levelClassNames[log.level]}`}>{log.level}</span>
                <div>
                  <strong>{log.message}</strong>
                  <p>
                    {log.source} · {log.action} · {log.createdAtLabel}
                  </p>
                </div>
              </div>
              <p className={`mono-text ${styles.context}`}>{formatContext(log.context)}</p>
            </div>
          ))
        ) : (
          <div className={styles.row}>
            <p>선택한 레벨의 로그가 없습니다.</p>
          </div>
        )}
      </div>
    </article>
  );
}
