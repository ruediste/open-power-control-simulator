import { Graph, isConnectionNode } from "./App";
import { nodeTypeInfoList } from "./nodeTypes";

export interface SidebarDragData {
  nodeTypeId: string;
  graphId?: number;
}

function dragData(data: SidebarDragData) {
  return JSON.stringify(data);
}

export default function Sidebar(props: {
  graphs: Graph[];
  currentGraphId: number;
}) {
  return (
    <aside>
      {nodeTypeInfoList
        .filter((type) => type.id != "graphReference")
        .map((type) => (
          <div
            key={type.id}
            onDragStart={(event) => {
              event.dataTransfer.setData(
                "application/reactflow",
                dragData({ nodeTypeId: type.id })
              );
              event.dataTransfer.effectAllowed = "move";
            }}
            draggable
          >
            {type.label}
          </div>
        ))}

      {props.graphs
        .filter(
          (x) =>
            x.id != props.currentGraphId &&
            x.nodes.some((n) => isConnectionNode(n))
        )
        .map((graph) => (
          <div
            key={graph.id}
            onDragStart={(event) => {
              event.dataTransfer.setData(
                "application/reactflow",
                dragData({ nodeTypeId: "graphReference", graphId: graph.id })
              );
              event.dataTransfer.effectAllowed = "move";
            }}
            draggable
          >
            {graph.name}
          </div>
        ))}
    </aside>
  );
}
