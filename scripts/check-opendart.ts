import { checkOpendartApiKey } from "@/lib/sources/opendart";

checkOpendartApiKey()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
