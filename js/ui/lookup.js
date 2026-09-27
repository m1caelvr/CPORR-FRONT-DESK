import { ranks, types } from "../config/constants.js";
import { keyNames, label } from "../utils/format.js";
import { $, esc, field, form, setSection } from "./dom.js";
import { findExisting, keyReady, suggestProfiles } from "../domain/profiles.js";
import { appState } from "../state.js";
import { route } from "./navigation.js";
import { openForm, setupProfile } from "./forms.js";

export function flowCandidateLabel(cadastro) {
  const { tipo, dados } = cadastro;

  const detalhe =
    tipo === "internal"
      ? dados.section
      : tipo === "external"
        ? dados.om
        : tipo === "vehicle"
          ? dados.model
          : "Civil";

  return `${label(tipo, dados)} (${detalhe || types[tipo]})`;
}

export function setupFlowLookup() {
  const tipo = $("type").value;

  $("keyHint").textContent =
    tipo === "internal"
      ? "Informe posto/graduação e nome de guerra."
      : tipo === "vehicle"
        ? "Informe a placa da viatura."
        : "Informe a identidade da pessoa.";

  $("keyFields").innerHTML =
    tipo === "internal"
      ? field("rank", "Posto / graduação", ranks) +
        field("warName", "Nome de guerra")
      : tipo === "vehicle"
        ? field("plate", "Placa")
        : field("identity", "Identidade");

  $("profileFields").innerHTML = "";
  $("flowLookupResult").innerHTML = "";
  $("flowLookupResult").hidden = true;
  $("error").textContent = "";
}

export function renderFlowLookup() {
  const dados = Object.fromEntries(new FormData(form));
  const resultado = $("flowLookupResult");

  if (!keyReady(dados.type, dados)) {
    resultado.innerHTML = "";
    resultado.hidden = true;
    return;
  }

  const cadastro = findExisting(dados.type, dados);
  const viatura = dados.type === "vehicle";

  resultado.innerHTML = cadastro
    ? `
      <strong>${esc(flowCandidateLabel(cadastro))}</strong>
      <p>
        ${viatura ? "É esta viatura?" : "É esta pessoa?"}
        Confira antes de registrar o fluxo.
      </p>
      <button type="button" class="primary" id="confirmFlowLookup">
        Sim, registrar fluxo
      </button>
    `
    : `
      <strong>${viatura ? "Viatura" : "Pessoa"} não cadastrada.</strong>
      <p>
        Para registrar o fluxo, cadastre
        ${viatura ? "a viatura" : "a pessoa"} primeiro.
      </p>
      <button type="button" class="secondary" id="createFromFlow">
        ${viatura ? "Cadastrar viatura" : "Cadastrar pessoa"}
      </button>
    `;

  resultado.hidden = false;
}

export function openFlowLookup() {
  clearMatch();

  appState.selected = null;
  appState.editing = null;
  appState.editActor = null;
  appState.stage = "lookup";

  form.reset();
  $("type").value = "civil";

  setSection("profileSection", true);
  setSection("entrySection", false);

  $("type").disabled = false;
  $("formTitle").textContent = "Novo fluxo";
  $("saveOnly").hidden = true;
  $("submit").disabled = false;
  $("submit").textContent = "Buscar cadastro";
  $("profileSaveHint").hidden = true;
  $("cancel").textContent = "Voltar";

  setupFlowLookup();
  route("profile");
}

export function confirmFlowLookup() {
  if (appState.stage !== "lookup") return;

  const dados = Object.fromEntries(new FormData(form));
  const cadastro = findExisting(dados.type, dados);

  if (cadastro) openForm(cadastro);
  else renderFlowLookup();
}

export function registerFromFlow() {
  if (appState.stage !== "lookup") return;

  const dados = Object.fromEntries(new FormData(form));

  if (!keyReady(dados.type, dados) || findExisting(dados.type, dados)) {
    renderFlowLookup();
    return;
  }

  openForm();
  $("type").value = dados.type;
  setupProfile();

  for (const nome of keyNames(dados.type)) {
    form.elements[nome].value = dados[nome] || "";
  }
}

export function clearMatch() {
  if (appState.matchAnchor) appState.matchAnchor.setAttribute("aria-expanded", "false");
  $("matchPanel").hidden = true;
  appState.matchCandidates = [];
  appState.matchAnchor = null;
}

export function positionMatch() {
  if (!appState.matchAnchor || $("matchPanel").hidden) return;
  const box = appState.matchAnchor.getBoundingClientRect(),
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

export function lookup(eventOrInput) {
  // Consulta usada na tela "Novo fluxo".
  if (appState.stage === "lookup" && appState.page === "profile") {
    const dados = Object.fromEntries(new FormData(form));
    const cadastro = findExisting(dados.type, dados);

    if (eventOrInput?.type === "input" && !cadastro) {
      $("flowLookupResult").hidden = true;
    } else {
      renderFlowLookup();
    }

    return [];
  }

  if (!["profile", "edit"].includes(appState.stage) || appState.page !== "profile") return [];

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
    appState.editing?.tipo || $("type").value,
    input.name,
    input.value,
    appState.editing,
  );

  clearMatch();
  if (!candidates.length) return [];

  appState.matchAnchor = input;
  appState.matchCandidates = candidates;
  input.setAttribute("aria-expanded", "true");

  const vehicle = (appState.editing?.tipo || $("type").value) === "vehicle";

  $("matchTitle").textContent = vehicle
    ? "É esta viatura?"
    : "É esta pessoa?";

  $("matchCount").textContent =
    `${candidates.length} ${
      candidates.length === 1
        ? "cadastro encontrado"
        : "cadastros encontrados"
    }`;

  $("matchHelp").textContent =
    appState.stage === "edit"
      ? "Outra pessoa já cadastrada. Confira a identificação antes de salvar."
      : "Selecione para preencher os dados.";

  $("matchList").innerHTML = candidates
    .map((c, i) => {
      const details = [
        c.dados.identity ? `Identidade: ${c.dados.identity}` : "",
        c.dados.phone ? `Telefone: ${c.dados.phone}` : "",
        c.dados.model || c.dados.om || c.dados.section || "",
      ]
        .filter(Boolean)
        .join(" · ");

      return `
        <button
          type="button"
          class="match-choice"
          data-candidate="${i}"
        >
          <strong>${esc(label(c.tipo, c.dados))}</strong>

          ${
            c.dados.name && c.dados.name !== label(c.tipo, c.dados)
              ? `<span>${esc(c.dados.name)}</span>`
              : ""
          }

          <small>${esc(details)}</small>

          <span class="match-pick">
            ${
              appState.stage === "edit"
                ? "Conferir este cadastro"
                : "Sim, é este cadastro"
            } →
          </span>
        </button>
      `;
    })
    .join("");

  $("matchPanel").hidden = false;
  positionMatch();

  return candidates;
}

export function confirmMatch(index) {
  const c = appState.matchCandidates[index],
    anchor = appState.matchAnchor;
  if (
    !c ||
    !anchor ||
    !suggestProfiles(
      appState.editing?.tipo || $("type").value,
      anchor.name,
      anchor.value,
      appState.editing,
    ).includes(c)
  ) {
    clearMatch();
    return;
  }
  if (appState.stage === "edit") {
    clearMatch();
    $("error").textContent =
      `Confira os dados: ${label(c.tipo, c.dados)} já está cadastrado. Suas alterações ainda não foram salvas.`;
    anchor.focus();
    return;
  }
  clearMatch();
  openForm(c);
}

export function dismissMatch() {
  const anchor = appState.matchAnchor;
  clearMatch();
  anchor?.focus();
}

