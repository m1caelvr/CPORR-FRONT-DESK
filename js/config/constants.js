export const TIME_ZONE = "America/Sao_Paulo";

export const types = {
  civil: "Visitante civil",
  external: "Militar de outra OM",
  internal: "Militar do CPOR",
  vehicle: "Viatura da OM",
};

export const ranks = [
  "Aluno",
  "Cadete",
  "SD EV",
  "SD EP",
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

ranks.driver = [
  "SD EV",
  "SD EP",
  "CB",
  "3º SGT",
  "2º SGT",
  "1º SGT",
  "ST",
  "ASP",
  "2º TEN",
  "1º TEN",
];

export const profileNames = {
  civil: ["name", "phone"],
  external: ["rank", "name", "warName", "om", "phone"],
  internal: ["section"],
  vehicle: ["model", "om"],
};

export const directions = ["Entrada", "Saída"];

export const flowDetailKeys = [
  "destination",
  "vehiclePlate",
  "purpose",
  "driverRank",
  "driverWarName",
  "vehicleChief",
  "odometerInitial",
  "odometerFinal",
];
