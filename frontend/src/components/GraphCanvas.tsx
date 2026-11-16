import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import cytoscape, { Core, EventObject } from 'cytoscape';
import { GraphData, LayoutName, QueryHighlight } from '../types';

export interface GraphCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  runLayout: (layoutName: LayoutName) => void;
  selectNode: (nodeId: string) => void;
}

interface GraphCanvasProps {
  graph: GraphData;
  layout: LayoutName;
  theme: 'light' | 'dark';
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  highlight?: QueryHighlight | null;
}

// Enterprise Dark Palette
export const NODE_COLORS: Record<string, string> = {
  User: '#60A5FA',       // electric blue
  Agent: '#8B7CFF',      // purple violet
  Model: '#38BDF8',      // cyan
  Tool: '#F59E0B',       // amber
  DataSource: '#F87171', // coral red
  Policy: '#2DD4BF',     // mint teal
};

/**
 * Normalizes any entity type or alias to the 6 primary ontology types
 */
export function normalizeNodeType(rawType?: string | null): string {
  if (!rawType) return 'Agent';
  const clean = rawType.toLowerCase().trim().replace(/[-_\s]+/g, '');
  if (clean.includes('agent') || clean.includes('bot')) return 'Agent';
  if (clean.includes('model') || clean.includes('llm') || clean.includes('claude') || clean.includes('gpt')) return 'Model';
  if (
    clean.includes('datasource') ||
    clean.includes('data') ||
    clean.includes('database') ||
    clean.includes('db') ||
    clean.includes('storage') ||
    clean.includes('bucket') ||
    clean.includes('vector') ||
    clean.includes('warehouse') ||
    clean.includes('postgres') ||
    clean.includes('sql')
  ) {
    return 'DataSource';
  }
  if (clean.includes('tool') || clean.includes('mcp') || clean.includes('function') || clean.includes('api')) return 'Tool';
  if (clean.includes('policy') || clean.includes('guardrail') || clean.includes('rule') || clean.includes('compliance')) return 'Policy';
  if (clean.includes('user') || clean.includes('identity') || clean.includes('human') || clean.includes('owner')) return 'User';
  return 'Agent';
}

/**
 * Clean SVG icon definitions rendered inside Cytoscape circular node surfaces.
 * Uses high-precision Lucide vector paths for Bot, LLM, Database, Tool, Policy, and User.
 */
