import { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Connection,
  ConnectionMode,
  Controls,
  Edge,
  MiniMap,
  NodeTypes,
  OnEdgeUpdateFunc,
  ReactFlowInstance,
  ReactFlowProvider,
  updateEdge,
} from "reactflow";

import "reactflow/dist/style.css";
import "./App.scss";
import calculate, { buildCalculationGraph } from "./calculation";
import { StringInput } from "./Input";
import {
  afterGraphUpdate,
  EdgeData,
  GraphEdge,
  GraphNode,
  NodeData,
  nodeTypeInfos,
} from "./nodeTypes";
import Sidebar from "./Sidebar";
import { SortableList } from "./sortableList/SortableList";
import { createRange } from "./utils";

function debounce<TArgs extends any[]>(
  callback: (...args: TArgs) => void,
  wait: number
): (...args: TArgs) => void {
  let timeoutId: number | null = null;
  return (...args: TArgs) => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      callback(...args);
    }, wait);
  };
}

const nodeTypes: NodeTypes = Object.fromEntries(
  Object.entries(nodeTypeInfos).map((e) => [e[0], e[1].component])
);

export interface Graph {
  id: number;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
interface Project {
  nextId: number;
  currentGraphId: number;
  graphs: Graph[];
}

const debouncedSave = debounce((project: Project) => {
  localStorage.setItem("project", JSON.stringify(project));
}, 500);

function getMockItems() {
  return createRange(5, (index) => ({ id: index + 1 }));
}

function GraphList({
  project,
  setProject,
}: {
  project: Project;
  setProject: (fn: (project: Project) => Project) => void;
}) {
  const [items, setItems] = useState(getMockItems);
  return (
    <div style={{ margin: "4px" }}>
      <SortableList
        items={project.graphs}
        onChange={(newGraphs) =>
          setProject((p) => ({ ...p, graphs: newGraphs }))
        }
        renderContainer={(children) => (
          <div className="list-group">{children}</div>
        )}
        renderItem={(graph, isDragPlaceholder) => {
          const isActiveGraph =
            !isDragPlaceholder && graph.id == project.currentGraphId;
          return (
            <SortableList.Item id={graph.id}>
              {(setNodeRef, style) => (
                <button
                  className={
                    "list-group-item list-group-item-action" +
                    (isActiveGraph ? " active" : "")
                  }
                  type="button"
                  ref={setNodeRef}
                  style={{
                    ...style,
                    ...(isDragPlaceholder
                      ? {
                          backgroundColor: "white",
                          border: "solid black 1px",
                          borderRadius: "5px",
                        }
                      : {}),
                  }}
                  onClick={() => {
                    setProject((project) => ({
                      ...project,
                      currentGraphId: graph.id,
                    }));
                  }}
                >
                  {isActiveGraph ? (
                    <StringInput
                      inline
                      value={graph.name}
                      onChange={(name) =>
                        setProject((p) => ({
                          ...p,
                          graphs: p.graphs.map((g) =>
                            g.id == graph.id ? { ...g, name } : g
                          ),
                        }))
                      }
                    />
                  ) : (
                    graph.name
                  )}
                  <SortableList.DragHandle />
                </button>
              )}
            </SortableList.Item>
          );
        }}
      ></SortableList>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          setProject((project) => ({
            ...project,
            currentGraphIndex: project.graphs.length,
            nextId: project.nextId + 1,
            graphs: project.graphs.concat({
              id: project.nextId,
              name: "New Graph",
              nodes: [],
              edges: [],
            }),
          }));
        }}
        style={{ marginTop: "16px" }}
      >
        Add
      </button>
    </div>
  );
}

