"use client";

import { useMemo, useState } from "react";

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

  return (
    <article className="detail-card detail-card-wide">
      <div className="panel-header panel-header-stack">
        <div>
          <h2>최근 운영 로그</h2>
          <p className="panel-copy">전체 로그에서 원하는 레벨만 빠르게 좁혀볼 수 있습니다.</p>
        </div>
        <div className="log-filter-row">
          {filterItems.map((item) => (
            <button
              className={`log-filter-pill ${filter === item.id ? "log-filter-pill-active" : ""}`}
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

      <div className="admin-list">
        {filteredLogs.length ? (
          filteredLogs.map((log) => (
            <div className="admin-row" key={log.id}>
              <div className="log-meta">
                <span className={`log-level log-${log.level.toLowerCase()}`}>{log.level}</span>
                <div>
                  <strong>{log.message}</strong>
                  <p>
                    {log.source} · {log.action} · {log.createdAtLabel}
                  </p>
                </div>
              </div>
              <p className="mono-text log-context">
                {log.context ? JSON.stringify(log.context) : "추가 컨텍스트 없음"}
              </p>
            </div>
          ))
        ) : (
          <div className="admin-row">
            <p>선택한 레벨의 로그가 없습니다.</p>
          </div>
        )}
      </div>
    </article>
  );
}
