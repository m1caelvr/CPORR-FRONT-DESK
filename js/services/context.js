import { fluxos } from "../state.js";
import { types } from "../config/constants.js";
import { flowLabel, label, norm } from "../utils/format.js";

export function registerContext() {
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

}
