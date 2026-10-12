/** Project Status Protocol 支持的版本。校验、规范化与差异比较在 P1.3 加入。 */
export const SUPPORTED_SCHEMA_VERSIONS = ['1.0', '1.1'] as const;

export type SchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];

export function isSupportedSchemaVersion(value: unknown): value is SchemaVersion {
  return (SUPPORTED_SCHEMA_VERSIONS as readonly unknown[]).includes(value);
}
