import { z } from "zod";

import type { SourceIpoRecord } from "@/lib/types";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableDateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const optionalFiniteNumberSchema = z.number().finite().nullable().optional();

const sourceIpoRecordSchema = z.object({
  sourceKey: z.string().trim().min(1),
  name: z.string().trim().min(1),
  market: z.string().trim().min(1),
  leadManager: z.string().trim().min(1),
  subscriptionStart: dateKeySchema,
  subscriptionEnd: dateKeySchema,
  refundDate: nullableDateKeySchema,
  listingDate: nullableDateKeySchema,
  priceBandLow: optionalFiniteNumberSchema,
  priceBandHigh: optionalFiniteNumberSchema,
  offerPrice: optionalFiniteNumberSchema,
  minimumSubscriptionShares: optionalFiniteNumberSchema,
  depositRate: optionalFiniteNumberSchema,
});

export type SourceRecordValidationSkip = {
  index: number;
  name: string | null;
  sourceKey: string | null;
  issues: string[];
};

export const validateSourceIpoRecords = (records: SourceIpoRecord[]) => {
  const validRecords: SourceIpoRecord[] = [];
  const skippedRecords: SourceRecordValidationSkip[] = [];

  records.forEach((record, index) => {
    const parsed = sourceIpoRecordSchema.safeParse(record);

    if (parsed.success) {
      validRecords.push(record);
      return;
    }

    skippedRecords.push({
      index,
      name: typeof record.name === "string" ? record.name : null,
      sourceKey: typeof record.sourceKey === "string" ? record.sourceKey : null,
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "record"}: ${issue.message}`),
    });
  });

  return {
    validRecords,
    skippedRecords,
  };
};
