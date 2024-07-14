import { ComponentType, useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Connection,
  ConnectionMode,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  NodeToolbar,
  NodeTypes,
  OnEdgeUpdateFunc,
  Position,
  ReactFlowInstance,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  updateEdge,
  useNodeId,
  useReactFlow,
  useUpdateNodeInternals,
} from "reactflow";

import "reactflow/dist/style.css";
import "./App.scss";
import Sidebar from "./Sidebar";
import calculate, { CalcNet, CalcNode, CalcNodeFunction } from "./calculation";

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

interface NodeTypeInfo<TData> {
  component: ComponentType<NodeProps<TData>>;
  defaultData: () => TData; // calculate the nodes
  calculateNode: CalcNodeFunction<TData>;
  finishCalculation: (node: CalcNode<TData>, data: TData) => TData;
}

function nodeInfo<TData>(info: NodeTypeInfo<TData>): NodeTypeInfo<TData> {
  return info;
}
const nodeTypeInfos: { [key: string]: NodeTypeInfo<any> } = {
  number: nodeInfo({
    component: NumberNode,
    defaultData: () => ({ type: "number" as const, value: 0, locked: false }),
    calculateNode: (ctx) => {
      const a = ctx.node.ports["a"];
      const b = ctx.node.ports["b"];
      if (ctx.data.locked) {
        if (a) {
          ctx.addEquation((row) => {
            row[a.net.id] = 1;
            return a.net.value - ctx.data.value;
          });
        }

        if (b) {
          ctx.addEquation((row) => {
            row[b.net.id] = 1;
            return b.net.value - ctx.data.value;
          });
        }
      } else {
        if (a && b) {
          ctx.addEquation((row) => {
            row[a.net.id] = 1;
            row[b.net.id] = -1;
            return a.net.value - b.net.value;
          });
        }
      }
    },
    finishCalculation: (node, data) => {
      if (data.locked) return data;
      const portA = node.ports["a"];
      const portB = node.ports["b"];
      if (portA) {
        return { ...data, value: portA.net.value };
      }
      if (portB) {
        return { ...data, value: portB.net.value };
      }
      return data;
    },
  }),
  plus: nodeInfo({
    component: PlusNode,
    defaultData: newArithmeticNodeData,
    calculateNode: (ctx) => {
      ctx.addEquation((row) => {
        ctx.node.data.topPorts.ids.forEach((portId) => {
          const port = ctx.node.ports[portId];
          if (port) {
            row[port.net.id] += 1;
          }
        });
        ctx.node.data.bottomPorts.ids.forEach((portId) => {
          const port = ctx.node.ports[portId];
          if (port) {
            row[port.net.id] -= 1;
          }
        });
        return 0;
      });
    },
    finishCalculation: (_, data) => data,
  }),
  mul: nodeInfo({
    component: MulNode,
    defaultData: newArithmeticNodeData,
    calculateNode: (ctx) => {
      const topNets = ctx.node.data.topPorts.ids.flatMap((portId) => {
        const port = ctx.node.ports[portId];
        return port ? [port.net] : [];
      });
      const bottomNets = ctx.node.data.bottomPorts.ids.flatMap((portId) => {
        const port = ctx.node.ports[portId];
        return port ? [port.net] : [];
      });

      if (topNets.length > 0 && bottomNets.length > 0) {
        const topProduct = topNets.reduce((a, b) => a * b.value, 1);
        const bottomProduct = bottomNets.reduce((a, b) => a * b.value, 1);

        ctx.addEquation((row) => {
          topNets.forEach((net) => (row[net.id] += topProduct / net.value));
          bottomNets.forEach(
            (net) => (row[net.id] -= bottomProduct / net.value)
          );
          return topProduct - bottomProduct;
        });
      }
    },
    finishCalculation: (_, data) => data,
  }),
};

interface GenericNodeData {
  type: "generic";
}

function Toolbar() {
  const flow = useReactFlow();
  const id = useNodeId()!;
  const node = flow.getNode(id);
  return (
    <NodeToolbar isVisible={node?.selected}>
      <i
        className="bi bi-x-circle"
        onClick={() => flow.deleteElements({ nodes: [{ id }] })}
      ></i>
    </NodeToolbar>
  );
}

