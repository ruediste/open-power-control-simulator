import Matrix, { solve } from "ml-matrix";
import { Edge, Node } from "reactflow";
import { EdgeData, NodeData, nodeTypeInfos } from "./nodeTypes";

export type CalcNodeFunction<TData> = (ctx: {
  node: CalcNode<TData>;
  data: TData;
  addEquation: (func: (a: number[]) => number) => void;
}) => void;

export class CalcNode<TData> {
  ports: {
    [key: string]: {
      net: CalcNet;
    };
  } = {};

  constructor(
    public graphNodeId: string,
    public data: TData,
    public calculateNode: CalcNodeFunction<any>
  ) {}
}

export class CalcNet {
  ports: [CalcNode<any>, string][] = [];
  constructor(public id: number, public value: number) {}
}

export function buildCalculationGraph(
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

export default function calculate(
  calcNodes: { [key: string]: CalcNode<any> },
  nets: CalcNet[]
) {
  let lastError: number | undefined;
  let alpha = 1;
  let n = 0;

  let x: Matrix;
  {
    const xData = new Array(nets.length);
    for (const net of nets) {
      xData[net.id] = net.value;
    }
    x = Matrix.columnVector(xData);
  }

  while (true) {
    const aRows: number[][] = [];
    const b: number[] = [];

    for (const node of Object.values(calcNodes)) {
      node.calculateNode({
        node: node,
        data: node.data,
        addEquation: (func) => {
          const aRow = new Array(nets.length).fill(0);
          const valueAtX = func(aRow);
          aRows.push(aRow);
          b.push(-valueAtX);
        },
      });
    }

    // solve the equations
    const A = new Matrix(aRows);
    const B = Matrix.columnVector(b);
    let d = solve(A, B);

    x = x.add(d.scale({ scale: alpha }));

    // apply the new values to the nets
    for (const net of nets) {
      net.value = x.get(net.id, 0);
    }

    // calculate the error and break loop if applicable
    const e = B.norm();
    console.log(
      "alpha",
      alpha,
      "A",
      A.toString(),
      "B",
      B.toString(),
      "x",
      x.toString(),
      "Error: ",
      e
    );
    if (lastError !== undefined && e > lastError * 0.99) {
      alpha *= 0.9;
    }

    if (d.norm() < 1e-8) {
      break;
    }

    if (alpha < 0.1 || n > 100) {
      break;
    }
    lastError = e;
    n++;
  }
}
