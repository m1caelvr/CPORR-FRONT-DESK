import { dayKey, nextDay } from "../utils/dates.js";
import { appState, fichas, fluxos } from "../state.js";
import { flowDetails } from "./flows.js";

export function sheetInfo(day, now = new Date()) {
  const abertura = new Date(`${day}T00:00:00-03:00`).toISOString();
  const fechaEm = new Date(`${nextDay(day)}T00:00:00-03:00`).toISOString();
  const encerrada = new Date(now).getTime() >= new Date(fechaEm).getTime();
  return {
    data: day,
    abertura,
    fechaEm,
    fechamento: encerrada ? fechaEm : null,
    status: encerrada ? "fechada" : "aberta",
  };
}

export function ensureSheet(day, now = new Date()) {
  let ficha = fichas.find((f) => f.data === day);
  if (!ficha) {
    ficha = { ...sheetInfo(day, now), fluxoIds: [] };
    fichas.push(ficha);
  } else Object.assign(ficha, sheetInfo(day, now));
  return ficha;
}

export function syncSheets(now = new Date()) {
  const today = dayKey(now);
  const changed = appState.lastSheetDay !== today;
  for (let day = appState.lastSheetDay || today; day <= today; day = nextDay(day))
    ensureSheet(day, now);
  fichas.forEach((f) => Object.assign(f, sheetInfo(f.data, now)));
  ensureSheet(today, now);
  appState.lastSheetDay = today;
  return changed;
}

export function recordFlow(movement, kind, at, reason = "", now = new Date(), details = movement) {
  syncSheets(now);
  const dia = dayKey(at),
    sheet = ensureSheet(dia, now);
  const event = {
    id: ++appState.fluxoSeq,
    movimentoId: movement.id,
    cadastroId: movement.cadastroId,
    tipo: movement.tipo,
    chave: movement.chave,
    dados: { ...movement.dados },
    acao: kind,
    em: at,
    dia,
    registradoEm: new Date(now).toISOString(),
    retroativo: dia < dayKey(now),
    ...flowDetails(details),
    direction: kind === "finalizacao" ? "" : kind === "saida" ? "Saída" : "Entrada",
    motivo: reason,
  };
  fluxos.push(event);
  sheet.fluxoIds.push(event.id);
  return event;
}

export function flowsForDay(day) {
  return fluxos.filter((f) => f.dia === day);
}