function useUpdateNode<T>(_: NodeProps<T>): (newData: T) => void {
  const id = useNodeId();
  const flow = useReactFlow();
  return useCallback(
    (newData) =>
      flow.setNodes((nodes) =>
        nodes.map((n) => (n.id === id ? { ...n, data: newData } : n))
      ),
    [id, flow]
  );
}

function NumberInput(props: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [valueInternal, setValueInternal] = useState("" + props.value);
  useEffect(() => {
    setValueInternal("" + props.value);
  }, [props.value]);
  return (
    <input
      disabled={props.disabled}
      className="form-control nodrag"
      type="number"
      value={valueInternal}
      onChange={(e) => setValueInternal(e.target.value)}
      onBlur={() => props.onChange(+valueInternal)}
    />
  );
}

interface NumberNodeData {
  type: "number";
  value: number;
  locked: boolean;
}

function NumberNode(props: NodeProps<NumberNodeData>) {
  const { data } = props;
  const updateNode = useUpdateNode(props);
  return (
    <>
      <Toolbar />
      <NumberInput
        value={data.value}
        onChange={(value) => updateNode({ ...data, value })}
      />
      {data.locked ? (
        <i
          className="bi bi-lock"
          onClick={() => updateNode({ ...data, locked: false })}
        ></i>
      ) : (
        <i
          className="bi bi-unlock"
          onClick={() => updateNode({ ...data, locked: true })}
        ></i>
      )}
      <Handle type="source" position={Position.Top} id="a" />
      <Handle type="source" position={Position.Bottom} id="b" />
    </>
  );
}
function ArithmeticPorts({
  data,
  id,
}: {
  id: string;
  data: ArithmeticNodeData;
}) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    return updateNodeInternals(id);
  }, [id, data.topPorts, data.bottomPorts]);
  return (
    <>
      {data.topPorts.ids.map((portId, idx) => (
        <Handle
          key={portId}
          type="source"
          position={Position.Top}
          id={portId}
          style={{ left: 20 + idx * 20 + "px" }}
        />
      ))}
      {data.bottomPorts.ids.map((portId, idx) => (
        <Handle
          key={portId}
          type="source"
          position={Position.Bottom}
          id={portId}
          style={{ left: 20 + idx * 20 + "px" }}
        />
      ))}
    </>
  );
}

function PlusNode({ id, data }: NodeProps<ArithmeticNodeData>) {
  return (
    <div>
      <Toolbar />
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          minWidth:
            20 +
            Math.max(data.topPorts.ids.length, data.bottomPorts.ids.length) *
              20 +
            "px",
        }}
      >
        plus
      </div>
      <ArithmeticPorts data={data} id={id} />
    </div>
  );
}

function MulNode({ data, id }: NodeProps<ArithmeticNodeData>) {
  return (
    <>
      <Toolbar />
      mul
      <ArithmeticPorts data={data} id={id} />
    </>
  );
}

interface PortRow {
  ids: string[];
  nextId: number;
}
interface ArithmeticNodeData {
  type: "arithmetic";
  topPorts: PortRow;
  bottomPorts: PortRow;
}

function newArithmeticNodeData(): ArithmeticNodeData {
  return {
    type: "arithmetic",
    topPorts: { ids: ["top_0"], nextId: 1 },
    bottomPorts: { ids: ["bottom_0"], nextId: 1 },
  };
}

type NodeData = GenericNodeData | NumberNodeData | ArithmeticNodeData;
type EdgeData = {};

type GraphNode = Node<NodeData, string | undefined>;
type GraphEdge = Edge<EdgeData>;

const nodeTypes: NodeTypes = Object.fromEntries(
  Object.entries(nodeTypeInfos).map((e) => [e[0], e[1].component])
);

let initialNodes: GraphNode[] = [];

let initialEdges: GraphEdge[] = [];

(() => {
  const stored = localStorage.getItem("project");

  if (stored) {
    const { nodes, edges, nextId: id } = JSON.parse(stored);
    initialNodes = nodes;
    initialEdges = edges;
    nextId = id;
  }
})();

