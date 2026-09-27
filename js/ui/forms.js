import { directions, ranks, types } from "../config/constants.js";
import { $, esc, field, form, notify, setSection } from "./dom.js";
import { date, dayKey, nowFields } from "../utils/dates.js";
import { flowLabel, isActive, isMilitary, isOpen, label } from "../utils/format.js";
import { findOpen, validateOperator } from "../domain/profiles.js";
import { appState, movimentacoes } from "../state.js";
import { rowActions } from "./render.js";
import { clearMatch } from "./lookup.js";
import { route } from "./navigation.js";
import { canEditFlow, directionFor, oppositeDirection } from "../domain/flows.js";

export function setupProfile() {
  const t = $("type").value;
  $("keyHint").textContent =
    t === "internal"
      ? "Informe posto/graduação e nome de guerra para verificar se já há cadastro."
      : t === "vehicle"
        ? "Informe a placa para verificar se já há cadastro."
        : "Informe a identidade para verificar se já há cadastro.";
  const profileFields = {
    civil: field("name", "Nome completo") + field("identity", "Identidade") +
      field("phone", "Telefone", null, true, "tel"),
    external: field("rank", "Posto / graduação", ranks) +
      field("name", "Nome completo") + field("warName", "Nome de guerra") +
      field("om", "OM de origem") + field("identity", "Identidade") +
      field("phone", "Telefone para contato", null, true, "tel"),
    internal: field("rank", "Posto / graduação", ranks) +
      field("warName", "Nome de guerra") + field("section", "Seção / subunidade"),
    vehicle: field("plate", "Placa") + field("model", "Modelo / tipo de viatura") +
      field("om", "OM responsável"),
  };
  $("keyFields").innerHTML = profileFields[t];
  $("profileFields").innerHTML = "";
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

export function flowFields(tipo, data = {}, dateName = "visitDate", timeName = "visitTime") {
  const now = nowFields();
  let fields = field("direction", "Entrada ou saída", directions, true, "text", data.direction || "Entrada") +
    field(dateName, "Data", null, true, "date", data[dateName] || now.day) +
    field(timeName, "Horário", null, true, "time", data[timeName] || now.time) +
    field("destination", "Destino", null, true, "text", data.destination);
  if (tipo === "vehicle") {
    fields += field("driverRank", "Posto / graduação do motorista", ranks.driver, true, "text", data.driverRank) +
      field("driverWarName", "Nome de guerra do motorista", null, true, "text", data.driverWarName) +
      field("vehicleChief", "Chefe da viatura", null, true, "text", data.vehicleChief) +
      field("odometerInitial", "Odômetro inicial", null, true, "text", data.odometerInitial) +
      field("odometerFinal", "Odômetro final", null, true, "text", data.odometerFinal);
  } else {
    fields += field("vehiclePlate", "Placa do veículo", null, false, "text", data.vehiclePlate === "N/A" ? "" : data.vehiclePlate);
    if (tipo === "civil" || tipo === "external")
      fields += `<label class="full">Motivo <span class="optional">(opcional)</span><textarea name="purpose" rows="2" maxlength="1000" placeholder="Informe o motivo, se necessário">${esc(data.purpose)}</textarea></label>`;
  }
  return fields;
}

export function updateOdometerFields(container) {
  const direction = container.querySelector('[name="direction"]')?.value;

  for (const [name, expected] of [
    ["odometerInitial", "Saída"],
    ["odometerFinal", "Entrada"],
  ]) {
    const input = container.querySelector(`[name="${name}"]`);

    if (!input) continue;

    const active = direction === expected;

    input.closest("label").hidden = !active;
    input.disabled = !active;
    input.required = active;
  }

  const isVehicle = !!container.querySelector('[name="odometerInitial"]');
  const destination = container.querySelector('[name="destination"]');

  if (isVehicle && destination) {
    const active = direction === "Saída";

    destination.closest("label").hidden = !active;
    destination.disabled = !active;
    destination.required = active;

    if (!active)
      destination.value = "";
  }
}

export function bindFlowFields(container, dateName) {
  container.querySelector(`[name="${dateName}"]`).max = dayKey();
  const direction = container.querySelector('[name="direction"]');
  if (direction) direction.onchange = () => updateOdometerFields(container);
  updateOdometerFields(container);
}

export function setupEntry() {
  const t = appState.selected.tipo;
  $("visitFields").innerHTML = flowFields(t, { direction: t === "vehicle" ? "Saída" : "Entrada" });
  bindFlowFields($("visitFields"), "visitDate");
  const existing = findOpen(appState.selected);
  $("selectedSummary").innerHTML =
  `
    <span class="eyebrow">CADASTRO SELECIONADO</span>
    <h2>${esc(label(t, appState.selected.dados))}</h2>
    <p>${types[t]}</p>
    ${existing ?
  `
  <div class="open-warning">
    <strong>Há um acesso pendente desde ${date(existing.inicio)}.</strong>
    <p>Encerre a anotação antes de registrar outro acesso.</p>
    ${rowActions(existing, "")}
  </div>
  ` : ""}`;
  $("entryHint").textContent = isMilitary(t)
    ? "O expediente normal não exige anotação. Em casos como pernoite seguido de expediente, a anotação pode ser finalizada sem registrar uma saída."
    : t === "civil"
      ? "Selecione entrada ou saída. Sem veículo, deixe a placa vazia: será registrada como N/A."
      : "Na saída, informe o odômetro inicial. Na entrada, informe o odômetro final.";
  $("submit").textContent = "Registrar fluxo";
  $("submit").disabled = !!existing;
}

export function openForm(record = null) {
  clearMatch();
  appState.editActor = null;
  appState.editing = null;
  appState.selected = record;
  appState.stage = record ? "entry" : "profile";
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
  if (record) updateOdometerFields($("visitFields"));
  $("saveOnly").hidden = !!record;
  $("flowLookupResult").hidden = true;
  $("profileSaveHint").hidden = false;
  $("formTitle").textContent = record ? "Registrar fluxo" : "Novo cadastro";
  if (!record) $("submit").textContent = "Salvar e registrar fluxo";
  $("cancel").innerHTML = record
    ? "Cadastros"
    : '<span class="material-symbols-rounded">home</span>';
  route(record ? "entry" : "profile");
}

export function openEdit(c, actor) {
  validateOperator(actor);
  if (!isActive(c)) throw Error("Cadastro excluído.");
  appState.editActor = actor;
  clearMatch();
  appState.editing = c;
  appState.selected = null;
  appState.stage = "edit";
  form.reset();
  $("type").value = c.tipo;
  setupProfile();
  setSection("profileSection", true);
  setSection("entrySection", false);
  $("type").disabled = true;
  for (const [name, value] of Object.entries(c.dados))
    if (form.elements[name]) form.elements[name].value = value;
  $("saveOnly").hidden = true;
  $("flowLookupResult").hidden = true;
  $("profileSaveHint").hidden = false;
  $("submit").disabled = false;
  $("submit").textContent = "Salvar alterações";
  $("formTitle").textContent = "Editar cadastro";
  $("cancel").textContent = "Cancelar";
  $("keyHint").textContent =
    `Responsável: ${actor.posto} ${actor.nomeGuerra}. As alterações serão registradas no histórico.`;
  route("profile");
}

export function requestResponsible(action, target) {
  if (action === "editFlow" ? !canEditFlow(target) : !isActive(target)) {
    notify(
      action === "editFlow"
        ? "Este fluxo não pode mais ser editado."
        : "Cadastro não encontrado.",
    );
    return;
  }
  clearMatch();
  appState.pendingAction = { action, target };
  const form = $("responsibleForm");
  form.reset();
  form.elements.actorRank.innerHTML =
    '<option value="">Selecione</option>' +
    ranks.driver.map((r) => `<option>${esc(r)}</option>`).join("");
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

export function openFlowEdit(flow, actor) {
  if (!canEditFlow(flow)) throw Error("Este fluxo não pode mais ser editado.");
  appState.editingFlow = { id: flow.id, actor: validateOperator(actor) };
  const f = $("editFlowForm");
  const local = new Date(new Date(flow.em).getTime() - 3 * 3600000).toISOString();
  const finalization = flow.acao === "finalizacao";
  f.reset();
  $("editFlowName").textContent = `${label(flow.tipo, flow.dados)} · ${flowLabel(flow)} #${flow.id}`;
  $("editFlowHint").textContent =
    `Responsável: ${actor.posto} ${actor.nomeGuerra}. Lançado em ${date(flow.registradoEm)}. Ao alterar a data, o fluxo vai para a ficha correspondente.`;
  $("editFlowFields").innerHTML = finalization
    ? field("flowDate", "Data", null, true, "date", local.slice(0, 10)) +
      field("flowTime", "Horário", null, true, "time", local.slice(11, 16))
    : flowFields(flow.tipo, {
        ...flow, direction: directionFor(flow),
        flowDate: local.slice(0, 10), flowTime: local.slice(11, 16),
      }, "flowDate", "flowTime");
  bindFlowFields($("editFlowFields"), "flowDate");
  $("editReasonLabel").hidden = !finalization;
  f.elements.reason.disabled = !finalization;
  f.elements.reason.value = flow.motivo || "";
  $("editFlowError").textContent = "";
  $("editFlowDialog").showModal();
}

export function openFinish(id, mode) {
  const m = movimentacoes.find((r) => r.id === id);
  if (!m || !isOpen(m)) {
    notify("O acesso já foi encerrado.");
    return;
  }
  if (mode === "finalize" && !isMilitary(m.tipo)) return;
  appState.closing = { id, mode };
  const f = $("finishForm"),
    now = nowFields(),
    finalize = mode === "finalize";
  f.reset();
  $("finishFields").innerHTML = finalize
    ? field("endDate", "Data", null, true, "date", now.day) +
      field("endTime", "Horário", null, true, "time", now.time)
    : flowFields(m.tipo, {
        ...m, direction: oppositeDirection(m.direction),
        endDate: now.day, endTime: now.time,
        odometerInitial: "", odometerFinal: "",
      }, "endDate", "endTime");
  bindFlowFields($("finishFields"), "endDate");
  if (!finalize) {
    // Um acesso pendente é encerrado pelo movimento no sentido oposto.
    const direction = f.elements.direction;
    direction.innerHTML = `<option>${esc(oppositeDirection(m.direction))}</option>`;
  }
  $("finishTitle").textContent = finalize
    ? "Finalizar anotação"
    : m.direction === "Saída" ? "Registrar entrada" : "Registrar saída";
  $("finishName").textContent = label(m.tipo, m.dados);
  $("finishHelp").textContent = finalize
    ? "Encerra somente a anotação. Nenhum horário de saída ou entrada será registrado. O motivo é opcional."
    : "Confira os dados e informe quando esta entrada ou saída realmente ocorreu.";
  $("reasonLabel").hidden = !finalize;
  f.elements.endReason.disabled = !finalize;
  f.elements.endReason.required = false;
  $("finishError").textContent = "";
  $("finishDialog").showModal();
}