export default function App() {
  const [project, setProject] = useState<Project>(() => {
    const stored = localStorage.getItem("project");

    if (stored) {
      return JSON.parse(stored) as Project;
    } else {
      return {
        nextId: 2,
        currentGraphId: 1,
        graphs: [
          {
            id: 1,
            name: "Initial",
            nodes: [],
            edges: [],
          },
        ],
      } as Project;
    }
  });

  const graph = project.graphs.find((x) => x.id == project.currentGraphId)!;

  function setGraph(fn: (graph: Graph, nextId: () => number) => Graph) {
    setProject((project) => {
      let nextId = project.nextId;
      const modifiedGraph = fn(
        project.graphs.find((x) => x.id == project.currentGraphId)!,
        () => nextId++
      );
      return {
        ...project,
        nextId,
        graphs: project.graphs.map((g, idx) =>
          g.id == project.currentGraphId ? modifiedGraph : g
        ),
      };
    });
  }

  useEffect(() => {
    debouncedSave(project);
  }, [project]);

  const reconnectDone = useRef(true);

  const reactFlowInstance = useRef<ReactFlowInstance>();

  const [nodeTypesMemoized] = useState(nodeTypes);
  const onConnect = useCallback(
    (connection: Connection) => {
      return setGraph((graph) =>
        afterGraphUpdate({
          ...graph,
          edges: addEdge(connection, graph.edges),
        })
      );
    },
    [setGraph]
  );

  const onEdgeUpdateStart = useCallback(
    (_event: any, _edge: any, _handleType: any) =>
      (reconnectDone.current = false),
    []
  );
  const onEdgeUpdateEnd = useCallback(
    (_event: any, edge: Edge<EdgeData>, _handleType: any) => {
      if (!reconnectDone.current) {
        setGraph((graph) =>
          afterGraphUpdate({
            ...graph,
            edges: graph.edges.filter((e) => e.id !== edge.id),
          })
        );
      }

      reconnectDone.current = true;
    },
    [setGraph]
  );

  // gets called after end of edge gets dragged to another source or target
  const onEdgeUpdate = useCallback<OnEdgeUpdateFunc<NodeData>>(
    (oldEdge, newConnection) => {
      reconnectDone.current = true;
      return setGraph((graph) =>
        afterGraphUpdate({
          ...graph,
          edges: updateEdge(oldEdge, newConnection, graph.edges),
        })
      );
    },
    []
  );

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
      }}
    >
      <ReactFlowProvider>
        <GraphList project={project} setProject={setProject} />
        <div style={{ flexGrow: 1 }}>
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypesMemoized}
            onNodesChange={(change) => {
              setGraph((graph) => ({
                ...graph,
                nodes: applyNodeChanges(change, graph.nodes),
              }));
            }}
            onEdgesChange={(change) => {
              setGraph((graph) => ({
                ...graph,
                edges: applyEdgeChanges(change, graph.edges),
              }));
            }}
            onConnect={onConnect}
            onEdgeUpdate={onEdgeUpdate}
            onEdgeUpdateStart={onEdgeUpdateStart}
            onEdgeUpdateEnd={onEdgeUpdateEnd}
            onInit={(instance) => (reactFlowInstance.current = instance)}
            connectionMode={ConnectionMode.Loose}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const type = event.dataTransfer.getData("application/reactflow");
              const position = reactFlowInstance.current!.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              });
              setGraph((graph, nextId) => ({
                ...graph,
                nodes: graph.nodes.concat({
                  id: `dndnode_${nextId()}`,
                  type,
                  position,
                  data: nodeTypeInfos[type].defaultData(),
                }),
              }));
            }}
          >
            <Controls />
            <MiniMap />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          </ReactFlow>
        </div>
        <div>
          <button
            className="btn btn-primary"
            onClick={() => {
              const [calcNodes, nets] = buildCalculationGraph(
                graph.nodes,
                graph.edges
              );
              calculate(calcNodes, nets);

              setGraph((graph) => ({
                ...graph,
                nodes: graph.nodes.map((node) => ({
                  ...node,
                  data: nodeTypeInfos[node.type!].finishCalculation(
                    calcNodes[node.id],
                    node.data
                  ),
                })),
              }));
            }}
          >
            Calculate{" "}
          </button>
          <Sidebar graphs={project.graphs} />
        </div>
      </ReactFlowProvider>
    </div>
  );
}
