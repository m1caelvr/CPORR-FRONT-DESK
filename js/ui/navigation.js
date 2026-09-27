import { $, normalSections } from "./dom.js";
import { appState, cadastros, fluxos } from "../state.js";
import { clearMatch } from "./lookup.js";
import { render } from "./render.js";
import { findOpen } from "../domain/profiles.js";
import { label } from "../utils/format.js";
import { openFinish, openForm, requestResponsible } from "./forms.js";

export function closeNavigation() {
  const nav = $("navOptions");
  nav.classList.remove("show");
  $("navToggle").setAttribute("aria-expanded", "false");

  setTimeout(() => {
    nav.hidden = true;
  }, 200);
}

export function showPage(next) {
  if (next !== "profile") clearMatch();
  if (next !== "profile") appState.editActor = null;
  appState.page = next;
  closeNavigation();
  const names = {
    home: "Início",
    movement: "Histórico",
    daily: "Ficha diária",
    registry: "Cadastros",
    audit: "Alterações",
    reports: "Relatórios",
    profile: appState.stage === "lookup" ? "Fluxos" : "Cadastros",
    entry: "Fluxos",
  };
  $("navCurrent").textContent = names[appState.page] || "Início";
  $("home").hidden = appState.page !== "home";
  $("reportsPage").hidden = appState.page !== "reports";
  $("dialog").hidden = !["profile", "entry"].includes(appState.page);
  normalSections.forEach((el) => {
    el.hidden = !["registry", "movement", "daily", "audit"].includes(appState.page);
  });
  document
    .querySelectorAll(".nav")
    .forEach((el) => el.classList.toggle("active", el.dataset.view === appState.page));
  render();
  window.scrollTo(0, 0);
}

export function route(next) {
  location.hash = next;
  showPage(next);
}

export function resetFilters() {
  for (const id of ["search", "categoryFilter", "statusFilter"])
    $(id).value = "";
}

export function handleRowClick(e) {
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

