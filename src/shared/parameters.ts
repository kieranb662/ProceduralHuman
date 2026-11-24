/**
 * Describes one numeric, user-adjustable parameter. Shared by section APIs (as metadata) and
 * editors (to build sliders). `scale` converts stored values to displayed ones (1000: m -> mm).
 */
export interface NumericParameter<K extends string = string> {
  key: K;
  label: string;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  unit?: string;
  scale?: number;
}
