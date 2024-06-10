export type CalcNodeFunction<TData> = (ctx: {
  node: CalcNode<TData>;
  data: TData;
  setPortValue: (portId: string, value: number) => void;
}) => void;

export class CalcNode<TData> {
  ports: {
    [key: string]: {
      net: CalcNet;
      /** if true, the port outputs a fixed value into the net */
      fixedValue: boolean;
    };
  } = {};

  constructor(
    public graphNodeId: string,
    public data: any,
    public calculateNode: CalcNodeFunction<any>
  ) {}
}

export class CalcNet {
  /** if true, one of the ports contributed a fixed value */
  fixedValue = false;
  value?: number;
  ports: [CalcNode<any>, string][] = [];
}

export default function calculate(
  graphNodes: { [key: string]: CalcNode<any> },
  _: CalcNet[]
) {
  // calculate the nodes
  const pendingNodes: { [key: string]: CalcNode<any> } = { ...graphNodes };
  while (Object.keys(pendingNodes).length > 0) {
    const nextNode = Object.values(pendingNodes)[0];
    delete pendingNodes[nextNode.graphNodeId];
    nextNode.calculateNode({
      node: nextNode,
      data: nextNode.data,
      setPortValue(portId, value) {
        const port = nextNode.ports[portId];
        if (!port) return;
        if (port.fixedValue)
          // port already output a value before, break the cycle
          return;
        port.fixedValue = true;
        port.net.fixedValue = true;
        port.net.value = value;
        for (const [node, _] of port.net.ports) {
          if (node === nextNode) continue;
          pendingNodes[node.graphNodeId] = node;
        }
      },
    });
  }
}
