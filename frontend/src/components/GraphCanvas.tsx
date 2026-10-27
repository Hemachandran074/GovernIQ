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

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  ({ graph, layout, theme, selectedNodeId, onSelectNode, highlight }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);

    const isDark = theme === 'dark';

    // Layout options builder
    const getLayoutConfig = useCallback((layoutName: LayoutName) => {
      switch (layoutName) {
        case 'breadthfirst':
          return {
            name: 'breadthfirst',
            animate: true,
            animationDuration: 400,
            directed: true,
            padding: 50,
            spacingFactor: 1.25,
          };
        case 'concentric':
          return {
            name: 'concentric',
            animate: true,
            animationDuration: 400,
            padding: 50,
            spacingFactor: 1.25,
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
            animate: true,
            animationDuration: 500,
            nodeRepulsion: () => 7000,
            idealEdgeLength: () => 100,
            edgeElasticity: () => 100,
            gravity: 0.25,
            numIter: 1000,
            padding: 50,
            randomize: false,
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
          if (!cyRef.current) return;
          const elements = cyRef.current.elements();
          if (elements.length > 0) {
            cyRef.current.animate({
              fit: { eles: elements, padding: 50 },
              duration: 300,
            });
          }
        },
        runLayout: (layoutName: LayoutName) => {
          if (!cyRef.current) return;
          const layoutInstance = cyRef.current.layout(getLayoutConfig(layoutName));
          layoutInstance.run();
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
      [getLayoutConfig]
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
              'background-color': 'data(color)',
              label: 'data(label)',
              color: isDark ? '#FFFFFF' : '#0A0A0A',
              'font-size': '11px',
              'font-family': 'Geist Sans, Inter, system-ui, sans-serif',
              'font-weight': 500,
              'text-valign': 'bottom',
              'text-margin-y': 7,
              'text-wrap': 'ellipsis',
              'text-max-width': '90px',
              'border-width': 2.5,
              'border-color': isDark ? '#141414' : '#FFFFFF',
              'transition-property': 'background-color, border-width, border-color, opacity',
              'transition-duration': 0.2,
            },
          },
          {
            selector: 'node:selected',
            style: {
              'border-width': 4,
              'border-color': isDark ? '#FFFFFF' : '#0A0A0A',
              'underlay-color': 'data(color)',
              'underlay-padding': 5,
              'underlay-opacity': 0.4,
              'underlay-shape': 'ellipse',
            },
          },
          {
            selector: 'edge',
            style: {
              width: 2,
              'line-color': isDark ? '#3E3E3E' : '#D1D1CB',
              'target-arrow-color': isDark ? '#3E3E3E' : '#D1D1CB',
              'target-arrow-shape': 'triangle',
              'arrow-scale': 1.1,
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
              width: 3,
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
              'border-width': 3.5,
            },
          },
        ],
        boxSelectionEnabled: false,
        wheelSensitivity: 0.25,
        minZoom: 0.2,
        maxZoom: 3.5,
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
          const layoutInstance = cy.layout(getLayoutConfig(layout));
          layoutInstance.run();
        } catch {
          // Headless/test environment without canvas geometry
        }
      }
    }, [graph, layout, getLayoutConfig]);

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
