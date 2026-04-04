import type { PublicHomeSnapshot } from "@/lib/types";

type PublicHomeSnapshotInput = {
  mode: PublicHomeSnapshot["mode"];
  generatedAt: PublicHomeSnapshot["generatedAt"];
  calendarMonth: PublicHomeSnapshot["calendarMonth"];
  ipos: PublicHomeSnapshot["ipos"];
  [key: string]: unknown;
};

export const toPublicHomeSnapshot = ({
  mode,
  generatedAt,
  calendarMonth,
  ipos,
}: PublicHomeSnapshotInput): PublicHomeSnapshot => ({
  mode,
  generatedAt,
  calendarMonth,
  ipos,
});