const debouncedSave = debounce((nodes: GraphNode[], edges: GraphEdge[]) => {
  localStorage.setItem("project", JSON.stringify({ nodes, edges, nextId }));
}, 500);

function buildGraph(
  nodes: Node<NodeData, string | undefined>[],
  edges: Edge<EdgeData>[]
) {
  const graphNodes: { [key: string]: CalcNode<any> } = {};

  // create all nodes without ports
  for (const node of nodes) {
    graphNodes[node.id] = new CalcNode(
      node.id,
      node.data,
      nodeTypeInfos[node.type!].calculateNode
    );
  }

  // node => port => [node, port]
  const connections: {
    [nodeId: string]: { [portId: string]: [string, string][] };
  } = {};

  function addConnection(
    sourceNode: string,
    sourcePort: string,
    targetNode: string,
    targetPort: string
  ) {
    if (!connections[sourceNode]) connections[sourceNode] = {};
    if (!connections[sourceNode][sourcePort])
      connections[sourceNode][sourcePort] = [];
    connections[sourceNode][sourcePort].push([targetNode, targetPort]);
  }

  // fill connections
  for (const edge of edges) {
    addConnection(
      edge.source,
      edge.sourceHandle!,
      edge.target,
      edge.targetHandle!
    );
    addConnection(
      edge.target,
      edge.targetHandle!,
      edge.source,
      edge.sourceHandle!
    );
  }

  const nets: CalcNet[] = [];
  // create all ports
  for (const node of nodes) {
    if (!connections[node.id]) continue;
    for (const portId of Object.keys(connections[node.id])) {
      if (!graphNodes[node.id].ports[portId]) {
        // collect the net connected to the port
        const net = new CalcNet(nets.length, 1);
        nets.push(net);
        const border: [string, string][] = [[node.id, portId]];
        const seen: { [nodeId: string]: { [portId: string]: true } } = {};
        while (border.length > 0) {
          const [nodeId, portId] = border.pop()!;
          if (seen[nodeId]?.[portId]) continue;
          if (!seen[nodeId]) seen[nodeId] = {};
          seen[nodeId][portId] = true;

          // encountered a new port
          graphNodes[nodeId].ports[portId] = { net };
          net.ports.push([graphNodes[nodeId], portId]);

          for (const [targetNodeId, targetPortId] of connections[nodeId][
            portId
          ]) {
            border.push([targetNodeId, targetPortId]);
          }
        }
      }
    }
  }

  return [graphNodes, nets] as const;
}

function afterGraphUpdate(graph: Graph): Graph {
  console.log("afterGraphUpdate");
  const usedPorts = new Set<string>();
  graph.edges.forEach((edge) => {
    usedPorts.add(edge.source + "=>" + edge.sourceHandle || "");
    usedPorts.add(edge.target + "=>" + edge.targetHandle || "");
  });

  function updatePorts(
    ports: PortRow,
    nodeId: string,
    prefix: string
  ): PortRow {
    console.log("updatePorts", prefix);
    const result = { ...ports };
    result.ids = result.ids.filter(
      (portId, idx) =>
        idx == ports.ids.length - 1 || usedPorts.has(nodeId + "=>" + portId)
    );

    if (
      result.ids.length === 0 ||
      usedPorts.has(nodeId + "=>" + result.ids[result.ids.length - 1])
    ) {
      console.log("adding port", prefix + "_" + result.nextId);
      result.ids = [...ports.ids, prefix + "_" + result.nextId++];
    }
    return result;
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.data.type === "arithmetic"
        ? {
            ...node,
            data: {
              ...node.data,
              topPorts: updatePorts(node.data.topPorts, node.id, "top"),
              bottomPorts: updatePorts(
                node.data.bottomPorts,
                node.id,
                "bottom"
              ),
            },
          }
        : node
    ),
  };
}

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export default function App() {
  const [graph, setGraph] = useState({
    nodes: initialNodes,
    edges: initialEdges,
  });

  useEffect(() => {
    debouncedSave(graph.nodes, graph.edges);
  }, [graph]);

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
              const [calcNodes, nets] = buildGraph(graph.nodes, graph.edges);
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
