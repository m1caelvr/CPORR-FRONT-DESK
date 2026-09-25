"use strict";

const cadastros = [];
const movimentacoes = [];
const fluxos = [];
const fichas = [];
const TIME_ZONE = "America/Sao_Paulo";
let fluxoSeq = 0,
  lastSheetDay = null;
function dayKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function nextDay(day) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function sheetInfo(day, now = new Date()) {
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
function ensureSheet(day, now = new Date()) {
  let ficha = fichas.find((f) => f.data === day);
  if (!ficha) {
    ficha = { ...sheetInfo(day, now), fluxoIds: [] };
    fichas.push(ficha);
  } else Object.assign(ficha, sheetInfo(day, now));
  return ficha;
}
function syncSheets(now = new Date()) {
  const today = dayKey(now);
  const changed = lastSheetDay !== today;
  for (let day = lastSheetDay || today; day <= today; day = nextDay(day))
    ensureSheet(day, now);
  fichas.forEach((f) => Object.assign(f, sheetInfo(f.data, now)));
  ensureSheet(today, now);
  lastSheetDay = today;
  return changed;
}
function recordFlow(movement, kind, at, reason = "", now = new Date()) {
  syncSheets(now);
  const dia = dayKey(at),
    sheet = ensureSheet(dia, now);
  const event = {
    id: ++fluxoSeq,
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
    purpose: movement.purpose,
    destination: movement.destination,
    motivo: reason,
    notes: movement.notes,
    contact: movement.contact,
    driver: movement.driver,
    passengers: movement.passengers,
  };
  fluxos.push(event);
  sheet.fluxoIds.push(event.id);
  return event;
}
function flowsForDay(day) {
  return fluxos.filter((f) => f.dia === day);
}

const types = {
  civil: "Visitante civil",
  external: "Militar de outra OM",
  internal: "Militar do CPOR",
  vehicle: "Viatura da OM",
};
const ranks = [
  "Aluno",
  "Cadete",
  "SD EP",
  "SD EV",
  "CB",
  "3º SGT",
  "2º SGT",
  "1º SGT",
  "ST",
  "ASP",
  "2º TEN",
  "1º TEN",
  "CAP",
  "MAJ",
  "TC",
  "CEL",
  "GEN BDA",
  "GEN DIV",
  "GEN EX",
];
const profileNames = {
  civil: ["name", "phone"],
  external: ["rank", "warName", "name", "om"],
  internal: ["section"],
  vehicle: ["model", "om"],
};
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
const docNorm = (s) => norm(s).replace(/[^A-Z0-9]/g, "");
const trim = (s) => String(s || "").trim();
const keyFor = (t, d) =>
  t === "internal"
    ? JSON.stringify([norm(d.rank), norm(d.warName)])
    : docNorm(t === "vehicle" ? d.plate : d.identity);
const keyNames = (t) =>
  t === "internal"
    ? ["rank", "warName"]
    : t === "vehicle"
      ? ["plate"]
      : ["identity"];
const isMilitary = (t) => t === "internal" || t === "external";
const isOpen = (m) => !m.encerramento;
let seq = 0,
  cadastroSeq = 0,
  auditSeq = 0;
const auditoria = [];
const isActive = (c) => !!c && !c.excluidoEm;
const snapshot = (value) => JSON.parse(JSON.stringify(value));
function resolveOperator(rank, warName) {
  return validateOperator({ posto: rank, nomeGuerra: warName });
}
function validateOperator(actor) {
  if (!actor || !ranks.includes(actor.posto) || !trim(actor.nomeGuerra))
    throw Error("Informe o posto e o nome de guerra do responsável.");
  return { posto: actor.posto, nomeGuerra: trim(actor.nomeGuerra) };
}
function freezeTree(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}
function auditChange(
  action,
  target,
  actorSnapshot,
  before,
  after,
  at,
  entity = "cadastro",
) {
  const log = freezeTree({
    id: ++auditSeq,
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
function deleteProfile(target, actor) {
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

function keyReady(t, d) {
  return (
    !!types[t] &&
    (t === "internal" ? !!(d.rank && norm(d.warName)) : !!keyFor(t, d))
  );
}
function findExisting(t, d) {
  return keyReady(t, d)
    ? cadastros.find(
        (c) => isActive(c) && c.tipo === t && c.chave === keyFor(t, d),
      ) || null
    : null;
}
function findOpen(c) {
  return movimentacoes.find((m) => m.cadastroId === c.id && isOpen(m));
}
function saveProfile(d, existing = null, actor = null) {
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
    if (name !== "phone" && !dados[name])
      throw Error("Preencha todos os campos obrigatórios do cadastro.");
  }
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
    id: ++cadastroSeq,
    tipo,
    chave: keyFor(tipo, dados),
    dados,
    criadoEm: new Date().toISOString(),
  };
  cadastros.push(c);
  return c;
}
const phoneNorm = (value) => String(value || "").replace(/\D/g, "");
function suggestProfiles(tipo, fieldName, value, exclude = null) {
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
function parseMoment(day, time) {
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
function addMovement(c, d) {
  if (!cadastros.includes(c) || !isActive(c))
    throw Error("Selecione um cadastro existente.");
  if (findOpen(c))
    throw Error(
      "Há um acesso pendente. Registre a saída, o retorno ou finalize a anotação.",
    );
  if (!trim(d.destination)) throw Error("Informe o destino.");
  if (c.tipo === "vehicle" && !trim(d.driver))
    throw Error("Informe o motorista.");
  if (
    c.tipo === "internal" &&
    !["Entrada no CPOR", "Saída do CPOR"].includes(d.direction)
  )
    throw Error("Selecione a movimentação.");
  const inicio = parseMoment(d.visitDate, d.visitTime);
  const direction =
    c.tipo === "vehicle" ||
    (c.tipo === "internal" && d.direction === "Saída do CPOR")
      ? "Saída"
      : "Entrada";
  const m = {
    id: ++seq,
    cadastroId: c.id,
    tipo: c.tipo,
    chave: c.chave,
    dados: { ...c.dados },
    inicio,
    direction,
    purpose: trim(d.purpose),
    destination: trim(d.destination),
    contact: trim(d.contact),
    driver: trim(d.driver),
    passengers: trim(d.passengers),
    notes: trim(d.notes),
    fim: null,
    encerramento: null,
  };
  movimentacoes.push(m);
  recordFlow(m, direction === "Saída" ? "saida" : "entrada", inicio);
  return m;
}
function closeMovement(id, mode, day, time, reason = "") {
  const m = movimentacoes.find((r) => r.id === id);
  if (!m || !isOpen(m))
    throw Error("Este acesso já foi encerrado ou não foi encontrado.");
  if (!["movement", "finalize"].includes(mode)) throw Error("Ação inválida.");
  if (mode === "finalize" && !isMilitary(m.tipo))
    throw Error("Esta categoria exige o registro de saída ou retorno.");
  const em = parseMoment(day, time);
  if (new Date(em) < new Date(m.inicio))
    throw Error("O encerramento não pode ocorrer antes do início do acesso.");
  const tipo =
    mode === "finalize"
      ? "finalizacao"
      : m.direction === "Saída"
        ? "retorno"
        : "saida";
  m.encerramento = {
    tipo,
    em,
    motivo: mode === "finalize" ? trim(reason) : "",
  };
  m.fim = mode === "finalize" ? null : em;
  recordFlow(m, tipo, em, m.encerramento.motivo);
  return m;
}

function canEditFlow(flow, now = new Date()) {
  const today = dayKey(now);
  return (
    !!flow &&
    fluxos.includes(flow) &&
    (flow.dia === today || dayKey(flow.registradoEm) === today)
  );
}
function isInitialFlow(flow) {
  return fluxos.find((f) => f.movimentoId === flow.movimentoId) === flow;
}
function editFlow(id, data, actor) {
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
  if (initial) {
    if (!trim(data.destination)) throw Error("Informe o destino.");
    if (flow.tipo === "vehicle" && !trim(data.driver))
      throw Error("Informe o motorista.");
    for (const key of [
      "purpose",
      "destination",
      "contact",
      "driver",
      "passengers",
    ])
      changes[key] = trim(data[key]);
  } else if (flow.acao === "finalizacao") changes.motivo = trim(data.reason);
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
    for (const key of [
      "purpose",
      "destination",
      "contact",
      "driver",
      "passengers",
    ])
      movement[key] = changes[key];
  } else {
    movement.encerramento.em = em;
    if (flow.acao === "finalizacao") movement.encerramento.motivo = flow.motivo;
    else movement.fim = em;
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

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let page = "home",
  stage = "profile",
  selected = null,
  editing = null,
  matchAnchor = null,
  matchCandidates = [],
  closing = null,
  toastTimer,
  pendingAction = null,
  editActor = null,
  editingFlow = null;
const form = $("form");
const normalSections = [
  ...document.querySelectorAll(
    "main > .heading, main > .metrics, main > .panel, main > .footnote, main > .history-controls",
  ),
];
function label(t, d) {
  return t === "vehicle"
    ? d.plate
    : isMilitary(t)
      ? `${d.rank} ${d.warName}`
      : d.name;
}
function date(s) {
  return new Date(s).toLocaleString("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function nowFields() {
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
function field(
  name,
  title,
  options = null,
  required = true,
  type = "text",
  value = "",
) {
  const control = options
    ? `<select name="${name}" ${required ? "required" : ""}><option value="">Selecione</option>${options.map((x) => `<option${x === value ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>`
    : `<input type="${type}" name="${name}" value="${esc(value)}" maxlength="150" ${required ? "required" : ""} autocomplete="off">`;
  return `<label>${title}${required ? " *" : ' <span class="optional">(opcional)</span>'}${control}</label>`;
}
function notify(msg) {
  $("toast").textContent = msg;
  $("toast").style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").style.display = "none";
  }, 4000);
}
function setSection(id, active) {
  $(id).hidden = !active;
  $(id)
    .querySelectorAll("input,select,textarea")
    .forEach((el) => {
      el.disabled = !active;
    });
}
function setupProfile() {
  const t = $("type").value;
  $("keyHint").textContent =
    t === "internal"
      ? "Informe posto/graduação e nome de guerra para verificar se já há cadastro."
      : t === "vehicle"
        ? "Informe a placa para verificar se já há cadastro."
        : "Informe a identidade para verificar se já há cadastro.";
  $("keyFields").innerHTML =
    t === "internal"
      ? field("rank", "Posto / graduação", ranks) +
        field("warName", "Nome de guerra")
      : t === "vehicle"
        ? field("plate", "Placa")
        : field("identity", "Identidade");
  $("profileFields").innerHTML =
    t === "civil"
      ? field("name", "Nome completo") +
        field("phone", "Telefone", null, false, "tel")
      : t === "external"
        ? field("rank", "Posto / graduação", ranks) +
          field("warName", "Nome de guerra") +
          field("name", "Nome completo") +
          field("om", "OM de origem")
        : t === "internal"
          ? field("section", "Seção / subunidade")
          : field("model", "Modelo / tipo de viatura") +
            field("om", "OM responsável");
  $("profileSection")
    .querySelectorAll("input")
    .forEach((el) => {
      if (["name", "warName", "identity", "plate", "phone"].includes(el.name)) {
        el.setAttribute("aria-haspopup", "dialog");
        el.setAttribute("aria-controls", "matchPanel");
        el.setAttribute("aria-expanded", "false");
      }
    });
  $("error").textContent = "";
}
function clearMatch() {
  if (matchAnchor) matchAnchor.setAttribute("aria-expanded", "false");
  $("matchPanel").hidden = true;
  matchCandidates = [];
  matchAnchor = null;
}
function positionMatch() {
  if (!matchAnchor || $("matchPanel").hidden) return;
  const box = matchAnchor.getBoundingClientRect(),
    popup = $("matchPanel");
  const viewport = window.visualViewport;
  const leftEdge = viewport?.offsetLeft || 0,
    topEdge = viewport?.offsetTop || 0;
  const width = viewport?.width || window.innerWidth,
    height = viewport?.height || window.innerHeight;
  if (box.bottom < topEdge || box.top > topEdge + height) {
    clearMatch();
    return;
  }
  const panelWidth = Math.min(390, width - 24);
  popup.style.width = `${panelWidth}px`;
  const left = Math.max(
    leftEdge + 12,
    Math.min(box.left, leftEdge + width - panelWidth - 12),
  );
  const above = box.top - topEdge - 22,
    below = topEdge + height - box.bottom - 22;
  const useAbove = above >= 180 || above >= below;
  popup.dataset.side = useAbove ? "above" : "below";
  popup.style.maxHeight = `${Math.max(90, Math.min(330, useAbove ? above : below))}px`;
  popup.style.left = `${left}px`;
  popup.style.top = `${useAbove ? Math.max(topEdge + 10, box.top - popup.offsetHeight - 10) : box.bottom + 10}px`;
  popup.style.setProperty(
    "--pointer-x",
    `${Math.max(18, Math.min(panelWidth - 18, box.left + Math.min(box.width / 2, 45) - left))}px`,
  );
}
function lookup(eventOrInput) {
  if (!["profile", "edit"].includes(stage) || page !== "profile") return [];
  let input = eventOrInput?.target || eventOrInput;
  if (input?.name === "rank") input = form.elements.warName;
  if (
    !input ||
    !["name", "warName", "identity", "plate", "phone"].includes(input.name)
  ) {
    clearMatch();
    return [];
  }
  const candidates = suggestProfiles(
    editing?.tipo || $("type").value,
    input.name,
    input.value,
    editing,
  );
  clearMatch();
  if (!candidates.length) return [];
  matchAnchor = input;
  matchCandidates = candidates;
  input.setAttribute("aria-expanded", "true");
  const vehicle = (editing?.tipo || $("type").value) === "vehicle";
  $("matchTitle").textContent = vehicle ? "É esta viatura?" : "É esta pessoa?";
  $("matchCount").textContent =
    `${candidates.length} ${candidates.length === 1 ? "cadastro encontrado" : "cadastros encontrados"}`;
  $("matchHelp").textContent =
    stage === "edit"
      ? "Outra pessoa já cadastrada. Confira a identificação antes de salvar."
      : "Selecione para preencher os dados.";
  $("matchList").innerHTML = candidates
    .map((c, i) => {
      const details = [
        c.dados.identity ? `Identidade: ${c.dados.identity}` : "",
        c.dados.phone ? `Telefone: ${c.dados.phone}` : "",
        c.dados.om || c.dados.section || c.dados.model || "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<button type="button" class="match-choice" data-candidate="${i}"><strong>${esc(label(c.tipo, c.dados))}</strong>${c.dados.name && c.dados.name !== label(c.tipo, c.dados) ? `<span>${esc(c.dados.name)}</span>` : ""}<small>${esc(details)}</small><span class="match-pick">${stage === "edit" ? "Conferir este cadastro" : "Sim, é este cadastro"} →</span></button>`;
    })
    .join("");
  $("matchPanel").hidden = false;
  positionMatch();
  return candidates;
}
function confirmMatch(index) {
  const c = matchCandidates[index],
    anchor = matchAnchor;
  if (
    !c ||
    !anchor ||
    !suggestProfiles(
      editing?.tipo || $("type").value,
      anchor.name,
      anchor.value,
      editing,
    ).includes(c)
  ) {
    clearMatch();
    return;
  }
  if (stage === "edit") {
    clearMatch();
    $("error").textContent =
      `Confira os dados: ${label(c.tipo, c.dados)} já está cadastrado. Suas alterações ainda não foram salvas.`;
    anchor.focus();
    return;
  }
  clearMatch();
  openForm(c);
}
function dismissMatch() {
  const anchor = matchAnchor;
  clearMatch();
  anchor?.focus();
}
function setupEntry() {
  const t = selected.tipo,
    now = nowFields();
  let fields =
    field("visitDate", "Data da movimentação", null, true, "date", now.day) +
    field("visitTime", "Horário", null, true, "time", now.time);
  if (t === "internal")
    fields += field(
      "direction",
      "Movimentação",
      ["Entrada no CPOR", "Saída do CPOR"],
      true,
      "text",
      "Entrada no CPOR",
    );
  if (t === "vehicle") fields += field("driver", "Motorista (posto e nome)");
  fields += field("destination", "Destino / seção");
  if (t === "vehicle")
    fields += field("passengers", "Passageiros", null, false);
  if (t === "civil" || t === "external")
    fields += field("contact", "Pessoa procurada", null, false);
  $("visitFields").innerHTML = fields;
  const existing = findOpen(selected);
  $("selectedSummary").innerHTML =
    `<span class="eyebrow">CADASTRO SELECIONADO</span><h2>${esc(label(t, selected.dados))}</h2><p>${types[t]}</p>${existing ? `<div class="open-warning"><strong>Há um acesso pendente desde ${date(existing.inicio)}.</strong><p>Encerre a anotação antes de registrar outro acesso.</p>${rowActions(existing)}</div>` : ""}`;
  $("entryHint").textContent = isMilitary(t)
    ? "O expediente normal não exige anotação. Em casos como pernoite seguido de expediente, a anotação pode ser finalizada sem registrar uma saída."
    : t === "civil"
      ? "Registre a saída ao fim da visita."
      : "Registre a saída da viatura e, depois, seu retorno.";
  updateEntryButton();
  if (form.elements.direction)
    form.elements.direction.onchange = updateEntryButton;
}
function updateEntryButton() {
  $("submit").textContent = "Registrar fluxo";
  $("submit").disabled = !!findOpen(selected);
}
function openForm(record = null) {
  clearMatch();
  editActor = null;
  editing = null;
  selected = record;
  stage = record ? "entry" : "profile";
  form.reset();
  $("error").textContent = "";
  $("submit").disabled = false;
  $("profileSection").hidden = !!record;
  $("entrySection").hidden = !record;
  if (record) setupEntry();
  else {
    $("type").value = "civil";
    setupProfile();
  }
  setSection("profileSection", !record);
  setSection("entrySection", !!record);
  $("saveOnly").hidden = !!record;
  $("formTitle").textContent = record ? "Registrar fluxo" : "Novo cadastro";
  if (!record) $("submit").textContent = "Registrar fluxo";
  $("cancel").textContent = record ? "Cadastros" : "Início";
  route(record ? "entry" : "profile");
}
function openEdit(c, actor) {
  validateOperator(actor);
  if (!isActive(c)) throw Error("Cadastro excluído.");
  editActor = actor;
  clearMatch();
  editing = c;
  selected = null;
  stage = "edit";
  form.reset();
  $("type").value = c.tipo;
  setupProfile();
  setSection("profileSection", true);
  setSection("entrySection", false);
  $("type").disabled = true;
  for (const [name, value] of Object.entries(c.dados))
    if (form.elements[name]) form.elements[name].value = value;
  $("saveOnly").hidden = true;
  $("submit").disabled = false;
  $("submit").textContent = "Salvar alterações";
  $("formTitle").textContent = "Editar cadastro";
  $("cancel").textContent = "Cancelar";
  $("keyHint").textContent =
    `Responsável: ${actor.posto} ${actor.nomeGuerra}. As alterações serão registradas no histórico.`;
  route("profile");
}
function statusLabel(m) {
  if (isOpen(m)) return "Em aberto";
  if (m.encerramento.tipo === "finalizacao") return "Anotação finalizada";
  return m.encerramento.tipo === "saida"
    ? "Saída registrada"
    : "Retorno registrado";
}
function rowActions(m) {
  if (!isOpen(m)) return '<span class="muted">—</span>';
  return `<div class="row-actions"><button class="row-action" data-finish="${m.id}">${m.direction === "Saída" ? "Registrar retorno" : "Registrar saída"}</button>${isMilitary(m.tipo) ? `<button class="row-action finalize-action" data-finalize="${m.id}">Finalizar anotação</button>` : ""}</div>`;
}
function statusHtml(m) {
  return `<span class="pill ${isOpen(m) ? "" : m.encerramento.tipo === "finalizacao" ? "finalized" : "closed"}">${statusLabel(m)}</span>`;
}
function endHtml(m) {
  if (isOpen(m)) return "—";
  const e = m.encerramento;
  return `${date(e.em)}<small>${e.tipo === "finalizacao" ? "Finalização da anotação" : e.tipo === "saida" ? "Saída" : "Retorno"}</small>${e.motivo ? `<small class="wrap-note">${esc(e.motivo)}</small>` : ""}`;
}
function flowLabel(f) {
  return {
    entrada: "Entrada",
    saida: "Saída",
    retorno: "Retorno",
    finalizacao: "Finalização",
  }[f.acao];
}
function shortDay(day) {
  return day.split("-").reverse().join("/");
}
function flowRow(f, compact = false, daily = false) {
  const m = movimentacoes.find((m) => m.id === f.movimentoId);
  const timing = daily
    ? `${date(f.em)}<small>Registrado em ${date(f.registradoEm)}</small>`
    : `${date(f.registradoEm)}<small>Ocorreu em ${date(f.em)}</small><small>Ficha de ${shortDay(f.dia)}</small>`;
  const edited = f.atualizadoEm
    ? `<small>Editado em ${date(f.atualizadoEm)}</small>`
    : "";
  const edit = canEditFlow(f)
    ? `<button class="row-action edit-flow-action" data-edit-flow="${f.id}">Editar fluxo</button>`
    : "";
  return `<tr><td><strong>${esc(label(f.tipo, f.dados))}</strong><small>${types[f.tipo]} · Acesso #${f.movimentoId} · Fluxo #${f.id}</small></td><td>${timing}<small class="flow-kind">${flowLabel(f)}${f.retroativo ? " · Retroativo" : ""}</small>${edited}</td><td class="wrap-note">${esc(f.motivo || f.purpose)}<small>${esc(f.destination)}</small>${!compact && f.notes ? `<small>${esc(f.notes)}</small>` : ""}</td><td>${statusHtml(m)}</td><td>${rowActions(m)}${edit}</td></tr>`;
}
function renderRecent() {
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
function render() {
  syncSheets();
  const today = dayKey();
  $("inside").textContent = movimentacoes.filter(
    (m) => m.tipo !== "vehicle" && isOpen(m),
  ).length;
  $("vehicles").textContent = movimentacoes.filter(
    (m) => m.tipo === "vehicle" && isOpen(m),
  ).length;
  $("total").textContent = fluxos.length;
  $("registered").textContent = cadastros.filter(isActive).length;
  $("homeSheetDate").textContent = shortDay(today);
  $("homeSheetCount").textContent = `${flowsForDay(today).length} fluxos hoje`;
  renderRecent();
  const isReg = page === "registry",
    isDaily = page === "daily",
    isAudit = page === "audit";
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
          Object.values(r.dados).join(" ") +
            " " +
            (r.purpose || "") +
            " " +
            (r.destination || ""),
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
    `<tr>${(isReg ? ["Identificação", "Categoria", "Acesso", "Ações"] : ["Identificação", isDaily ? "Ocorrência / fluxo" : "Registrado em / fluxo", "Objetivo / destino", "Acesso atual", "Ações"]).map((x) => `<th>${x}</th>`).join("")}</tr>`;
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
            <td>
              <div class="registry-actions">
                <button class="row-action" data-reuse="${cadastros.indexOf(r)}">${findOpen(r) ? "Ver acesso" : "Registrar fluxo"}</button>
                <button class="row-action" data-edit="${cadastros.indexOf(r)}">Editar</button>
                <button class="row-action danger-link" data-delete="${cadastros.indexOf(r)}">Excluir</button>
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
const auditFieldNames = {
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
  purpose: "Objetivo / motivo",
  destination: "Destino",
  contact: "Pessoa de contato",
  driver: "Motorista",
  passengers: "Passageiros / carga",
  motivo: "Motivo da finalização",
};
function auditDetails(log) {
  if (log.acao === "exclusao") return "Cadastro excluído; fluxos preservados.";
  const flow = log.entidade === "fluxo";
  const before = flow ? log.antes : log.antes.dados,
    after = flow ? log.depois : log.depois.dados;
  const keys = flow
    ? [
        "em",
        "dia",
        "purpose",
        "destination",
        "contact",
        "driver",
        "passengers",
        "motivo",
      ]
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
function renderAudit() {
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
function requestResponsible(action, target) {
  if (action === "editFlow" ? !canEditFlow(target) : !isActive(target)) {
    notify(
      action === "editFlow"
        ? "Este fluxo não pode mais ser editado."
        : "Cadastro não encontrado.",
    );
    return;
  }
  clearMatch();
  pendingAction = { action, target };
  const form = $("responsibleForm");
  form.reset();
  form.elements.actorRank.innerHTML =
    '<option value="">Selecione</option>' +
    ranks.map((r) => `<option>${esc(r)}</option>`).join("");
  $("responsibleTitle").textContent =
    action === "delete"
      ? "Excluir cadastro"
      : action === "editFlow"
        ? "Editar fluxo"
        : "Editar cadastro";
  $("responsibleTarget").textContent = label(target.tipo, target.dados);
  $("responsibleHint").textContent =
    action === "delete"
      ? "O cadastro sairá da lista. Fluxos e histórico serão preservados."
      : "Identifique-se antes de editar. O histórico registrará quem alterou e quando.";
  $("responsibleSubmit").textContent =
    action === "delete" ? "Confirmar exclusão" : "Continuar";
  $("responsibleSubmit").className =
    action === "delete" ? "danger-button" : "primary";
  $("responsibleError").textContent = "";
  $("responsibleDialog").showModal();
}
function openFlowEdit(flow, actor) {
  if (!canEditFlow(flow)) throw Error("Este fluxo não pode mais ser editado.");
  editingFlow = { id: flow.id, actor: validateOperator(actor) };
  const f = $("editFlowForm"),
    initial = isInitialFlow(flow);
  const local = new Date(
    new Date(flow.em).getTime() - 3 * 3600000,
  ).toISOString();
  f.reset();
  $("editFlowName").textContent =
    `${label(flow.tipo, flow.dados)} · ${flowLabel(flow)} #${flow.id}`;
  $("editFlowHint").textContent =
    `Responsável: ${actor.posto} ${actor.nomeGuerra}. Lançado em ${date(flow.registradoEm)}. Ao alterar a data, o fluxo vai para a ficha correspondente.`;
  let fields =
    field("flowDate", "Data", null, true, "date", local.slice(0, 10)) +
    field("flowTime", "Horário", null, true, "time", local.slice(11, 16));
  if (initial) {
    fields += field(
      "destination",
      flow.tipo === "vehicle" ? "Destino / itinerário" : "Destino",
      null,
      true,
      "text",
      flow.destination,
    );
    fields +=
      flow.tipo === "vehicle"
        ? field("driver", "Motorista", null, true, "text", flow.driver) +
          field(
            "passengers",
            "Passageiros / carga",
            null,
            false,
            "text",
            flow.passengers,
          )
        : field(
            "contact",
            "Pessoa de contato",
            null,
            false,
            "text",
            flow.contact,
          );
  }
  $("editFlowFields").innerHTML = fields;
  f.elements.flowDate.max = dayKey();
  $("editPurposeLabel").hidden = !initial;
  f.elements.purpose.disabled = !initial;
  f.elements.purpose.value = flow.purpose || "";
  const finalization = !initial && flow.acao === "finalizacao";
  $("editReasonLabel").hidden = !finalization;
  f.elements.reason.disabled = !finalization;
  f.elements.reason.value = flow.motivo || "";
  $("editFlowError").textContent = "";
  $("editFlowDialog").showModal();
}
function closeNavigation() {
  const nav = $("navOptions");
  nav.classList.remove("show");
  $("navToggle").setAttribute("aria-expanded", "false");

  setTimeout(() => {
    nav.hidden = true;
  }, 200);
}
function showPage(next) {
  if (next !== "profile") clearMatch();
  if (next !== "profile") editActor = null;
  page = next;
  closeNavigation();
  const names = {
    home: "Início",
    movement: "Histórico",
    daily: "Ficha diária",
    registry: "Cadastros",
    audit: "Alterações",
    profile: "Cadastros",
    entry: "Fluxos",
  };
  $("navCurrent").textContent = names[page] || "Início";
  $("home").hidden = page !== "home";
  $("dialog").hidden = !["profile", "entry"].includes(page);
  normalSections.forEach((el) => {
    el.hidden = !["registry", "movement", "daily", "audit"].includes(page);
  });
  document
    .querySelectorAll(".nav")
    .forEach((el) => el.classList.toggle("active", el.dataset.view === page));
  render();
  window.scrollTo(0, 0);
}
function route(next) {
  location.hash = next;
  showPage(next);
}
function resetFilters() {
  for (const id of ["search", "categoryFilter", "statusFilter"])
    $(id).value = "";
}
function openFinish(id, mode) {
  const m = movimentacoes.find((r) => r.id === id);
  if (!m || !isOpen(m)) {
    notify("O acesso já foi encerrado.");
    return;
  }
  if (mode === "finalize" && !isMilitary(m.tipo)) return;
  closing = { id, mode };
  const f = $("finishForm"),
    now = nowFields(),
    finalize = mode === "finalize";
  f.reset();
  f.elements.endDate.value = now.day;
  f.elements.endTime.value = now.time;
  $("finishTitle").textContent = finalize
    ? "Finalizar anotação"
    : m.direction === "Saída"
      ? "Registrar retorno"
      : "Registrar saída";
  $("finishName").textContent = label(m.tipo, m.dados);
  $("finishHelp").textContent = finalize
    ? "Encerra somente a anotação. Nenhum horário de saída ou retorno será registrado. O motivo é opcional."
    : "Informe a data e o horário em que a movimentação realmente ocorreu.";
  $("reasonLabel").hidden = !finalize;
  f.elements.endReason.disabled = !finalize;
  f.elements.endReason.required = false;
  $("finishError").textContent = "";
  $("finishDialog").showModal();
}
function handleRowClick(e) {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.editFlow !== undefined) {
    requestResponsible(
      "editFlow",
      fluxos.find((f) => f.id === Number(b.dataset.editFlow)),
    );
    return;
  }
  if (b.dataset.edit !== undefined) {
    requestResponsible("edit", cadastros[Number(b.dataset.edit)]);
    return;
  }
  if (b.dataset.delete !== undefined) {
    requestResponsible("delete", cadastros[Number(b.dataset.delete)]);
    return;
  }
  if (b.dataset.finish) openFinish(Number(b.dataset.finish), "movement");
  if (b.dataset.finalize) openFinish(Number(b.dataset.finalize), "finalize");
  if (b.dataset.reuse !== undefined) {
    const c = cadastros[Number(b.dataset.reuse)];
    const existing = findOpen(c);
    if (existing) {
      resetFilters();
      $("search").value = label(existing.tipo, existing.dados);
      $("categoryFilter").value = c.tipo;
      $("statusFilter").value = "open";
      route("movement");
    } else openForm(c);
  }
}

$("navToggle").onclick = () => {
  const nav = $("navOptions");
  const open = $("navToggle").getAttribute("aria-expanded") !== "true";
  $("navToggle").setAttribute("aria-expanded", String(open));

  if (open) {
    nav.hidden = false;

    requestAnimationFrame(() => {
      nav.classList.add("show");
    });
  } else {
    nav.classList.remove("show");
    setTimeout(() => {
      nav.hidden = true;
    }, 200);
  }
};

document.addEventListener("click", (e) => {
  if (!e.target.closest(".nav-switch")) closeNavigation();
});
$("navOptions").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeNavigation();
    $("navToggle").focus();
  }
});
$("cancelResponsible").onclick = () => {
  pendingAction = null;
  $("responsibleDialog").close();
};
$("responsibleDialog").addEventListener("cancel", () => {
  pendingAction = null;
});
$("responsibleForm").onsubmit = (e) => {
  e.preventDefault();
  try {
    if (!pendingAction) throw Error("Selecione uma ação.");
    const f = $("responsibleForm").elements;
    const actor = resolveOperator(f.actorRank.value, f.actorWarName.value);
    const { action, target } = pendingAction;
    if (action === "delete") {
      deleteProfile(target, actor);
      pendingAction = null;
      $("responsibleDialog").close();
      render();
      notify("Cadastro excluído. Responsável e horário registrados.");
    } else {
      if (action === "editFlow" && !canEditFlow(target))
        throw Error("Este fluxo não pode mais ser editado.");
      $("responsibleDialog").close();
      if (action === "editFlow") openFlowEdit(target, actor);
      else openEdit(target, actor);
      pendingAction = null;
    }
  } catch (err) {
    $("responsibleError").textContent = err.message;
  }
};

$("cancelEditFlow").onclick = () => {
  editingFlow = null;
  $("editFlowDialog").close();
};
$("editFlowDialog").addEventListener("cancel", () => {
  editingFlow = null;
});
$("editFlowForm").onsubmit = (e) => {
  e.preventDefault();
  try {
    if (!editingFlow) throw Error("Selecione um fluxo.");
    const flow = editFlow(
      editingFlow.id,
      Object.fromEntries(new FormData($("editFlowForm"))),
      editingFlow.actor,
    );
    editingFlow = null;
    $("editFlowDialog").close();
    render();
    notify(
      `Fluxo atualizado na ficha de ${shortDay(flow.dia)}. Alteração registrada.`,
    );
  } catch (err) {
    $("editFlowError").textContent = err.message;
  }
};

$("startNew").onclick =
  $("newBtn").onclick =
  $("emptyNew").onclick =
    () => openForm();
$("startSearch").onclick = () => {
  resetFilters();
  route("registry");
  $("search").focus();
};
$("viewAll").onclick = () => {
  resetFilters();
  route("movement");
};
$("openToday").onclick = () => {
  resetFilters();
  $("dayFilter").value = dayKey();
  route("daily");
};
$("historyMode").onchange = () => {
  resetFilters();
  route($("historyMode").value);
};
$("dayFilter").onchange = render;
$("todayBtn").onclick = () => {
  $("dayFilter").value = dayKey();
  render();
};
$("prevDay").onclick = () => {
  const d = new Date(`${$("dayFilter").value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  $("dayFilter").value = d.toISOString().slice(0, 10);
  render();
};
$("nextDay").onclick = () => {
  const d = nextDay($("dayFilter").value);
  if (d <= dayKey()) {
    $("dayFilter").value = d;
    render();
  }
};
$("viewPending").onclick = () => {
  resetFilters();
  $("statusFilter").value = "open";
  route("movement");
};
$("close").onclick = $("cancel").onclick = () =>
  route(stage === "entry" || stage === "edit" ? "registry" : "home");
$("type").onchange = () => {
  clearMatch();
  setupProfile();
};
$("profileSection").addEventListener("input", lookup);
$("profileSection").addEventListener("change", (e) => {
  if (e.target.name === "rank") lookup(e);
});
$("matchList").onclick = (e) => {
  const b = e.target.closest("[data-candidate]");
  if (b) confirmMatch(Number(b.dataset.candidate));
};
$("dismissMatch").onclick = dismissMatch;
$("profileSection").addEventListener("keydown", (e) => {
  if (
    !$("matchPanel").hidden &&
    e.target === matchAnchor &&
    e.key === "ArrowDown"
  ) {
    e.preventDefault();
    $("matchList").querySelector("button")?.focus();
  }
  if (e.key === "Escape" && !$("matchPanel").hidden) {
    e.preventDefault();
    dismissMatch();
  }
});
$("matchPanel").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    dismissMatch();
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const buttons = [...$("matchList").querySelectorAll("button")];
    const current = buttons.indexOf(document.activeElement);
    if (buttons.length) {
      e.preventDefault();
      buttons[
        (current + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
          buttons.length
      ].focus();
    }
  }
});
window.addEventListener("resize", positionMatch);
window.addEventListener("scroll", positionMatch, true);
window.visualViewport?.addEventListener("resize", positionMatch);
$("cancelFinish").onclick = () => $("finishDialog").close();
for (const id of ["tbody", "recentBody", "selectedSummary"])
  $(id).onclick = handleRowClick;
for (const id of ["search", "categoryFilter", "statusFilter"])
  $(id).addEventListener(id === "search" ? "input" : "change", render);
document.querySelectorAll(".nav").forEach((b) => {
  b.onclick = () => {
    resetFilters();
    route(b.dataset.view);
  };
});
form.onsubmit = (e) => {
  e.preventDefault();
  try {
    const d = Object.fromEntries(new FormData(form));
    if (stage === "edit") {
      saveProfile({ ...d, type: editing.tipo }, editing, editActor);
      editActor = null;
      clearMatch();
      resetFilters();
      route("registry");
      notify("Cadastro atualizado.");
    } else if (stage === "profile") {
      if (findExisting(d.type, d)) {
        lookup(
          form.elements[
            d.type === "internal"
              ? "warName"
              : d.type === "vehicle"
                ? "plate"
                : "identity"
          ],
        );
        $("error").textContent =
          "Esta identificação já está cadastrada. Selecione a pessoa no balão ou corrija a identificação.";
        return;
      }
      const c = saveProfile(d);
      if (e.submitter?.value === "only") {
        resetFilters();
        route("registry");
        notify("Cadastro salvo.");
      } else {
        openForm(c);
        notify("Cadastro salvo. Informe o fluxo.");
      }
    } else {
      const m = addMovement(selected, d);
      resetFilters();
      route("movement");
      notify(
        m.direction === "Saída" ? "Saída registrada." : "Entrada registrada.",
      );
    }
  } catch (err) {
    $("error").textContent = err.message;
  }
};
$("finishForm").onsubmit = (e) => {
  e.preventDefault();
  try {
    const f = $("finishForm").elements;
    const m = closeMovement(
      closing.id,
      closing.mode,
      f.endDate.value,
      f.endTime.value,
      f.endReason.value,
    );
    $("finishDialog").close();
    render();
    if (page === "entry") setupEntry();
    notify(
      m.encerramento.tipo === "finalizacao"
        ? "Anotação finalizada sem saída ou retorno."
        : m.encerramento.tipo === "saida"
          ? "Saída registrada."
          : "Retorno registrado.",
    );
  } catch (err) {
    $("finishError").textContent = err.message;
  }
};
window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1);
  if (next === "entry" && !selected) {
    route("home");
    return;
  }
  if (
    next === "profile" &&
    (!["profile", "edit"].includes(stage) || (stage === "edit" && !editActor))
  ) {
    openForm();
    return;
  }
  showPage(
    [
      "home",
      "registry",
      "movement",
      "daily",
      "audit",
      "entry",
      "profile",
    ].includes(next)
      ? next
      : "home",
  );
});
let midnightTimer,
  uiDay = dayKey();
function clock() {
  $("clock").textContent = date(new Date().toISOString());
}
function refreshDay() {
  const previous = uiDay;
  syncSheets();
  clock();
  const changed = previous !== dayKey();
  uiDay = dayKey();
  if (changed) {
    if (!$("dayFilter").value || $("dayFilter").value === previous)
      $("dayFilter").value = dayKey();
    render();
  }
}
function scheduleMidnight() {
  clearTimeout(midnightTimer);
  const next = new Date(`${nextDay(dayKey())}T00:00:00-03:00`).getTime();
  midnightTimer = setTimeout(
    () => {
      refreshDay();
      scheduleMidnight();
    },
    Math.max(100, next - Date.now()),
  );
}
syncSheets();
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

if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(
      document.modelContext.registerTool({
        name: "search_session_records",
        title: "Consultar fluxos",
        description:
          "Consulta os eventos de fluxo desta sessão e suas fichas diárias.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          if (!input || typeof input.query !== "string")
            throw Error("query deve ser texto");
          return fluxos
            .filter((f) =>
              norm(label(f.tipo, f.dados) + " " + f.chave).includes(
                norm(input.query),
              ),
            )
            .map((f) => ({
              id: f.id,
              nome: label(f.tipo, f.dados),
              categoria: types[f.tipo],
              dia: f.dia,
              acao: flowLabel(f),
              horario: f.em,
              registradoEm: f.registradoEm,
              acessoId: f.movimentoId,
            }));
        },
      }),
    ).catch(() => {});
  } catch {}
}
