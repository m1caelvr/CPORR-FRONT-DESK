import { dayKey } from "./utils/dates.js";

export const cadastros = [];

export const movimentacoes = [];

export const fluxos = [];

export const fichas = [];

export const auditoria = [];

export const appState = {
  fluxoSeq: 0,
  lastSheetDay: null,
  seq: 0,
  cadastroSeq: 0,
  auditSeq: 0,
  page: "home",
  stage: "profile",
  selected: null,
  editing: null,
  matchAnchor: null,
  matchCandidates: [],
  closing: null,
  toastTimer: undefined,
  pendingAction: null,
  editActor: null,
  editingFlow: null,
  midnightTimer: undefined,
  uiDay: dayKey(),
};
