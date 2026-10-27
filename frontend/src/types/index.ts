import { z } from 'zod';

export type NodeType = 'User' | 'Agent' | 'Model' | 'Tool' | 'DataSource' | 'Policy';

export const nodeTypeSchema = z.enum([
  'User',
  'Agent',
  'Model',
  'Tool',
  'DataSource',
  'Policy',
]);

export const graphNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: nodeTypeSchema,
  source_doc: z.string().optional().nullable(),
  props: z.record(z.unknown()).optional(),
});

export const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string(),
  source_doc: z.string().optional().nullable(),
  props: z.record(z.unknown()).optional(),
});

export const graphDataSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  node_count: z.number(),
  edge_count: z.number(),
});

export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphData = z.infer<typeof graphDataSchema>;

export const documentSummarySchema = z.object({
  filename: z.string(),
  agents: z.array(z.string()),
  node_count: z.number(),
  edge_count: z.number(),
});

export type DocumentSummary = z.infer<typeof documentSummarySchema>;

export const ingestionSummarySchema = z.object({
  nodes_processed: z.number(),
  edges_processed: z.number(),
  source_doc: z.string(),
});

export const ingestionResponseSchema = z.object({
  summary: ingestionSummarySchema,
  graph: graphDataSchema,
});

export type IngestionSummary = z.infer<typeof ingestionSummarySchema>;
export type IngestionResponse = z.infer<typeof ingestionResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const errorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const errorResponseSchema = z.object({
  error: errorDetailSchema,
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const authCheckResponseSchema = z.object({
  authenticated: z.boolean(),
  message: z.string(),
});

export type AuthCheckResponse = z.infer<typeof authCheckResponseSchema>;

export const neighborNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  source_doc: z.string().optional().nullable(),
  props: z.record(z.unknown()).optional(),
});

export const neighborLinkSchema = z.object({
  edge_id: z.string(),
  rel_type: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  props: z.record(z.unknown()).optional(),
  neighbor: neighborNodeSchema,
});

export const nodeDetailResponseSchema = z.object({
  node: neighborNodeSchema,
  inbound: z.array(neighborLinkSchema),
  outbound: z.array(neighborLinkSchema),
  total_neighbors: z.number(),
});

export type NeighborNode = z.infer<typeof neighborNodeSchema>;
export type NeighborLink = z.infer<typeof neighborLinkSchema>;
export type NodeDetailResponse = z.infer<typeof nodeDetailResponseSchema>;

export const clearGraphResponseSchema = z.object({
  message: z.string(),
  node_count: z.number(),
  edge_count: z.number(),
});

export type ClearGraphResponse = z.infer<typeof clearGraphResponseSchema>;

export type LayoutName = 'cose' | 'breadthfirst' | 'concentric';

export const modelOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  default: z.boolean().optional(),
});

export type ModelOption = z.infer<typeof modelOptionSchema>;

export const queryHighlightSchema = z.object({
  node_ids: z.array(z.string()),
  edge_ids: z.array(z.string()),
});

export type QueryHighlight = z.infer<typeof queryHighlightSchema>;

export const queryResultSchema = z.object({
  question: z.string(),
  cypher: z.string(),
  explanation: z.string(),
  highlight: queryHighlightSchema,
  records_count: z.number(),
  raw_records: z.array(z.record(z.unknown())).optional(),
});

export type QueryResult = z.infer<typeof queryResultSchema>;

export interface QueryRequest {
  question: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
}
