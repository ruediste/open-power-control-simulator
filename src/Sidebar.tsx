const onDragStart = (
  event: React.DragEvent<HTMLDivElement>,
  nodeType: string
) => {
  event.dataTransfer.setData("application/reactflow", nodeType);
  event.dataTransfer.effectAllowed = "move";
};

export default function Sidebar() {
  return (
    <aside>
      <div onDragStart={(event) => onDragStart(event, "number")} draggable>
        Number
      </div>
      <div onDragStart={(event) => onDragStart(event, "plus")} draggable>
        Plus
      </div>
    </aside>
  );
}