const SVG_ICONS: Record<string, (color: string) => string> = {
  // Bot icon for AI Agents (Robot head with antenna and eyes)
  Agent: (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="-18 -18 60 60" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 8V4H8"/>
      <rect width="16" height="12" x="4" y="8" rx="2"/>
      <path d="M2 14h2"/>
      <path d="M20 14h2"/>
      <path d="M15 13v2"/>
      <path d="M9 13v2"/>
    </svg>`,

  // LLM Model icon (Speech bubble with 4-point AI sparkle, directly matching Reference 1)
  Model: (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="-18 -18 60 60" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="m13 8 1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>
    </svg>`,

  // Wrench tool icon for Tools / MCP Servers
  Tool: (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="-18 -18 60 60" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>`,

  // Database cylinder stack icon for DB, DataSources and Storage nodes
  DataSource: (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="-18 -18 60 60" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M3 5V19A9 3 0 0 0 21 19V5"/>
      <path d="M3 12A9 3 0 0 0 21 12"/>
    </svg>`,

  // User icon for User / Operator Identities
  User: (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="-18 -18 60 60" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="5"/>
      <path d="M20 21a8 8 0 0 0-16 0"/>
    </svg>`,

  // ShieldCheck icon for Governance Policies & Guardrails
  Policy: (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="-18 -18 60 60" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>`,
};

function createSvgDataUri(svgString: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString.trim())}`;
}

const MAX_INITIAL_ZOOM = 0.85;
const DEFAULT_FIT_PADDING = 80;

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  ({ graph, layout, theme, selectedNodeId, onSelectNode, highlight }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);

    const isDark = theme === 'dark';

    // Helper to fit elements with a strict max zoom ceiling so small graphs aren't blown up
    const fitToViewport = useCallback(
      (animate = true, maxZoom = MAX_INITIAL_ZOOM, padding = DEFAULT_FIT_PADDING) => {
        const cy = cyRef.current;
        if (!cy) return;
        const elements = cy.elements();
        if (elements.length === 0) return;

        const container = cy.container();
        const width = container?.clientWidth || cy.width();
        const height = container?.clientHeight || cy.height();

        if (width && height && width > 0 && height > 0) {
          const bb = elements.boundingBox();
          if (bb.w > 0 && bb.h > 0) {
            const wRatio = (width - padding * 2) / bb.w;
            const hRatio = (height - padding * 2) / bb.h;
            const fitZoom = Math.min(wRatio, hRatio);
            const targetZoom = Math.min(fitZoom, maxZoom);

            if (animate) {
              cy.animate(
                {
                  zoom: targetZoom,
                  center: { eles: elements },
                },
                {
                  duration: 320,
                  easing: 'ease-out-cubic',
                }
              );
            } else {
              cy.zoom(targetZoom);
              cy.center(elements);
            }
            return;
          }
        }

        // Headless or zero-dimension fallback
        try {
          cy.fit(elements, padding);
          if (cy.zoom() > maxZoom) {
            cy.zoom(maxZoom);
            cy.center(elements);
          }
        } catch {
          // Ignore headless geometry errors
        }
      },
      []
    );

    // Layout options builder with smooth animation support
    const getLayoutConfig = useCallback((layoutName: LayoutName, animate = false) => {
      switch (layoutName) {
        case 'breadthfirst':
          return {
            name: 'breadthfirst',
            animate,
            animationDuration: 500,
            animationEasing: 'ease-out-cubic',
            directed: true,
            padding: DEFAULT_FIT_PADDING,
            spacingFactor: 1.4,
            fit: false,
          };
        case 'concentric':
          return {
            name: 'concentric',
            animate,
            animationDuration: 500,
            animationEasing: 'ease-out-cubic',
            padding: DEFAULT_FIT_PADDING,
            spacingFactor: 1.4,
            fit: false,
            concentric: (node: cytoscape.NodeSingular) => {
              const type = node.data('type');
              if (type === 'Policy') return 4;
              if (type === 'User') return 3;
              if (type === 'Agent') return 2;
              return 1;
            },
            levelWidth: () => 1,
          };
        case 'cose':
        default:
          return {
            name: 'cose',
            animate,
            animationDuration: 500,
            animationEasing: 'ease-out-cubic',
            nodeRepulsion: () => 7000,
            idealEdgeLength: () => 130,
            edgeElasticity: () => 100,
            gravity: 0.25,
            numIter: 1000,
            padding: DEFAULT_FIT_PADDING,
            randomize: false,
            fit: false,
          };
      }
    }, []);

    // Expose control methods via ref
    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => {
          const cy = cyRef.current;
          if (!cy) return;
          const currentZoom = cy.zoom();
          const targetZoom = Math.min(currentZoom * 1.3, 2.5);
          const center = { x: cy.width() / 2, y: cy.height() / 2 };
          const pan = cy.pan();
          const newPan = {
            x: center.x - (center.x - pan.x) * (targetZoom / currentZoom),
            y: center.y - (center.y - pan.y) * (targetZoom / currentZoom),
          };
          cy.animate(
            { zoom: targetZoom, pan: newPan },
            { duration: 220, easing: 'ease-out-cubic' }
          );
        },
        zoomOut: () => {
          const cy = cyRef.current;
          if (!cy) return;
          const currentZoom = cy.zoom();
          const targetZoom = Math.max(currentZoom * 0.75, 0.2);
          const center = { x: cy.width() / 2, y: cy.height() / 2 };
          const pan = cy.pan();
          const newPan = {
            x: center.x - (center.x - pan.x) * (targetZoom / currentZoom),
            y: center.y - (center.y - pan.y) * (targetZoom / currentZoom),
          };
          cy.animate(
            { zoom: targetZoom, pan: newPan },
            { duration: 220, easing: 'ease-out-cubic' }
          );
        },
        fit: () => {
          fitToViewport(true, MAX_INITIAL_ZOOM, DEFAULT_FIT_PADDING);
        },
        runLayout: (layoutName: LayoutName) => {
          if (!cyRef.current) return;
          try {
            const layoutConfig = getLayoutConfig(layoutName, true);
            const layoutInstance = cyRef.current.layout({
              ...layoutConfig,
              stop: () => {
                fitToViewport(true, MAX_INITIAL_ZOOM, DEFAULT_FIT_PADDING);
              },
            });
            layoutInstance.run();
          } catch {
            // Headless fallback
          }
        },
        selectNode: (nodeId: string) => {
          if (!cyRef.current) return;
          const targetNode = cyRef.current.getElementById(nodeId);
          if (targetNode.length > 0) {
            cyRef.current.$(':selected').unselect();
            targetNode.select();
            cyRef.current.animate(
              {
                center: { eles: targetNode },
              },
              {
                duration: 350,
                easing: 'ease-out-cubic',
              }
            );
          }
        },
      }),
      [getLayoutConfig, fitToViewport]
    );

    // Initialize Cytoscape instance
    useEffect(() => {
      if (!containerRef.current) return;

      const cy = cytoscape({
        container: containerRef.current,
        elements: [],
        layout: { name: 'null' },
        style: [
          {
            selector: 'node',
            style: {
              shape: 'ellipse',
              width: 44,
              height: 44,
              'background-color': isDark ? '#171E32' : '#FFFFFF',
              'background-image': 'data(iconSvg)',
              'background-fit': 'contain',
              'background-width': '40%',
              'background-height': '40%',
              'background-position-x': '50%',
              'background-position-y': '50%',
              'background-clip': 'node',
              label: 'data(label)',
              color: isDark ? '#F1F5F9' : '#0F172A',
              'font-size': '11px',
              'font-family': 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
              'font-weight': 500,
              'text-valign': 'bottom',
              'text-margin-y': 7,
              'text-wrap': 'ellipsis',
              'text-max-width': '120px',
              'border-width': 2,
              'border-color': 'data(color)',
              'border-opacity': 0.88,
              'transition-property': 'background-color, border-width, border-color, opacity, underlay-opacity',
              'transition-duration': 0.22,
            },
          },
          {
            selector: 'node.node-hovered',
            style: {
              'border-width': 2.5,
              'underlay-color': 'data(color)',
              'underlay-padding': 6,
              'underlay-opacity': 0.32,
              'underlay-shape': 'ellipse',
            },
          },
          {
            selector: 'node:selected',
            style: {
              'border-width': 3.5,
              'border-color': '#FFFFFF',
              'underlay-color': 'data(color)',
              'underlay-padding': 8,
              'underlay-opacity': 0.5,
              'underlay-shape': 'ellipse',
            },
          },
          {
            selector: 'node.orphan-node',
            style: {
              'border-color': '#F43F5E',
              'border-width': 2.5,
              'underlay-color': '#F43F5E',
              'underlay-padding': 5,
              'underlay-opacity': 0.25,
            },
          },
          {
            selector: 'edge',
            style: {
              width: 1.6,
              'line-color': isDark ? '#334155' : '#CBD5E1',
              'target-arrow-color': isDark ? '#475569' : '#94A3B8',
              'target-arrow-shape': 'triangle',
              'arrow-scale': 0.85,
              'curve-style': 'bezier',
              label: 'data(label)',
              'font-size': '9px',
              'font-family': 'JetBrains Mono, ui-monospace, monospace',
              'font-weight': 500,
              color: isDark ? '#94A3B8' : '#64748B',
              'text-rotation': 'autorotate',
              'text-background-color': isDark ? '#0B1020' : '#F8F9FC',
              'text-background-opacity': 0.92,
              'text-background-padding': '3px',
              'text-background-shape': 'roundrectangle',
              'transition-property': 'line-color, target-arrow-color, width, opacity',
              'transition-duration': 0.22,
            },
          },
          {
            selector: 'edge:selected',
            style: {
              width: 2.5,
              'line-color': '#8B7CFF',
              'target-arrow-color': '#8B7CFF',
              color: '#FFFFFF',
            },
          },
          {
            selector: '.dimmed',
            style: {
              opacity: 0.16,
            },
          },
          {
            selector: '.highlighted',
            style: {
              opacity: 1,
              'border-width': 3.2,
              'border-color': '#8B7CFF',
              'underlay-color': '#8B7CFF',
              'underlay-padding': 6,
              'underlay-opacity': 0.35,
            },
          },
          {
            selector: 'edge.highlighted',
            style: {
              width: 2.6,
              'line-color': '#8B7CFF',
              'target-arrow-color': '#8B7CFF',
              opacity: 1,
            },
          },
        ],
        boxSelectionEnabled: false,
        minZoom: 0.2,
        maxZoom: 2.2,
      });

      // Interactive hover feedbacks
      cy.on('mouseover', 'node', (evt: EventObject) => {
        const node = evt.target as cytoscape.NodeSingular;
        const container = cy.container();
        if (container) container.style.cursor = 'pointer';
        node.addClass('node-hovered');
      });

      cy.on('mouseout', 'node', (evt: EventObject) => {
        const node = evt.target as cytoscape.NodeSingular;
        const container = cy.container();
        if (container) container.style.cursor = 'default';
        node.removeClass('node-hovered');
      });

      cy.on('mouseover', 'edge', () => {
        const container = cy.container();
        if (container) container.style.cursor = 'pointer';
      });

      cy.on('mouseout', 'edge', () => {
        const container = cy.container();
        if (container) container.style.cursor = 'default';
      });

      // Handle node click
      cy.on('tap', 'node', (evt: EventObject) => {
        const clickedNode = evt.target as cytoscape.NodeSingular;
        onSelectNode(clickedNode.id());
      });

      // Handle background tap
      cy.on('tap', (evt: EventObject) => {
        if (evt.target === cy) {
          onSelectNode(null);
        }
      });

      cyRef.current = cy;

      return () => {
        cy.destroy();
        cyRef.current = null;
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Continuous smooth resize adaptation when sidebar expands/collapses or window resizes
    useEffect(() => {
      const container = containerRef.current;
      if (!container || typeof ResizeObserver === 'undefined') return;

      let rafId: number;
      const ro = new ResizeObserver(() => {
        rafId = requestAnimationFrame(() => {
          if (cyRef.current) {
            cyRef.current.resize();
          }
        });
      });

      ro.observe(container);

      return () => {
        cancelAnimationFrame(rafId);
        ro.disconnect();
      };
    }, []);

    // Update stylesheet colors on theme change without destroying instance
    useEffect(() => {
      const cy = cyRef.current;
      if (!cy) return;

      cy.batch(() => {
        cy.style()
          .selector('node')
          .style({
            'background-color': isDark ? '#171E32' : '#FFFFFF',
            color: isDark ? '#F1F5F9' : '#0F172A',
          })
          .selector('edge')
          .style({
            'line-color': isDark ? '#334155' : '#CBD5E1',
            'target-arrow-color': isDark ? '#475569' : '#94A3B8',
            color: isDark ? '#94A3B8' : '#64748B',
            'text-background-color': isDark ? '#0B1020' : '#F8F9FC',
          })
          .update();
      });
    }, [isDark]);

    // Synchronize graph elements with SVG icons and color accents
    useEffect(() => {
      const cy = cyRef.current;
      if (!cy) return;

      const elements: cytoscape.ElementDefinition[] = [];

      for (const node of graph.nodes) {
        const normType = normalizeNodeType(node.type);
        const color = NODE_COLORS[normType] || '#8B7CFF';
        const iconGenerator = SVG_ICONS[normType] ?? SVG_ICONS['Agent'] ?? ((_color: string) => '');
        const svgString = iconGenerator(color);
        const iconDataUri = createSvgDataUri(svgString);

        elements.push({
          group: 'nodes',
          data: {
            id: node.id,
            label: node.name,
            type: node.type,
            color,
            iconSvg: iconDataUri,
          },
        });
      }

      for (const edge of graph.edges) {
        elements.push({
          group: 'edges',
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.type,
          },
        });
      }

      cy.batch(() => {
        cy.elements().remove();
        if (elements.length > 0) {
          cy.add(elements);
        }
      });

      if (elements.length > 0) {
        try {
          const layoutConfig = getLayoutConfig(layout, false);
          const layoutInstance = cy.layout({
            ...layoutConfig,
            stop: () => {
              fitToViewport(false, MAX_INITIAL_ZOOM, DEFAULT_FIT_PADDING);
            },
          });
          layoutInstance.run();
          fitToViewport(false, MAX_INITIAL_ZOOM, DEFAULT_FIT_PADDING);
        } catch {
          // Headless/test environment without canvas geometry
        }
      }
    }, [graph, layout, getLayoutConfig, fitToViewport]);

    // Handle query highlighting and selected node neighborhood focus
    useEffect(() => {
      const cy = cyRef.current;
      if (!cy) return;

      cy.batch(() => {
        const allNodes = cy.nodes();
        const allEdges = cy.edges();

        // 1. Reset all state classes
        allNodes.removeClass('dimmed highlighted orphan-node');
        allEdges.removeClass('dimmed highlighted');

        // 2. Mark orphan agents (agents with zero outgoing connections)
        allNodes.forEach((node) => {
          if (node.data('type') === 'Agent' && node.outgoers('edge').length === 0) {
            node.addClass('orphan-node');
          }
        });

        // 3. Highlight query matches if present
        if (highlight && (highlight.node_ids.length > 0 || highlight.edge_ids.length > 0)) {
          allNodes.addClass('dimmed');
          allEdges.addClass('dimmed');

          for (const nid of highlight.node_ids) {
            cy.getElementById(nid).removeClass('dimmed').addClass('highlighted');
          }
          for (const eid of highlight.edge_ids) {
            cy.getElementById(eid).removeClass('dimmed').addClass('highlighted');
          }
          return;
        }

        // 4. Focus on selected node neighborhood if a node is selected
        if (selectedNodeId) {
          const selected = cy.getElementById(selectedNodeId);
          if (selected.length > 0) {
            allNodes.addClass('dimmed');
            allEdges.addClass('dimmed');

            selected.removeClass('dimmed');
            const neighborhood = selected.neighborhood();
            neighborhood.nodes().removeClass('dimmed');
            neighborhood.edges().removeClass('dimmed');
          }
        }
      });
    }, [highlight, selectedNodeId]);

    return (
      <div
        data-testid="graph-canvas"
        ref={containerRef}
        className="w-full h-full relative outline-none select-none canvas-dotted-grid bg-[#0B1020]"
      />
    );
  }
);

GraphCanvas.displayName = 'GraphCanvas';

export default GraphCanvas;
