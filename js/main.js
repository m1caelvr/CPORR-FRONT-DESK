import { syncSheets } from "./domain/sheets.js";
import { dayKey } from "./utils/dates.js";
import { $ } from "./ui/dom.js";
import { downloadReport, refreshReportCount } from "./reports.js";
import { clock, refreshDay, scheduleMidnight } from "./services/clock.js";
import { route } from "./ui/navigation.js";
import { bindEvents } from "./ui/events.js";
import { registerContext } from "./services/context.js";
import { initConnection } from "./services/connection.js";

bindEvents();

syncSheets();

$("reportDate").value = dayKey();

$("reportDate").onchange = refreshReportCount;

$("downloadHistory").onclick = () => downloadReport("history");

$("downloadSummary").onclick = () => downloadReport("summary");

$("reportToday").onclick = () => {
  $("reportDate").value = dayKey();
  refreshReportCount();
};

$("dayFilter").value = dayKey();

clock();

route("home");

scheduleMidnight();

setInterval(refreshDay, 30000);

window.addEventListener("focus", () => {
  refreshDay();
  scheduleMidnight();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshDay();
    scheduleMidnight();
  }
});

registerContext();
initConnection();
