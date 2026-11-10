export type BoardCard = {
  company: string;
  place: string;
  note: string;
  fit?: boolean;
  dropped?: boolean;
};

export type BoardColumn = {
  name: string;
  hint: string;
  cards: BoardCard[];
};

export const SAMPLE_BOARD: BoardColumn[] = [
  {
    name: "Found",
    hint: "In the search. Not yet checked.",
    cards: [
      {
        company: "Harbour Malt",
        place: "Tema",
        note: "Beverage wholesale. City still unconfirmed, so it stays on the list.",
      },
      {
        company: "Northline Cold Store",
        place: "Kano",
        note: "Known to sit outside Nigeria and Ghana. It does not stay.",
        dropped: true,
      },
    ],
  },
  {
    name: "Qualified",
    hint: "Matches the profile.",
    cards: [
      {
        company: "Lagos Fresh Mills",
        place: "Lagos",
        note: "Packaged foods. About 80–120 people. Inside the territory.",
        fit: true,
      },
      {
        company: "Accra Provisions",
        place: "Accra",
        note: "Wholesale grocery. Trade and size line up.",
        fit: true,
      },
    ],
  },
  {
    name: "Ready to contact",
    hint: "A draft is waiting. You send it.",
    cards: [
      {
        company: "Lagos Fresh Mills",
        place: "Lagos",
        note: "Draft to the distribution lead. Nothing sends until you say so.",
        fit: true,
      },
    ],
  },
];
