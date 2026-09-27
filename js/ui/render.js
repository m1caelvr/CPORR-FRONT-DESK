import { docNorm, flowLabel, isActive, isMilitary, isOpen, label, norm } from "../utils/format.js";
import { $, esc } from "./dom.js";
import { date, dayKey, nextDay, shortDay } from "../utils/dates.js";
import { appState, auditoria, cadastros, fichas, fluxos, movimentacoes } from "../state.js";
import { TIME_ZONE, flowDetailKeys, types } from "../config/constants.js";
import { canEditFlow } from "../domain/flows.js";
import { flowsForDay, sheetInfo, syncSheets } from "../domain/sheets.js";
import { refreshReportCount } from "../reports.js";
import { findOpen } from "../domain/profiles.js";

export function statusLabel(m) {
  if (isOpen(m)) return "Em aberto";
  if (m.encerramento.tipo === "finalizacao") return "Anotação finalizada";
  return m.encerramento.tipo === "saida"
    ? "Saída registrada"
    : "Entrada registrada";
}

export function rowActions(m, edit = "") {
  if (!isOpen(m)) return "";
  return `
          <div class="row-actions">
            ${
                isMilitary(m.tipo) ?
              `
                <button class="row-action finalize-action" data-finalize="${m.id}">Finalizar anotação</button>
              ` : ""
            }
            <button class="row-action" data-finish="${m.id}">
              ${m.direction === "Saída" ? "Registrar entrada" : "Registrar saída"}
            </button>
            ${edit}
          </div>
        `;
}

export function statusHtml(m) {
  return `<span class="pill ${isOpen(m) ? "" : m.encerramento.tipo === "finalizacao" ? "finalized" : "closed"}">${statusLabel(m)}</span>`;
}

export function endHtml(m) {
  if (isOpen(m)) return "—";
  const e = m.encerramento;
  return `${date(e.em)}<small>${e.tipo === "finalizacao" ? "Finalização da anotação" : e.tipo === "saida" ? "Saída" : "Entrada (retorno)"}</small>${e.motivo ? `<small class="wrap-note">${esc(e.motivo)}</small>` : ""}`;
}

export function flowDetailHtml(f) {
  if (f.tipo !== "vehicle") return `<small>Placa do veículo: ${esc(f.vehiclePlate || "N/A")}</small>`;
  const reading = f.acao === "saida"
    ? `Odômetro inicial: ${esc(f.odometerInitial)}`
    : `Odômetro final: ${esc(f.odometerFinal)}`;
  return `
          <small>Motorista: ${esc(f.driverRank)} ${esc(f.driverWarName)}</small>
          <small>Chefe da viatura: ${esc(f.vehicleChief)}</small>
          <small>${reading}</small>
         `;
}

export function flowRow(f, compact = false, daily = false) {
  const m = movimentacoes.find((m) => m.id === f.movimentoId);
  const timing = daily
    ? `${date(f.em)}<small>Registrado em ${date(f.registradoEm)}</small>`
    : `${date(f.registradoEm)}<small>Ocorreu em ${date(f.em)}</small><small>Ficha de ${shortDay(f.dia)}</small>`;
  const edited = f.atualizadoEm
    ? `<small>Editado em ${date(f.atualizadoEm)}</small>`
    : "";
  const edit = canEditFlow(f)
    ? `<button class="row-action edit-flow-action" data-edit-flow="${f.id}"><span class="material-symbols-rounded">edit_note</span></button>`
    : "";
  return `
          <tr>
            <td>
              <strong>${esc(label(f.tipo, f.dados))}</strong>
              <small>${types[f.tipo]} · Acesso #${f.movimentoId} · Fluxo #${f.id}</small>
            </td>
            <td>${timing}
              <small class="flow-kind">${flowLabel(f)}${f.retroativo ? " · Retroativo" : ""}</small>
              ${edited}
            </td>
            <td class="wrap-note">${esc(f.motivo || f.purpose)}
              <small>${esc(f.destination)}</small>
              ${!compact && f.acao !== "finalizacao" ? flowDetailHtml(f) : ""}
            </td>
            <td>${statusHtml(m)}</td>
            <td class="actions">${rowActions(m, edit)}</td>
          </tr>
        `;
}

export function renderRecent() {
  const recent = fluxos
    .slice()
    .sort(
      (a, b) =>
        new Date(b.registradoEm) - new Date(a.registradoEm) || b.id - a.id,
    )
    .slice(0, 5);
  $("recentBody").innerHTML = recent.map((f) => flowRow(f, true)).join("");
  $("recentEmpty").hidden = recent.length > 0;
}

