import { flowsForDay } from "./domain/sheets.js";
import { types } from "./config/constants.js";
import { flowLabel, label } from "./utils/format.js";
import { date, dayKey, shortDay } from "./utils/dates.js";
import { $, notify } from "./ui/dom.js";

export function reportFlows(day) {
  return flowsForDay(day).slice().sort((a, b) =>
    new Date(a.em) - new Date(b.em) || a.id - b.id,
  );
}

export function reportEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

export function reportLine(label, value) {
  return value ? `<div><b>${reportEscape(label)}:</b> ${reportEscape(value)}</div>` : "";
}

export function buildReport(day, kind) {
  const rows = reportFlows(day);
  const counts = Object.fromEntries(Object.keys(types).map((type) => [type, rows.filter((f) => f.tipo === type).length]));
  const entering = rows.filter((f) => f.acao === "entrada" || f.acao === "retorno").length;
  const leaving = rows.filter((f) => f.acao === "saida").length;
  const finalized = rows.filter((f) => f.acao === "finalizacao").length;
  const title = kind === "history" ? "Histórico de fluxos" : "Resumo de fluxos";
  const summary = `<div class="totals">${[
    ["Total de fluxos", rows.length], ["Entradas e retornos", entering], ["Saídas", leaving],
    ["Finalizações", finalized], ...Object.entries(counts).map(([key, value]) => [types[key], value]),
  ].map(([name, value]) => `<div><span>${reportEscape(name)}</span><strong>${value}</strong></div>`).join("")}</div>`;
  const history = rows.length ? `<table><thead><tr><th>Horário</th><th>Fluxo</th><th>Identificação</th><th>Detalhes</th></tr></thead><tbody>${rows.map((f) => {
    const details = [
      reportLine("Destino", f.destination), reportLine("Motivo", f.motivo || f.purpose),
      reportLine("Placa", f.tipo === "vehicle" ? f.dados.plate : f.vehiclePlate),
      reportLine("Modelo", f.dados.model), reportLine("OM", f.dados.om),
      reportLine("Nome completo", f.dados.name), reportLine("Identidade", f.dados.identity),
      reportLine("Telefone", f.dados.phone), reportLine("Seção", f.dados.section),
      reportLine("Motorista", f.driverWarName ? `${f.driverRank || ""} ${f.driverWarName}`.trim() : ""),
      reportLine("Chefe da viatura", f.vehicleChief),
      reportLine("Odômetro inicial", f.odometerInitial), reportLine("Odômetro final", f.odometerFinal),
      reportLine("Registrado em", date(f.registradoEm)),
    ].filter(Boolean).join("");
    return `<tr><td>${reportEscape(date(f.em))}</td><td>${reportEscape(flowLabel(f))}<small>#${f.id}</small></td><td><strong>${reportEscape(f.tipo === "vehicle" ? `${f.dados.model || "Viatura"} · ${f.dados.plate || "Sem placa"}` : label(f.tipo, f.dados))}</strong><small>${reportEscape(types[f.tipo])}</small></td><td>${details || "—"}</td></tr>`;
  }).join("")}</tbody></table>` : "<p>Nenhum fluxo registrado nesta data.</p>";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — ${shortDay(day)}</title><style>
    body{font:15px/1.5 Arial,sans-serif;color:#172332;max-width:1050px;margin:35px auto;padding:0 22px}header{border-bottom:3px solid #183b61;margin-bottom:20px;padding-bottom:12px}h1{margin:0}p{color:#526071}button{padding:10px 15px;margin:10px 0 22px;cursor:pointer}.totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:20px 0}.totals>div{border:1px solid #cbd5df;padding:12px;border-radius:7px}.totals span,.totals strong{display:block}.totals strong{font-size:25px}table{width:100%;border-collapse:collapse}th,td{padding:9px;text-align:left;vertical-align:top;border-bottom:1px solid #dce3e9}th{background:#edf2f6}small{display:block;color:#596775}td div{margin-bottom:3px;white-space:pre-wrap}td{overflow-wrap:anywhere}table{table-layout:fixed;font-size:12px}th:nth-child(1){width:16%}th:nth-child(2){width:13%}th:nth-child(3){width:25%}th:nth-child(4){width:46%} @media print{body{margin:0;max-width:none;padding:0}button{display:none}thead{display:table-header-group}.totals>div{break-inside:avoid}tr{break-inside:auto}@page{size:A4;margin:15mm}}
  </style></head><body><header><h1>${title}</h1><p>CPOR/R · Data da ocorrência: ${shortDay(day)} · Gerado em ${reportEscape(date(new Date().toISOString()))}</p></header><button onclick="window.print()">Imprimir / salvar PDF</button>${kind === "history" ? `<p>${rows.length} fluxos · Ordem cronológica · Horário de Brasília</p>${history}` : summary + "<p>Os quantitativos consideram eventos de fluxo, não pessoas únicas. Finalizações são contadas separadamente.</p>"}</body></html>`;
}

export function downloadReport(kind) {
  const day = $("reportDate").value;
  refreshReportCount();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T12:00:00Z`)) || dayKey(`${day}T12:00:00Z`) !== day || day > dayKey()) {
    notify("Selecione uma data válida, até hoje.");
    return;
  }
  const blob = new Blob([buildReport(day, kind)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cpor-${kind === "history" ? "historico" : "resumo"}-${day}.html`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function refreshReportCount() {
  const input = $("reportDate");
  input.max = dayKey();
  const day = input.value;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= dayKey();
  $("downloadHistory").disabled = !valid;
  $("downloadSummary").disabled = !valid;
  $("reportCount").textContent = !valid
    ? "Selecione uma data válida, até hoje."
    : `${flowsForDay(day).length} fluxos na ficha de ${shortDay(day)}. ` +
      (flowsForDay(day).length ? "Pronto para exportar." : "O download indicará que não há registros nesta data.");
}

