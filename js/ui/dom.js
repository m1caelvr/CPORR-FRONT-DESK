import { appState } from "../state.js";

export const $ = (id) => document.getElementById(id);

export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export const form = $("form");

export const normalSections = [
  ...document.querySelectorAll(
    "main > .heading, main > .metrics, main > .panel, main > .footnote, main > .history-controls",
  ),
];

export function field(
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
  return `<label>${title}${required ? "" : ' <span class="optional">(opcional)</span>'}${control}</label>`;
}

export function notify(msg) {
  $("toast").textContent = msg;
  $("toast").style.display = "block";
  clearTimeout(appState.toastTimer);
  appState.toastTimer = setTimeout(() => {
    $("toast").style.display = "none";
  }, 4000);
}

export function setSection(id, active) {
  $(id).hidden = !active;
  $(id)
    .querySelectorAll("input,select,textarea")
    .forEach((el) => {
      el.disabled = !active;
    });
}

