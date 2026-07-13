import {
  addDaysToDateString,
  matchesWorkDay,
  parseWorkDayFilter,
  todayDateString,
  workDayFilterLabel,
} from "../src/lib/delivery-schedule";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log("OK:", message);
}

const today = todayDateString();
const tomorrow = addDaysToDateString(today, 1);

assert(parseWorkDayFilter("tomorrow") === "tomorrow", "parses tomorrow");
assert(parseWorkDayFilter("date") === "date", "parses date");
assert(parseWorkDayFilter("nope") === undefined, "rejects unknown work day");

assert(
  matchesWorkDay(
    { orderDate: today, requestedDeliveryDate: tomorrow },
    "tomorrow"
  ),
  "tomorrow filter matches tomorrow delivery"
);

assert(
  matchesWorkDay(
    { orderDate: today, requestedDeliveryDate: "2026-07-01" },
    "date",
    "2026-07-01"
  ),
  "date filter matches explicit ship date"
);

assert(
  !matchesWorkDay(
    { orderDate: today, requestedDeliveryDate: today },
    "tomorrow"
  ),
  "tomorrow filter excludes today delivery"
);

assert(
  workDayFilterLabel("date", "2026-07-01") === "2026-07-01",
  "date label uses selected date"
);

console.log("\nAll delivery-schedule checks passed.");
