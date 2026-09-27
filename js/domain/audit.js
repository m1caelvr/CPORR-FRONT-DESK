import { appState, auditoria } from "../state.js";
import { snapshot } from "../utils/format.js";

export function freezeTree(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}

export function auditChange(
  action,
  target,
  actorSnapshot,
  before,
  after,
  at,
  entity = "cadastro",
) {
  const log = freezeTree({
    id: ++appState.auditSeq,
    acao: action,
    entidade: entity,
    alvoId: target.id,
    tipo: target.tipo,
    em: at,
    responsavel: snapshot(actorSnapshot),
    antes: snapshot(before),
    depois: snapshot(after),
  });
  auditoria.push(log);
  return log;
}

