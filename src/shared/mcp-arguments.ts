export const maxMcpArgumentsLength = 8_000

export function parseMcpArguments(source: string): Record<string, unknown> {
  if (source.length > maxMcpArgumentsLength) throw new Error('Arguments exceed 8,000 characters.')
  let value: unknown
  try { value = JSON.parse(source) }
  catch { throw new Error('Enter valid JSON, such as {} when the tool takes no arguments.') }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Tool arguments must be a JSON object.')
  }
  return value as Record<string, unknown>
}
