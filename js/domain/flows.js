import { isActive, isMilitary, isOpen, snapshot, trim } from "../utils/format.js";
import { directions, flowDetailKeys, ranks } from "../config/constants.js";
import { appState, cadastros, fichas, fluxos, movimentacoes } from "../state.js";
import { ensureSheet, recordFlow, syncSheets } from "./sheets.js";
import { findOpen, validateOperator } from "./profiles.js";
import { dayKey, parseMoment } from "../utils/dates.js";
import { auditChange } from "./audit.js";

export const flowDetails = (data) =>
  Object.fromEntries(flowDetailKeys.map((key) => [key, trim(data[key])]));

export const directionFor = (flow) => flow.acao === "saida" ? "Saída" : "Entrada";

export const oppositeDirection = (direction) => direction === "Saída" ? "Entrada" : "Saída";

export const closingKind = (direction) => direction === "Saída" ? "saida" : "retorno";

export function odometerValue(value) {
  const raw = trim(value).replace(/\s/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;

  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
}

export function validateOdometerPair(initial, final) {
  const initialValue = odometerValue(initial);
  const finalValue = odometerValue(final);

  if (!Number.isFinite(initialValue) || !Number.isFinite(finalValue))
    throw Error("Informe valores válidos para o odômetro.");
  if (finalValue < initialValue)
    throw Error("O odômetro final não pode ser menor que o odômetro inicial.");
}

export function validateFlowData(tipo, data) {
  if (!directions.includes(data.direction))
    throw Error("Selecione entrada ou saída.");

  const details = flowDetails({ destination: data.destination });

  if (tipo === "vehicle") {
    if (data.direction === "Saída" && !details.destination)
      throw Error("Informe o destino.");

    if (data.direction === "Entrada")
      details.destination = "";

    if (!ranks.includes(data.driverRank))
      throw Error("Informe o posto / graduação do motorista.");

    if (!trim(data.driverWarName))
      throw Error("Informe o nome de guerra do motorista.");

    if (!trim(data.vehicleChief))
      throw Error("Informe o chefe da viatura.");

    details.driverRank = data.driverRank;
    details.driverWarName = trim(data.driverWarName);
    details.vehicleChief = trim(data.vehicleChief);

    const odometer =
      data.direction === "Saída" ? "odometerInitial" : "odometerFinal";

    if (!trim(data[odometer]))
      throw Error(
        `Informe o odômetro ${
          data.direction === "Saída" ? "inicial" : "final"
        }.`
      );

    if (!Number.isFinite(odometerValue(data[odometer])))
      throw Error("Informe um valor válido para o odômetro.");

    details[odometer] = trim(data[odometer]);
  } else {
    if (!details.destination)
      throw Error("Informe o destino.");

    details.vehiclePlate = trim(data.vehiclePlate) || "N/A";

    if (tipo === "civil" || tipo === "external")
      details.purpose = trim(data.purpose);
  }

  return { ...details, direction: data.direction };
}

export function addMovement(c, d) {
  if (!cadastros.includes(c) || !isActive(c))
    throw Error("Selecione um cadastro existente.");
  if (findOpen(c))
    throw Error("Há um acesso pendente. Registre a saída, a entrada ou finalize a anotação.");
  const details = validateFlowData(c.tipo, d);
  const inicio = parseMoment(d.visitDate, d.visitTime);
  const m = {
    id: ++appState.seq,
    cadastroId: c.id,
    tipo: c.tipo,
    chave: c.chave,
    dados: { ...c.dados },
    inicio,
    ...details,
    fim: null,
    encerramento: null,
  };
  movimentacoes.push(m);
  recordFlow(m, m.direction === "Saída" ? "saida" : "entrada", inicio);
  return m;
}

export function closeMovement(id, mode, day, time, reason = "", data = {}) {
  const m = movimentacoes.find((r) => r.id === id);
  if (!m || !isOpen(m))
    throw Error("Este acesso já foi encerrado ou não foi encontrado.");
  if (!["movement", "finalize"].includes(mode)) throw Error("Ação inválida.");
  if (mode === "finalize" && !isMilitary(m.tipo))
    throw Error("Esta categoria exige o registro de saída ou entrada.");
  const em = parseMoment(day, time);
  if (new Date(em) < new Date(m.inicio))
    throw Error("O encerramento não pode ocorrer antes do início do acesso.");
  let details = flowDetails(m);
  if (mode === "movement") {
    if (data.direction !== oppositeDirection(m.direction))
      throw Error("Selecione o sentido oposto ao fluxo que abriu este acesso.");
    details = validateFlowData(m.tipo, data);

    if (
      m.tipo === "vehicle" &&
      m.direction === "Saída" &&
      details.direction === "Entrada"
    ) {
      validateOdometerPair(
        m.odometerInitial,
        details.odometerFinal
      );
    }
  }
  const tipo = mode === "finalize" ? "finalizacao" : closingKind(details.direction);
  m.encerramento = {
    tipo,
    em,
    motivo: mode === "finalize" ? trim(reason) : "",
    ...details,
  };
  m.fim = mode === "finalize" ? null : em;
  recordFlow(m, tipo, em, m.encerramento.motivo, new Date(), details);
  return m;
}

export function canEditFlow(flow, now = new Date()) {
  const today = dayKey(now);
  return (
    !!flow &&
    fluxos.includes(flow) &&
    (flow.dia === today || dayKey(flow.registradoEm) === today)
  );
}

export function isInitialFlow(flow) {
  return fluxos.find((f) => f.movimentoId === flow.movimentoId) === flow;
}

export function editFlow(id, data, actor) {
  const responsible = validateOperator(actor);
  const flow = fluxos.find((f) => f.id === id);
  if (!canEditFlow(flow))
    throw Error("Só é possível editar fluxos ocorridos ou registrados hoje.");
  const movement = movimentacoes.find((m) => m.id === flow.movimentoId);
  if (!movement) throw Error("Acesso não encontrado.");
  const initial = isInitialFlow(flow),
    em = parseMoment(data.flowDate, data.flowTime);
  if (initial && movement.encerramento && em > movement.encerramento.em)
    throw Error("O início não pode ocorrer depois do encerramento do acesso.");
  if (!initial && em < movement.inicio)
    throw Error("O encerramento não pode ocorrer antes do início do acesso.");
  const changes = { em, dia: dayKey(em) };
  if (flow.acao === "finalizacao") {
    changes.motivo = trim(data.reason);
  } else {
    Object.assign(changes, validateFlowData(flow.tipo, data));
    const closingFlow = fluxos.find((f) => f.movimentoId === movement.id && f !== flow && !isInitialFlow(f));
    if (initial && closingFlow && closingFlow.acao !== "finalizacao" && changes.direction === directionFor(closingFlow))
      throw Error("O início e o encerramento do acesso devem ter sentidos opostos.");
    if (!initial && changes.direction !== oppositeDirection(movement.direction))
      throw Error("O encerramento deve ter sentido oposto ao início do acesso.");
    changes.acao = initial
      ? changes.direction === "Saída" ? "saida" : "entrada"
      : closingKind(changes.direction);
  }
  const before = { ...snapshot(flow), acesso: snapshot(movement) },
    at = new Date().toISOString();
  syncSheets();
  if (flow.dia !== changes.dia) {
    const previous = fichas.find((f) => f.data === flow.dia);
    if (previous)
      previous.fluxoIds = previous.fluxoIds.filter((id) => id !== flow.id);
    const next = ensureSheet(changes.dia);
    if (!next.fluxoIds.includes(flow.id)) next.fluxoIds.push(flow.id);
  }
  Object.assign(flow, changes, {
    atualizadoEm: at,
    retroativo: changes.dia < dayKey(flow.registradoEm),
  });
  if (initial) {
    movement.inicio = em;
    Object.assign(movement, flowDetails(flow), { direction: changes.direction });
  } else {
    movement.encerramento.em = em;
    if (flow.acao === "finalizacao") movement.encerramento.motivo = flow.motivo;
    else {
      movement.fim = em;
      Object.assign(movement.encerramento, flowDetails(flow), {
        tipo: flow.acao, direction: changes.direction,
      });
    }
  }
  movement.atualizadoEm = at;
  auditChange(
    "edicao",
    flow,
    responsible,
    before,
    { ...snapshot(flow), acesso: snapshot(movement) },
    at,
    "fluxo",
  );
  return flow;
}

