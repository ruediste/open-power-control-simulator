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
  Position,
  ReactFlowInstance,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodeId,
  useNodesState,
  useReactFlow,
} from "reactflow";

import "reactflow/dist/style.css";
import "./App.scss";
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

interface NodeTypeInfo<TData> {
  component: ComponentType<NodeProps<TData>>;
  defaultData: TData;
}

const nodeTypeInfos: { [key: string]: NodeTypeInfo<any> } = {
  number: {
    component: NumberNode,
    defaultData: { type: "number", value: 0 },
  },
  plus: {
    component: PlusNode,
    defaultData: { type: "generic" },
  },
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

function useUpdateNode<T>(_: NodeProps<NumberNodeData>): (newData: T) => void {
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
        disabled={!data.locked}
        value={data.value}
        onChange={(value) => updateNode({ value })}
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

function PlusNode(props: NodeProps<{}>) {
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
      <Handle type="source" position={Position.Bottom} id="r" />
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
        <Sidebar />
      </ReactFlowProvider>
    </div>
  );
}