export function render() {
  syncSheets();
  refreshReportCount();
  const today = dayKey();

  $("homeSheetDate").textContent = shortDay(today);
  $("homeSheetCount").textContent = `${flowsForDay(today).length} fluxos hoje`;
  renderRecent();
  const isReg = appState.page === "registry",
    isDaily = appState.page === "daily",
    isAudit = appState.page === "audit";
  if (!$("dayFilter").value || $("dayFilter").value > today)
    $("dayFilter").value = today;
  $("dayFilter").max = today;
  const day = $("dayFilter").value;
  $("historyMode").value = isAudit
    ? "audit"
    : isReg
      ? "registry"
      : isDaily
        ? "daily"
        : "movement";
  $("dayControls").hidden = !isDaily;
  $("dailySummary").hidden = !isDaily;
  $("statusFilter").hidden = isReg || isAudit;
  $("search").placeholder = isAudit
    ? "Buscar cadastro, responsável ou ação..."
    : "Buscar nome, identidade ou placa...";
  if (isAudit) {
    renderAudit();
    return;
  }
  if (isDaily) {
    const sheet = fichas.find((f) => f.data === day) || sheetInfo(day);
    $("sheetHeading").textContent = `Ficha de ${shortDay(day)}`;
    $("sheetState").textContent =
      sheet.status === "aberta" ? "Aberta" : "Fechada";
    $("sheetState").className =
      `pill ${sheet.status === "fechada" ? "closed" : ""}`;
    $("sheetTimes").textContent =
      `Abertura: ${shortDay(day)} às 00h · ${sheet.status === "fechada" ? "Fechamento" : "Fecha"}: ${shortDay(nextDay(day))} às 00h`;
    $("sheetCount").textContent = `${flowsForDay(day).length} fluxos`;
    $("nextDay").disabled = day >= today;
    const pending = movimentacoes.filter(
      (m) => isOpen(m) && dayKey(m.inicio) < day,
    );
    $("carryPanel").hidden = !pending.length;
    $("carryCount").textContent =
      `${pending.length} ${pending.length === 1 ? "acesso pendente de dia anterior" : "acessos pendentes de dias anteriores"}`;
  }
  const q = norm($("search").value),
    t = $("categoryFilter").value,
    status = $("statusFilter").value;
  const rows = (
    isReg ? cadastros.filter(isActive) : isDaily ? flowsForDay(day) : fluxos
  )
    .filter((r) => {
      const matches =
        !q ||
        norm(
          [...Object.values(r.dados), ...flowDetailKeys.map((key) => r[key] || "")].join(" "),
        ).includes(q) ||
        (docNorm(q) && docNorm(r.chave).includes(docNorm(q)));
      const m = isReg
        ? null
        : movimentacoes.find((m) => m.id === r.movimentoId);
      return (
        (!t || r.tipo === t) &&
        matches &&
        (isReg ||
          !status ||
          (status === "open"
            ? isOpen(m)
            : status === "finalized"
              ? r.acao === "finalizacao"
              : !isOpen(m)))
      );
    })
    .slice()
    .sort((a, b) =>
      isReg
        ? b.id - a.id
        : new Date(isDaily ? b.em : b.registradoEm) -
            new Date(isDaily ? a.em : a.registradoEm) || b.id - a.id,
    );
  $("pageTitle").textContent = isReg
    ? "Cadastros"
    : isDaily
      ? "Ficha diária"
      : "Histórico";
  $("pageDesc").textContent = isReg
    ? "Pessoas e viaturas."
    : isDaily
      ? "Todos os fluxos do dia, em uma ficha."
      : "Consulte cadastros, todos os fluxos ou um dia.";
  $("newBtn").textContent = "＋ Novo cadastro";
  $("tableTitle").textContent = isReg
    ? "Cadastros"
    : isDaily
      ? "Fluxos do dia"
      : "Todos os fluxos";
  $("tableSubtitle").textContent = isReg
    ? "Cadastros independentes dos fluxos."
    : isDaily
      ? "Organizados pela data da ocorrência. Edite fluxos ocorridos ou registrados hoje."
      : "Mais recentes pelo lançamento, com a data da ocorrência e a ficha correspondente.";
  $("thead").innerHTML =
    `<tr>${(isReg ? ["Identificação", "Categoria", "Acesso", "Ações"] : ["Identificação", isDaily ? "Ocorrência / fluxo" : "Registrado em / fluxo", "Motivo / destino", "Acesso atual", "Ações"]).map((x) => `<th>${x}</th>`).join("")}</tr>`;
  $("tbody").innerHTML = rows
    .map((r) =>
      isReg
        ? `
        <tr>
          <td>
                <strong>${esc(label(r.tipo, r.dados))}</strong>
                <small>${esc(r.dados.om || r.dados.section || "")}</small>
              </td>
            <td>${types[r.tipo]}</td>
            <td>${findOpen(r) ? "Pendente" : "Sem pendência"}</td>
            <td class="actions">
              <div class="registry-actions">
                <button class="row-action" data-reuse="${cadastros.indexOf(r)}">${findOpen(r) ? "Ver acesso" : "Registrar fluxo"}</button>
                <button class="row-action" data-edit="${cadastros.indexOf(r)}"><span class="material-symbols-rounded">person_edit</span></button>
                <button class="row-action danger-link" data-delete="${cadastros.indexOf(r)}"><span class="material-symbols-rounded">delete_forever</span></button>
              </div>
          </td>
        </tr>
          `
        : flowRow(r, false, isDaily),
    )
    .join("");
  $("count").textContent = `${rows.length} ${isReg ? "cadastros" : "fluxos"}`;
  $("footerCount").textContent =
    `${rows.length} ${isReg ? "cadastros" : "fluxos"} exibidos`;
  $("empty").hidden = rows.length > 0;
  $("empty").querySelector("h3").textContent =
    q || t || status
      ? "Nenhum resultado"
      : isReg
        ? "Nenhum cadastro"
        : isDaily
          ? "Nenhum fluxo neste dia"
          : "Nenhum fluxo";
  $("empty").querySelector("p").textContent =
    q || t || status
      ? "Ajuste a busca ou os filtros."
      : isReg
        ? "Cadastre uma pessoa ou viatura."
        : "Os fluxos aparecerão aqui após o registro.";
}

