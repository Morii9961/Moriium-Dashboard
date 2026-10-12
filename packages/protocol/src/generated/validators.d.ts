// 由 packages/protocol/scripts/generate-validators.ts 生成，不要手改。
import type { ErrorObject } from 'ajv';

export interface CompiledValidator {
  (data: unknown): boolean;
  errors?: ErrorObject[] | null;
}

export declare const validateV1_0: CompiledValidator;
export declare const validateV1_1: CompiledValidator;
