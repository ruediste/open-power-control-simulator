import Matrix, { solve } from "ml-matrix";

export type CalcNodeFunction<TData> = (ctx: {
  node: CalcNode<TData>;
  data: TData;
  addEquation: (func: (a: number[]) => void, b: number) => void;
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

export default function calculate(
  calcNodes: { [key: string]: CalcNode<any> },
  nets: CalcNet[]
) {
  let lastError: number | undefined;
  let alpha = 1;
  let lastX: Matrix | undefined;
  while (true) {
    const aRows: number[][] = [];
    const b: number[] = [];

    for (const node of Object.values(calcNodes)) {
      node.calculateNode({
        node: node,
        data: node.data,
        addEquation: (func, expected) => {
          const aRow = new Array(nets.length).fill(0);
          func(aRow);
          aRows.push(aRow);
          b.push(expected);
        },
      });
    }

    // solve the equations
    const A = new Matrix(aRows);
    const B = Matrix.columnVector(b);
    const x = solve(A, B);

    // apply the new values
    for (const net of nets) {
      net.value = (1 - alpha) * net.value + alpha * x.get(net.id, 0);
    }

    // calculate the error and break loop if applicable
    const E = Matrix.sub(B, A.mmul(x));
    const e = E.norm();
    console.log(
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

    if (lastX !== undefined) {
      const diff = Matrix.sub(x, lastX);
      if (diff.norm() < 1e-8) {
        break;
      }
    }
    if (alpha < 0.1) {
      break;
    }
    lastError = e;
    lastX = x;
  }
}
