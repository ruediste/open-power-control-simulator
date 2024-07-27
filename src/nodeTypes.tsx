import { ComponentType, useCallback, useEffect, useId } from "react";
import {
  Edge,
  Handle,
  Node,
  NodeProps,
  NodeToolbar,
  Position,
  useNodeId,
  useReactFlow,
  useUpdateNodeInternals,
} from "reactflow";

import "reactflow/dist/style.css";
import { Graph } from "./App";
import "./App.scss";
import { CalcNode, CalcNodeFunction } from "./calculation";
import { NumberInput, StringInput } from "./Input";

export interface NodeTypeInfo<TData> {
  id: string;
  label: string;
  component: ComponentType<NodeProps<TData>>;
  defaultData: () => TData; // calculate the nodes
  calculateNode: CalcNodeFunction<TData>;
  finishCalculation: (node: CalcNode<TData>, data: TData) => TData;
}

function nodeInfo<TData>(info: NodeTypeInfo<TData>): NodeTypeInfo<TData> {
  return info;
}
export const nodeTypeInfoList: NodeTypeInfo<any>[] = [
  nodeInfo({
    id: "number",
    label: "Number",
    component: NumberNode,
    defaultData: () => ({
      type: "number" as const,
      value: 0,
      locked: false,
      inputName: null,
    }),
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
  nodeInfo({
    id: "plus",
    label: "Plus",
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
  nodeInfo({
    id: "mul",
    label: "Multiply",
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
];

export const nodeTypeInfos: { [key: string]: NodeTypeInfo<any> } =
  Object.fromEntries(nodeTypeInfoList.map((x) => [x.id, x]));

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

interface NumberNodeData {
  type: "number";
  value: number;
  locked: boolean;
  inputName: string | null;
}

function useUpdateNode<T>(_: NodeProps<T>): (newData: Partial<T>) => void {
  const id = useNodeId();
  const flow = useReactFlow();
  return useCallback(
    (newData) =>
      flow.setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...newData } } : n
        )
      ),
    [id, flow]
  );
}

function NumberNode(props: NodeProps<NumberNodeData>) {
  const { data } = props;
  const updateNode = useUpdateNode(props);
  const id = useId();
  return (
    <>
      <Toolbar />
      <NumberInput
        value={data.value}
        onChange={(value) => updateNode({ value })}
      />
      <div style={{ display: "flex" }}>
        {data.locked ? (
          <i
            className="bi bi-lock"
            onClick={() => updateNode({ locked: false })}
          ></i>
        ) : (
          <i
            className="bi bi-unlock"
            onClick={() => updateNode({ locked: true })}
          ></i>
        )}
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            role="switch"
            id={id}
            checked={data.inputName !== null}
            onChange={(e) =>
              updateNode({
                inputName: e.target.checked ? "" : null,
              })
            }
          />
          <label className="form-check-label" htmlFor={id}>
            Graph Input
          </label>
        </div>
      </div>
      {data.inputName == null ? null : (
        <StringInput
          value={data.inputName}
          onChange={(inputName) => updateNode({ inputName })}
        />
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

export function afterGraphUpdate(graph: Graph): Graph {
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

export type NodeData = GenericNodeData | NumberNodeData | ArithmeticNodeData;

export type EdgeData = {};

export type GraphNode = Node<NodeData, string | undefined>;
export type GraphEdge = Edge<EdgeData>;
