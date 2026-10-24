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

export interface GraphNode {
  id: string;
  name: string;
  type: NodeType;
  source_doc?: string;
  props?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  props?: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_count: number;
  edge_count: number;
}

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
