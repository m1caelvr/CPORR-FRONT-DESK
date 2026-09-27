

export const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

export const docNorm = (s) => norm(s).replace(/[^A-Z0-9]/g, "");

export const trim = (s) => String(s || "").trim();

export const keyFor = (t, d) =>
  t === "internal"
    ? JSON.stringify([norm(d.rank), norm(d.warName)])
    : docNorm(t === "vehicle" ? d.plate : d.identity);

export const keyNames = (t) =>
  t === "internal"
    ? ["rank", "warName"]
    : t === "vehicle"
      ? ["plate"]
      : ["identity"];

export const isMilitary = (t) => t === "internal" || t === "external";

export const isOpen = (m) => !m.encerramento;

export const isActive = (c) => !!c && !c.excluidoEm;

export const snapshot = (value) => JSON.parse(JSON.stringify(value));

export const phoneNorm = (value) => String(value || "").replace(/\D/g, "");

export function label(t, d) {
  return t === "vehicle"
    ? d.plate
    : isMilitary(t)
      ? `${d.rank} ${d.warName}`
      : d.name;
}

export function flowLabel(f) {
  return {
    entrada: "Entrada",
    saida: "Saída",
    retorno: "Entrada (retorno)",
    finalizacao: "Finalização",
  }[f.acao];
}