export const auditFieldNames = {
  identity: "Identidade",
  rank: "Posto",
  warName: "Nome de guerra",
  name: "Nome",
  phone: "Telefone",
  section: "Seção",
  om: "OM",
  plate: "Placa",
  model: "Modelo",
  em: "Ocorrência",
  dia: "Ficha",
  direction: "Entrada ou saída",
  purpose: "Motivo",
  destination: "Destino",
  vehiclePlate: "Placa do veículo",
  driverRank: "Posto / graduação do motorista",
  driverWarName: "Nome de guerra do motorista",
  vehicleChief: "Chefe da viatura",
  odometerInitial: "Odômetro inicial",
  odometerFinal: "Odômetro final",
  motivo: "Motivo da finalização",
};

export function auditDetails(log) {
  if (log.acao === "exclusao") return "Cadastro excluído; fluxos preservados.";
  const flow = log.entidade === "fluxo";
  const before = flow ? log.antes : log.antes.dados,
    after = flow ? log.depois : log.depois.dados;
  const keys = flow
    ? ["em", "dia", "direction", ...flowDetailKeys, "motivo"]
    : Object.keys(after);
  const changes = keys.filter((k) => before[k] !== after[k]);
  const value = (key, v) =>
    !v ? "—" : key === "em" ? date(v) : key === "dia" ? shortDay(v) : v;
  return changes.length
    ? changes
        .map(
          (k) =>
            `${auditFieldNames[k] || k}: ${value(k, before[k])} → ${value(k, after[k])}`,
        )
        .join(" · ")
    : "Dados confirmados sem mudança nos campos.";
}

export function renderAudit() {
  const q = norm($("search").value),
    t = $("categoryFilter").value;
  const logs = auditoria
    .filter(
      (log) =>
        (!t || log.tipo === t) &&
        (!q ||
          norm(
            [
              label(log.tipo, log.antes.dados),
              label(log.tipo, log.depois.dados),
              log.responsavel.posto,
              log.responsavel.nomeGuerra,
              log.acao === "edicao" ? "Edição" : "Exclusão",
              auditDetails(log),
            ].join(" "),
          ).includes(q)),
    )
    .slice()
    .reverse();
  $("pageTitle").textContent = "Alterações";
  $("pageDesc").textContent = "Edições e exclusões com responsável e horário.";
  $("newBtn").textContent = "＋ Novo cadastro";
  $("tableTitle").textContent = "Histórico de alterações";
  $("tableSubtitle").textContent =
    "O histórico permanece após a exclusão do cadastro.";
  $("thead").innerHTML =
    "<tr><th>Data e horário</th><th>Responsável</th><th>Ação</th><th>Cadastro / fluxo</th><th>Alteração</th></tr>";
  $("tbody").innerHTML = logs
    .map(
      (log) =>
        `<tr><td>${date(log.em)}<small>${new Date(log.em).toLocaleTimeString("pt-BR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small></td><td><strong>${esc(log.responsavel.posto)} ${esc(log.responsavel.nomeGuerra)}</strong><small>Responsável informado</small></td><td>${log.acao === "edicao" ? (log.entidade === "fluxo" ? "Edição de fluxo" : "Edição de cadastro") : "Exclusão"}</td><td><strong>${esc(label(log.tipo, log.antes.dados))}</strong><small>${types[log.tipo]}${log.entidade === "fluxo" ? ` · Fluxo #${log.alvoId}` : ""}</small></td><td class="wrap-note">${esc(auditDetails(log))}</td></tr>`,
    )
    .join("");
  $("count").textContent = `${logs.length} alterações`;
  $("footerCount").textContent = `${logs.length} alterações exibidas`;
  $("empty").hidden = logs.length > 0;
  $("empty").querySelector("h3").textContent = "Nenhuma alteração";
  $("empty").querySelector("p").textContent =
    "Edições e exclusões serão registradas aqui.";
}

