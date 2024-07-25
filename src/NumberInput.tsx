import { useEffect, useState } from "react";

export function NumberInput(props: {
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
