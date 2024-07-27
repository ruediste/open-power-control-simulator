import { CSSProperties, useEffect, useState } from "react";

export function InlineInput(props: {
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [valueInternal, setValueInternal] = useState("" + props.value);
  useEffect(() => {
    setValueInternal("" + props.value);
  }, [props.value]);

  if (!editing)
    return (
      <span className="InlineInput" onClick={() => setEditing(true)}>
        {props.value}
      </span>
    );
  else {
    return (
      <input
        onFocus={(e) => e.target.select()}
        autoFocus
        className="form-control nodrag"
        value={valueInternal}
        onChange={(e) => setValueInternal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          props.onChange(valueInternal);
        }}
      />
    );
  }
}
