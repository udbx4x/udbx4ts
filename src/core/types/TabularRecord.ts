export interface TabularRecord<
  TAttributes extends Record<string, unknown> = Record<string, unknown>
> {
  readonly id: number;
  readonly attributes: TAttributes;
}
