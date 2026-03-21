import type { CSSProperties } from "react";

import { getBrokerBrand, normalizeBrokerName } from "@/lib/broker-brand";
import styles from "@/components/broker-chip.module.scss";

type BrokerChipListProps = {
  names: string[];
  size?: "sm" | "md";
  className?: string;
};

const joinClassNames = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

export function BrokerChipList({ names, size = "md", className }: BrokerChipListProps) {
  const brokers = names
    .map((name) => name.trim())
    .filter((name) => name && name !== "-")
    .reduce<Array<{ key: string; name: string }>>((list, name) => {
      const key = normalizeBrokerName(name);
      if (!key || list.some((broker) => broker.key === key)) {
        return list;
      }

      list.push({ key, name });
      return list;
    }, []);

  if (brokers.length === 0) {
    return null;
  }

  return (
    <div className={joinClassNames(styles.list, className)}>
      {brokers.map((broker) => {
        const brand = getBrokerBrand(broker.name);

        return (
          <span
            className={joinClassNames(styles.chip, size === "sm" && styles.sm)}
            key={broker.key}
          >
            <span
              aria-hidden="true"
              className={styles.swatch}
              style={
                {
                  "--broker-start": brand.start,
                  "--broker-end": brand.end,
                } as CSSProperties
              }
            />
            <span className={styles.name}>{brand.label}</span>
          </span>
        );
      })}
    </div>
  );
}
