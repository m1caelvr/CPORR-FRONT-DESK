import { $ } from "../ui/dom.js";
import { date, dayKey, nextDay } from "../utils/dates.js";
import { syncSheets } from "../domain/sheets.js";
import { render } from "../ui/render.js";
import { appState } from "../state.js";

export function clock() {
  $("clock").textContent = date(new Date().toISOString());
}

export function refreshDay() {
  const previous = appState.uiDay;
  syncSheets();
  clock();
  const changed = previous !== dayKey();
  appState.uiDay = dayKey();
  if (changed) {
    if (!$("dayFilter").value || $("dayFilter").value === previous)
      $("dayFilter").value = dayKey();
    render();
  }
}

export function scheduleMidnight() {
  clearTimeout(appState.midnightTimer);
  const next = new Date(`${nextDay(dayKey())}T00:00:00-03:00`).getTime();
  appState.midnightTimer = setTimeout(
    () => {
      refreshDay();
      scheduleMidnight();
    },
    Math.max(100, next - Date.now()),
  );
}

