import Matrix, { solve } from "ml-matrix";
import { Graph, Project } from "./App";
import { getConnectionNodes, GraphNode, nodeTypeInfos } from "./nodeTypes";

export type CalcNodeFunction<TData> = (ctx: {
  node: CalcNode<TData>;
  data: TData;
  /**
   * Add an equation which should be solved: f(x)=0
   * The func receives as argument a row in the Jacobian matrix. Fill it with the derivative of f(x) with
   * respect to the members of x. Return the value f(x).  */
  addEquation: (func: (a: number[]) => number) => void;
}) => void;

export class CalcNode<TData> {
  connectedNetsByPort: {
    [key: string]: {
      net: CalcNet;
    };
  } = {};

  initialValuesByPort: {
    [key: string]: number;
  } = {};

  constructor(
    public id: string,
    public graphNodeId: string,
    public data: TData,
    public calculateNode: CalcNodeFunction<any>
  ) {}
}

export class CalcNet {
  ports: [CalcNode<any>, string][] = [];
  constructor(public id: number, public value: number) {}
}

class CalculationGraphBuildingContext {
  calcNodes: { [key: string]: CalcNode<any> } = {};
  /** nodeId => port => [node, port][]*/
  connections: {
    [nodeId: string]: {
      [portId: string]: { nodeId: string; port: string }[];
    };
  } = {};

  constructor(public project: Project) {}

  addConnection(
    sourceNode: string,
    sourcePort: string,
    targetNode: string,
    targetPort: string
  ) {
    this.addConnectionImpl(sourceNode, sourcePort, targetNode, targetPort);
    this.addConnectionImpl(targetNode, targetPort, sourceNode, sourcePort);
  }

  private addConnectionImpl(
    sourceNode: string,
    sourcePort: string,
    targetNode: string,
    targetPort: string
  ) {
    if (!this.connections[sourceNode]) this.connections[sourceNode] = {};
    if (!this.connections[sourceNode][sourcePort])
      this.connections[sourceNode][sourcePort] = [];
    this.connections[sourceNode][sourcePort].push({
      nodeId: targetNode,
      port: targetPort,
    });
  }
}

function collectCalcNodes(
  nodeIdPrefix: string,
  graph: Graph,
  parentGraphIds: Set<number>,
  ctx: CalculationGraphBuildingContext
) {
  if (parentGraphIds.has(graph.id)) return;
  parentGraphIds.add(graph.id);

  const nodeById: { [id: string]: GraphNode } = {};

  for (const node of graph.nodes) {
    nodeById[node.id] = node;
    if (node.data.type === "graphReference") {
      const referencedGraph = ctx.project.getGraph(node.data.graphId);
      collectCalcNodes(
        nodeIdPrefix + node.id + ".",
        referencedGraph,
        parentGraphIds,
        ctx
      );

      // create connections between the ports of the referencing node and the number node in the referenced graph
      const conNodes = getConnectionNodes(referencedGraph);
      conNodes[0].concat(conNodes[1]).forEach((conNode) => {
        ctx.addConnection(
          nodeIdPrefix + node.id, // id of the referencing node
          conNode.id, // the port id is equal to the id of the number node in the referenced graph
          nodeIdPrefix + node.id + "." + conNode.id, // build the id of the number node in the referenced graph
          "a" // always connect to the "a" port
        );
      });
    }

    var calcNode = new CalcNode(
      nodeIdPrefix + node.id,
      node.id,
      node.data,
      nodeTypeInfos[node.type!].calculateNode
    );

    ctx.calcNodes[nodeIdPrefix + node.id] = calcNode;
    if (node.data.type == "number") {
      calcNode.initialValuesByPort["a"] = node.data.value;
    }
  }

  // fill connections
  for (const edge of graph.edges) {
    function mapHandle(nodeId: string, handle: string) {
      const node = nodeById[nodeId];

      // map connections to the b port of numbers to the a port
      if (node.type === "number" && handle == "b")
        return [nodeIdPrefix + nodeId, "a"] as const;
      return [nodeIdPrefix + nodeId, handle] as const;
    }
    ctx.addConnection(
      ...mapHandle(edge.source, edge.sourceHandle!),
      ...mapHandle(edge.target, edge.targetHandle!)
    );
  }

  parentGraphIds.delete(graph.id);
}
export function buildCalculationGraph(project: Project, inputGraph: Graph) {
  const ctx = new CalculationGraphBuildingContext(project);
  collectCalcNodes("", inputGraph, new Set(), ctx);

  const nets: CalcNet[] = [];

  // create the calculation nets and register them with the nodes
  for (const [startNodeId, connectionsByPort] of Object.entries(
    ctx.connections
  )) {
    const startNode = ctx.calcNodes[startNodeId];
    for (const startPort of Object.keys(connectionsByPort)) {
      if (startNode.connectedNetsByPort[startPort]) {
        // we have reached this port already before, skip it
        continue;
      }

      // starting from this port, create a net an connect all reachable ports
      const net = new CalcNet(nets.length, 1);
      nets.push(net);
      const border: { nodeId: string; port: string }[] = [
        { nodeId: startNodeId, port: startPort },
      ];
      const seen: { [nodeId: string]: { [portId: string]: true } } = {};
      let initialValueCount = 0;
      let initialValueSum = 0;
      while (border.length > 0) {
        const { nodeId, port } = border.pop()!;
        if (seen[nodeId]?.[port]) continue;
        if (!seen[nodeId]) seen[nodeId] = {};
        seen[nodeId][port] = true;

        const node = ctx.calcNodes[nodeId];
        node.connectedNetsByPort[port] = { net };
        net.ports.push([node, port]);
        if (node.initialValuesByPort[port] !== undefined) {
          initialValueCount++;
          initialValueSum += node.initialValuesByPort[port];
        }

        // follow all connections continuing from the target port
        for (const { nodeId: targetNodeId, port: targetPort } of ctx
          .connections[nodeId]?.[port] ?? []) {
          border.push({ nodeId: targetNodeId, port: targetPort });
        }
      }
      if (initialValueCount > 0) {
        net.value = initialValueSum / initialValueCount;
      }
    }
  }
  return [ctx.calcNodes, nets] as const;
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

    /* Multidimensional newton method
      f(x + δ) ≈ f(x) + J(x) δ = 0
      J(x) δ = −f(x)

      x = x + αδ
    */

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

    // perform the step
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
