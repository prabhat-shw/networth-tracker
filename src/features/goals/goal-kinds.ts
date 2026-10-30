import type { GoalKind } from "@/domain/records/goal";

export const GOAL_KIND_LABEL: Readonly<Record<GoalKind, string>> = {
  house: "House",
  education: "Education",
  retirement: "Retirement",
  emergency: "Emergency fund",
  vehicle: "Vehicle",
  wedding: "Wedding",
  travel: "Travel",
  custom: "Something else",
};

/** Until M5's goal maths reviews it per kind (UX.md §12.1); the record keeps the rate used. */
export const DEFAULT_RETURN_BPS = 1000;
