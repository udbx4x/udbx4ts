import type { FieldType } from "./FieldType";

export interface FieldInfo {
  readonly name: string;
  readonly fieldType: FieldType;
  readonly nullable: boolean;
  readonly defaultValue?: unknown;
}

