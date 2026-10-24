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
