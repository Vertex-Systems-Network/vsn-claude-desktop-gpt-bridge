export type McpProbe = { executable: string; args: string[] }
export type McpDiscovery = { tools: { name: string; description: string }[]; truncated: boolean }

export type McpProfileInput = McpProbe & { id?: string; name: string }
export type McpProfile = McpProbe & { id: string; name: string }

export type McpCall = McpProbe & { tool: string; argumentsJson: string }
export type McpCallResult = { text: string; failed: boolean; truncated: boolean }
