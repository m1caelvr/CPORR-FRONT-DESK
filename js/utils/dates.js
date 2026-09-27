import { TIME_ZONE } from "../config/constants.js";

export function dayKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function nextDay(day) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function parseMoment(day, time) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day || "") ||
    !/^\d{2}:\d{2}$/.test(time || "")
  )
    throw Error("Informe data e horário válidos.");
  const timestamp = new Date(`${day}T${time}:00-03:00`);
  if (!Number.isFinite(timestamp.getTime()))
    throw Error("Informe data e horário válidos.");
  const local = new Date(timestamp.getTime() - 3 * 3600000)
    .toISOString()
    .slice(0, 16);
  if (local !== `${day}T${time}`) throw Error("Informe uma data válida.");
  if (timestamp.getTime() > Date.now())
    throw Error("A data e o horário não podem estar no futuro.");
  return timestamp.toISOString();
}

export function date(s) {
  return new Date(s).toLocaleString("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function nowFields() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const v = (t) => parts.find((x) => x.type === t).value;
  return {
    day: `${v("year")}-${v("month")}-${v("day")}`,
    time: `${v("hour")}:${v("minute")}`,
  };
}

export function shortDay(day) {
  return day.split("-").reverse().join("/");
}

