import { runDailySync } from "@/lib/jobs";

const forceRefresh = process.argv.includes("--force-refresh") || process.argv.includes("--force");

runDailySync({ forceRefresh })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
