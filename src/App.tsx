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
import {
  afterGraphUpdate,
  EdgeData,
  GraphEdge,
  GraphNode,
  NodeData,
  nodeTypeInfos,
} from "./nodeTypes";
import Sidebar from "./Sidebar";

let nextId = 0;
function getId() {
  return `dndnode_${nextId++}`;
}

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
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  nextId: number;
}
interface Project {
  currentGraphIndex: number;
  graphs: Graph[];
}

const debouncedSave = debounce((project: Project) => {
  localStorage.setItem("project", JSON.stringify(project));
}, 500);

function GraphList({
  project,
  setProject,
}: {
  project: Project;
  setProject: (fn: (project: Project) => Project) => void;
}) {
  return (
    <div>
      <div className="list-group">
        {project.graphs.map((graph, idx) => (
          <button
            type="button"
            key={idx}
            onClick={() => {
              setProject((project) => ({
                ...project,
                currentGraphIndex: idx,
              }));
            }}
            className={
              "list-group-item list-group-item-action" +
              (idx == project.currentGraphIndex ? " active" : "")
            }
          >
            {graph.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          setProject((project) => ({
            ...project,
            currentGraphIndex: project.graphs.length,
            graphs: project.graphs.concat({
              name: "New Graph",
              nodes: [],
              edges: [],
              nextId: 0,
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
        currentGraphIndex: 0,
        graphs: [
          {
            name: "Initial",
            nodes: [],
            edges: [],
            nextId: 0,
          },
        ],
      } as Project;
    }
  });

  const graph = project.graphs[project.currentGraphIndex];

  function setGraph(fn: (graph: Graph) => Graph) {
    setProject((project) => {
      return {
        ...project,
        graphs: project.graphs.map((g, idx) =>
          idx === project.currentGraphIndex ? fn(g) : g
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
              setGraph((graph) => ({
                ...graph,
                nodes: graph.nodes.concat({
                  id: getId(),
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
          <Sidebar />
        </div>
      </ReactFlowProvider>
    </div>
  );
}
