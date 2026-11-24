/** Left/right body sides with the sign that mirrors their x coordinate. */
export type Side = "L" | "R";
export type SideSign = 1 | -1;
export const SIDES: readonly (readonly [Side, SideSign])[] = [["L", 1], ["R", -1]];
