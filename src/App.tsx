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
  updateEdge,
  useEdgesState,
  useNodeId,
  useNodesState,
  useReactFlow,
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
  defaultData: TData; // calculate the nodes
  calculateNode: CalcNodeFunction<TData>;
  finishCalculation: (node: CalcNode<TData>, data: TData) => TData;
}

function nodeInfo<TData>(info: NodeTypeInfo<TData>): NodeTypeInfo<TData> {
  return info;
}
const nodeTypeInfos: { [key: string]: NodeTypeInfo<any> } = {
  number: nodeInfo({
    component: NumberNode,
    defaultData: { value: 0, locked: false },
    calculateNode: (ctx) => {
      const a = ctx.node.ports["a"];
      const b = ctx.node.ports["b"];
      if (ctx.data.locked) {
        if (a) {
          ctx.addEquation((row) => {
            row[a.net.id] = 100;
          }, ctx.data.value * 100);
        }

        if (b) {
          ctx.addEquation((row) => {
            row[b.net.id] = 100;
          }, ctx.data.value * 100);
        }
      } else {
        if (a && b) {
          ctx.addEquation((row) => {
            row[a.net.id] = 1;
            row[b.net.id] = -1;
          }, 0);
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
    defaultData: {},
    calculateNode: (ctx) => {
      const a = ctx.node.ports["a"];
      const b = ctx.node.ports["b"];
      const c = ctx.node.ports["c"];
      if (a && b && c) {
        ctx.addEquation((row) => {
          row[a.net.id] += 1;
          row[b.net.id] += 1;
          row[c.net.id] -= 1;
        }, 0);
      }
    },
    finishCalculation: (_, data) => data,
  }),
  mul: nodeInfo({
    component: MulNode,
    defaultData: {},
    calculateNode: (ctx) => {
      const a = ctx.node.ports["a"];
      const b = ctx.node.ports["b"];
      const c = ctx.node.ports["c"];

      if (a && b && c) {
        if (a.net === b.net) {
          ctx.addEquation((row) => {
            row[a.net.id] = a.net.value;
            row[c.net.id] = -1;
          }, 0);
        } else {
          ctx.addEquation((row) => {
            row[a.net.id] = b.net.value;
            row[c.net.id] -= 1;
          }, 0);
          ctx.addEquation((row) => {
            row[b.net.id] = a.net.value;
            row[c.net.id] -= 1;
          }, 0);
        }
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
        disabled={!data.locked}
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

function PlusNode(_: NodeProps<{}>) {
  return (
    <>
      <Toolbar />
      plus
      <Handle
        type="source"
        position={Position.Top}
        id="a"
        style={{ left: 6 }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="b"
        style={{ left: "initial", right: -2 }}
      />
      <Handle type="source" position={Position.Bottom} id="c" />
    </>
  );
}
function MulNode(_: NodeProps<{}>) {
  return (
    <>
      <Toolbar />
      mul
      <Handle
        type="source"
        position={Position.Top}
        id="a"
        style={{ left: 6 }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="b"
        style={{ left: "initial", right: -2 }}
      />
      <Handle type="source" position={Position.Bottom} id="c" />
    </>
  );
}

type NodeData = GenericNodeData | NumberNodeData;
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

function wrap<A, B extends any[], C extends any[]>(
  args: [A, (...args: B) => void, (...args: C) => void],
  cb: () => void
): [A, (...args: B) => void, (...args: C) => void] {
  return [
    args[0],
    (...a: B) => {
      args[1](...a);
      cb();
    },
    (...a: C) => {
      args[2](...a);
      cb();
    },
  ];
}

export default function App() {
  const nodeState = useNodesState(initialNodes);
  const edgeState = useEdgesState(initialEdges);
  const reconnectDone = useRef(true);

  const [nodes, setNodes, onNodesChange] = wrap(nodeState, () =>
    debouncedSave(nodeState[0], edgeState[0])
  );
  const [edges, setEdges, onEdgesChange] = wrap(edgeState, () =>
    debouncedSave(nodeState[0], edgeState[0])
  );

  const reactFlowInstance = useRef<ReactFlowInstance>();

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const onEdgeUpdateStart = useCallback(
    (event: any, edge: any, handleType: any) => (reconnectDone.current = false),
    []
  );
  const onEdgeUpdateEnd = useCallback(
    (event: any, edge: Edge<EdgeData>, handleType: any) => {
      if (!reconnectDone.current) {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }

      reconnectDone.current = true;
    },
    [setEdges]
  );

  // gets called after end of edge gets dragged to another source or target
  const onEdgeUpdate = useCallback<OnEdgeUpdateFunc<NodeData>>(
    (oldEdge, newConnection) => {
      console.log(oldEdge, newConnection);
      reconnectDone.current = true;
      return setEdges((els) => updateEdge(oldEdge, newConnection, els));
    },
    []
  );

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
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
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
              setNodes((ns) =>
                ns.concat({
                  id: getId(),
                  type,
                  position,
                  data: nodeTypeInfos[type].defaultData,
                })
              );
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
              const [calcNodes, nets] = buildGraph(nodes, edges);
              calculate(calcNodes, nets);

              setNodes((nds) =>
                nds.map((node) => ({
                  ...node,
                  data: nodeTypeInfos[node.type!].finishCalculation(
                    calcNodes[node.id],
                    node.data
                  ),
                }))
              );
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
