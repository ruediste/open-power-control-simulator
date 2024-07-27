import { Graph } from "./App";
import { nodeTypeInfoList } from "./nodeTypes";

export default function Sidebar(props: { graphs: Graph[] }) {
  return (
    <aside>
      {nodeTypeInfoList.map((type) => (
        <div
          onDragStart={(event) => {
            event.dataTransfer.setData("application/reactflow", type.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          draggable
        >
          {type.label}
        </div>
      ))}

      {props.graphs
        .filter((x) =>
          x.nodes.some(
            (n) =>
              n.type == "number" &&
              n.data.type == "number" &&
              n.data.inputName != null
          )
        )
        .map((graph) => (
          <div>{graph.name}</div>
        ))}
    </aside>
  );
}
