import { $, form, notify } from "./dom.js";
import { closeNavigation, handleRowClick, resetFilters, route, showPage } from "./navigation.js";
import { appState } from "../state.js";
import { deleteProfile, findExisting, resolveOperator, saveProfile } from "../domain/profiles.js";
import { addMovement, canEditFlow, closeMovement, editFlow } from "../domain/flows.js";
import { openEdit, openFlowEdit, openForm, setupEntry, setupProfile } from "./forms.js";
import { render } from "./render.js";
import { dayKey, nextDay, shortDay } from "../utils/dates.js";
import { clearMatch, confirmFlowLookup, confirmMatch, dismissMatch, lookup, openFlowLookup, positionMatch, registerFromFlow, renderFlowLookup, setupFlowLookup } from "./lookup.js";

export function bindEvents() {
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
  appState.pendingAction = null;
  $("responsibleDialog").close();
};

$("responsibleDialog").addEventListener("cancel", () => {
  appState.pendingAction = null;
});

$("responsibleForm").onsubmit = (e) => {
  e.preventDefault();
  try {
    if (!appState.pendingAction) throw Error("Selecione uma ação.");
    const f = $("responsibleForm").elements;
    const actor = resolveOperator(f.actorRank.value, f.actorWarName.value);
    const { action, target } = appState.pendingAction;
    if (action === "delete") {
      deleteProfile(target, actor);
      appState.pendingAction = null;
      $("responsibleDialog").close();
      render();
      notify("Cadastro excluído. Responsável e horário registrados.");
    } else {
      if (action === "editFlow" && !canEditFlow(target))
        throw Error("Este fluxo não pode mais ser editado.");
      $("responsibleDialog").close();
      if (action === "editFlow") openFlowEdit(target, actor);
      else openEdit(target, actor);
      appState.pendingAction = null;
    }
  } catch (err) {
    $("responsibleError").textContent = err.message;
  }
};

$("cancelEditFlow").onclick = () => {
  appState.editingFlow = null;
  $("editFlowDialog").close();
};

$("editFlowDialog").addEventListener("cancel", () => {
  appState.editingFlow = null;
});

$("editFlowForm").onsubmit = (e) => {
  e.preventDefault();
  try {
    if (!appState.editingFlow) throw Error("Selecione um fluxo.");
    const flow = editFlow(
      appState.editingFlow.id,
      Object.fromEntries(new FormData($("editFlowForm"))),
      appState.editingFlow.actor,
    );
    appState.editingFlow = null;
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

$("startSearch").onclick = openFlowLookup;

$("flowLookupResult").onclick = (event) => {
  if (event.target.closest("#confirmFlowLookup")) {
    confirmFlowLookup();
  }

  if (event.target.closest("#createFromFlow")) {
    registerFromFlow();
  }
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

$("todayBtn").onclick = () => {
  $("dayFilter").value = dayKey();
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
  }
  render();
};

$("viewPending").onclick = () => {
  resetFilters();
  $("statusFilter").value = "open";
  route("movement");
};

$("close").onclick = $("cancel").onclick = () =>
  route(appState.stage === "entry" || appState.stage === "edit" ? "registry" : "home");

$("type").onchange = () => {
  clearMatch();

  if (appState.stage === "lookup") setupFlowLookup();
  else setupProfile();
};

$("profileSection").addEventListener("input", lookup);

$("profileSection").addEventListener("change", (event) => {
  if (appState.stage === "lookup" || event.target.name === "rank") {
    lookup(event);
  }
});

$("matchList").onclick = (e) => {
  const b = e.target.closest("[data-candidate]");
  if (b) confirmMatch(Number(b.dataset.candidate));
};

$("dismissMatch").onclick = dismissMatch;

$("profileSection").addEventListener("keydown", (e) => {
  if (
    !$("matchPanel").hidden &&
    e.target === appState.matchAnchor &&
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
    if (appState.stage === "lookup") {
      renderFlowLookup();
      return;
    }
    if (appState.stage === "edit") {
      saveProfile({ ...d, type: appState.editing.tipo }, appState.editing, appState.editActor);
      appState.editActor = null;
      clearMatch();
      resetFilters();
      route("registry");
      notify("Cadastro atualizado.");
    } else if (appState.stage === "profile") {
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
      const m = addMovement(appState.selected, d);
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
      appState.closing.id,
      appState.closing.mode,
      f.endDate.value,
      f.endTime.value,
      f.endReason.value,
      Object.fromEntries(new FormData($("finishForm"))),
    );
    $("finishDialog").close();
    render();
    if (appState.page === "entry") setupEntry();
    notify(
      m.encerramento.tipo === "finalizacao"
        ? "Anotação finalizada sem saída ou retorno."
        : m.encerramento.tipo === "saida"
          ? "Saída registrada."
          : "Entrada registrada.",
    );
  } catch (err) {
    $("finishError").textContent = err.message;
  }
};

window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1);
  if (next === "entry" && !appState.selected) {
    route("home");
    return;
  }
  if (
    next === "profile" &&
    (!["profile", "edit", "lookup"].includes(appState.stage) || (appState.stage === "edit" && !appState.editActor))
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
      "reports",
      "entry",
      "profile",
    ].includes(next)
      ? next
      : "home",
  );
});

}
