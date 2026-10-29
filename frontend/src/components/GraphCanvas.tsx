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

const NODE_COLORS: Record<string, string> = {
  User: '#3B82F6',       // blue
  Agent: '#A855F7',      // purple
  Model: '#22C55E',      // green
  Tool: '#F59E0B',       // amber
  DataSource: '#EF4444', // red
  Policy: '#14B8A6',     // teal
};

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
              cy.animate({
                zoom: targetZoom,
                center: { eles: elements },
                duration: 250,
              });
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

    // Layout options builder with fit: false to let fitToViewport manage scale
    const getLayoutConfig = useCallback((layoutName: LayoutName) => {
      switch (layoutName) {
        case 'breadthfirst':
          return {
            name: 'breadthfirst',
            animate: false,
            directed: true,
            padding: DEFAULT_FIT_PADDING,
            spacingFactor: 1.4,
            fit: false,
          };
        case 'concentric':
          return {
            name: 'concentric',
            animate: false,
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
            animate: false,
            nodeRepulsion: () => 6500,
            idealEdgeLength: () => 120,
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
          if (!cyRef.current) return;
          const currentZoom = cyRef.current.zoom();
          cyRef.current.zoom({
            level: currentZoom * 1.25,
            renderedPosition: {
              x: cyRef.current.width() / 2,
              y: cyRef.current.height() / 2,
            },
          });
        },
        zoomOut: () => {
          if (!cyRef.current) return;
          const currentZoom = cyRef.current.zoom();
          cyRef.current.zoom({
            level: currentZoom * 0.8,
            renderedPosition: {
              x: cyRef.current.width() / 2,
              y: cyRef.current.height() / 2,
            },
          });
        },
        fit: () => {
          fitToViewport(true, MAX_INITIAL_ZOOM, DEFAULT_FIT_PADDING);
        },
        runLayout: (layoutName: LayoutName) => {
          if (!cyRef.current) return;
          try {
            const layoutConfig = getLayoutConfig(layoutName);
            const layoutInstance = cyRef.current.layout({
              ...layoutConfig,
              stop: () => {
                fitToViewport(true, MAX_INITIAL_ZOOM, DEFAULT_FIT_PADDING);
              },
            });
            layoutInstance.run();
            fitToViewport(false, MAX_INITIAL_ZOOM, DEFAULT_FIT_PADDING);
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
            cyRef.current.animate({
              center: { eles: targetNode },
              duration: 300,
            });
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
              width: 40,
              height: 40,
              'background-color': 'data(color)',
              label: 'data(label)',
              color: isDark ? '#FFFFFF' : '#0A0A0A',
              'font-size': '11px',
              'font-family': 'Geist Sans, Inter, system-ui, sans-serif',
              'font-weight': 500,
              'text-valign': 'bottom',
              'text-margin-y': 6,
              'text-wrap': 'ellipsis',
              'text-max-width': '95px',
              'border-width': 2,
              'border-color': isDark ? '#141414' : '#FFFFFF',
              'transition-property': 'background-color, border-width, border-color, opacity',
              'transition-duration': 0.2,
            },
          },
          {
            selector: 'node:selected',
            style: {
              'border-width': 3.5,
              'border-color': isDark ? '#FFFFFF' : '#0A0A0A',
              'underlay-color': 'data(color)',
              'underlay-padding': 4,
              'underlay-opacity': 0.35,
              'underlay-shape': 'ellipse',
            },
          },
          {
            selector: 'edge',
            style: {
              width: 1.75,
              'line-color': isDark ? '#3E3E3E' : '#D1D1CB',
              'target-arrow-color': isDark ? '#3E3E3E' : '#D1D1CB',
              'target-arrow-shape': 'triangle',
              'arrow-scale': 1.0,
              'curve-style': 'bezier',
              label: 'data(label)',
              'font-size': '9px',
              'font-family': 'Geist Mono, monospace',
              color: isDark ? '#8A8A8A' : '#737373',
              'text-rotation': 'autorotate',
              'text-background-color': isDark ? '#000000' : '#F8F7F3',
              'text-background-opacity': 0.85,
              'text-background-padding': '2px',
              'text-background-shape': 'roundrectangle',
              'transition-property': 'line-color, target-arrow-color, width, opacity',
              'transition-duration': 0.2,
            },
          },
          {
            selector: 'edge:selected',
            style: {
              width: 2.5,
              'line-color': isDark ? '#FFFFFF' : '#0A0A0A',
              'target-arrow-color': isDark ? '#FFFFFF' : '#0A0A0A',
            },
          },
          {
            selector: '.dimmed',
            style: {
              opacity: 0.2,
            },
          },
          {
            selector: '.highlighted',
            style: {
              opacity: 1,
              'border-width': 3,
            },
          },
        ],
        boxSelectionEnabled: false,
        wheelSensitivity: 0.25,
        minZoom: 0.2,
        maxZoom: 2.2,
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

    // Update stylesheet colors on theme change without destroying instance
    useEffect(() => {
      const cy = cyRef.current;
      if (!cy) return;

      cy.batch(() => {
        cy.style()
          .selector('node')
          .style({
            color: isDark ? '#FFFFFF' : '#0A0A0A',
            'border-color': isDark ? '#141414' : '#FFFFFF',
          })
          .selector('node:selected')
          .style({
            'border-color': isDark ? '#FFFFFF' : '#0A0A0A',
          })
          .selector('edge')
          .style({
            'line-color': isDark ? '#3E3E3E' : '#D1D1CB',
            'target-arrow-color': isDark ? '#3E3E3E' : '#D1D1CB',
            color: isDark ? '#8A8A8A' : '#737373',
            'text-background-color': isDark ? '#000000' : '#F8F7F3',
          })
          .selector('edge:selected')
          .style({
            'line-color': isDark ? '#FFFFFF' : '#0A0A0A',
            'target-arrow-color': isDark ? '#FFFFFF' : '#0A0A0A',
          })
          .update();
      });
    }, [isDark]);

    // Synchronize graph elements
    useEffect(() => {
      const cy = cyRef.current;
      if (!cy) return;

      const elements: cytoscape.ElementDefinition[] = [];

      for (const node of graph.nodes) {
        elements.push({
          group: 'nodes',
          data: {
            id: node.id,
            label: node.name,
            type: node.type,
            color: NODE_COLORS[node.type] || '#A855F7',
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
          const layoutConfig = getLayoutConfig(layout);
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
        cy.elements().removeClass('dimmed highlighted');
        cy.$(':selected').unselect();

        // 1. Query highlight priority
        if (highlight && (highlight.node_ids.length > 0 || highlight.edge_ids.length > 0)) {
          const matchedNodes = cy.nodes().filter((n) => highlight.node_ids.includes(n.id()));
          const matchedEdges = cy.edges().filter((e) => highlight.edge_ids.includes(e.id()));
          const matched = matchedNodes.add(matchedEdges);

          if (matched.length > 0) {
            cy.elements().difference(matched).addClass('dimmed');
            matched.addClass('highlighted');
          }
        } else if (selectedNodeId) {
          // 2. Selected node neighborhood focus
          const selectedEle = cy.getElementById(selectedNodeId);
          if (selectedEle.length > 0) {
            selectedEle.select();

            const neighborhood = selectedEle.neighborhood().add(selectedEle);
            cy.elements().difference(neighborhood).addClass('dimmed');
            neighborhood.addClass('highlighted');
          }
        }
      });
    }, [selectedNodeId, highlight]);

    return (
      <div
        data-testid="cytoscape-canvas"
        ref={containerRef}
        className="w-full h-full relative outline-none select-none"
      />
    );
  }
);

GraphCanvas.displayName = 'GraphCanvas';

export default GraphCanvas;
