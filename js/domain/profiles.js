import { profileNames, ranks, types } from "../config/constants.js";
import { docNorm, isActive, isMilitary, isOpen, keyFor, keyNames, norm, phoneNorm, snapshot, trim } from "../utils/format.js";
import { appState, cadastros, movimentacoes } from "../state.js";
import { auditChange } from "./audit.js";

export function resolveOperator(rank, warName) {
  return validateOperator({ posto: rank, nomeGuerra: warName });
}

export function validateOperator(actor) {
  if (!actor || !ranks.includes(actor.posto) || !trim(actor.nomeGuerra))
    throw Error("Informe o posto e o nome de guerra do responsável.");
  return { posto: actor.posto, nomeGuerra: trim(actor.nomeGuerra) };
}

export function deleteProfile(target, actor) {
  const responsible = validateOperator(actor);
  if (!cadastros.includes(target) || !isActive(target))
    throw Error("Cadastro não encontrado ou já excluído.");
  const before = snapshot(target),
    at = new Date().toISOString();
  target.excluidoEm = at;
  target.excluidoPor = responsible;
  auditChange("exclusao", target, responsible, before, target, at);
  return target;
}

export function keyReady(t, d) {
  return (
    !!types[t] &&
    (t === "internal" ? !!(d.rank && norm(d.warName)) : !!keyFor(t, d))
  );
}

export function findExisting(t, d) {
  return keyReady(t, d)
    ? cadastros.find(
        (c) => isActive(c) && c.tipo === t && c.chave === keyFor(t, d),
      ) || null
    : null;
}

export function findOpen(c) {
  return movimentacoes.find((m) => m.cadastroId === c.id && isOpen(m));
}

export function saveProfile(d, existing = null, actor = null) {
  const tipo = d.type;
  const responsible = existing ? validateOperator(actor) : null;
  if (!keyReady(tipo, d)) throw Error("Informe uma identificação válida.");
  if (
    existing &&
    (!cadastros.includes(existing) ||
      !isActive(existing) ||
      existing.tipo !== tipo)
  )
    throw Error("Cadastro inválido para edição.");
  const duplicate = findExisting(tipo, d);
  if (duplicate && duplicate !== existing)
    throw Error(
      "Esta identificação já pertence a outro cadastro. Confira os dados.",
    );
  const dados = {};
  for (const name of [...keyNames(tipo), ...profileNames[tipo]]) {
    dados[name] = trim(d[name]);
    if (!dados[name])
      throw Error("Preencha todos os campos obrigatórios do cadastro.");
  }
  if (isMilitary(tipo) && !ranks.includes(dados.rank))
    throw Error("Selecione um posto / graduação válido.");
  if (existing) {
    const before = snapshot(existing),
      at = new Date().toISOString();
    existing.chave = keyFor(tipo, dados);
    existing.dados = dados;
    existing.atualizadoEm = at;
    auditChange("edicao", existing, responsible, before, existing, at);
    return existing;
  }
  const c = {
    id: ++appState.cadastroSeq,
    tipo,
    chave: keyFor(tipo, dados),
    dados,
    criadoEm: new Date().toISOString(),
  };
  cadastros.push(c);
  return c;
}

export function suggestProfiles(tipo, fieldName, value, exclude = null) {
  const query = ["name", "warName"].includes(fieldName)
    ? norm(value)
    : fieldName === "phone"
      ? phoneNorm(value)
      : docNorm(value);
  if (!query || (["name", "warName"].includes(fieldName) && query.length < 2))
    return [];
  return cadastros
    .filter((c) => {
      if (!isActive(c) || c.tipo !== tipo || c === exclude) return false;
      if (fieldName === "phone")
        return !!phoneNorm(c.dados.phone) && phoneNorm(c.dados.phone) === query;
      if (fieldName === "identity" || fieldName === "plate")
        return docNorm(c.dados[fieldName]) === query;
      if (fieldName === "name" || fieldName === "warName")
        return norm(c.dados[fieldName]).includes(query);
      return false;
    })
    .sort((a, b) => {
      const av = norm(a.dados[fieldName]),
        bv = norm(b.dados[fieldName]);
      return (
        Number(bv.startsWith(query)) - Number(av.startsWith(query)) ||
        av.localeCompare(bv, "pt-BR")
      );
    });
}

