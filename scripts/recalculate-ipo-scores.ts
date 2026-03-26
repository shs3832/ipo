import { processPendingIpoScoreRecalcQueue } from "@/lib/ipo-score-store";

const limitArgIndex = process.argv.findIndex((argument) => argument === "--limit");
const parsedLimit =
  limitArgIndex >= 0 && process.argv[limitArgIndex + 1]
    ? Number.parseInt(process.argv[limitArgIndex + 1]!, 10)
    : null;
const limit = parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 100;

processPendingIpoScoreRecalcQueue("script:score-recalc", limit)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
