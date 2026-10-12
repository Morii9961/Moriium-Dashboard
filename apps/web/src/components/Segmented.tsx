/** 分段选择：一组单选按钮，外观是一条胶囊。键盘用方向键切换（原生单选组的行为）。 */
import type { ChangeEvent } from 'react';

export function Segmented<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  showLegend = false,
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T, e: ChangeEvent<HTMLInputElement>) => void;
  showLegend?: boolean;
}) {
  return (
    <fieldset className="seg-control">
      <legend className={showLegend ? 'seg-legend' : 'sr-only'}>{legend}</legend>
      <span className="seg-options">
        {options.map(([v, label]) => (
          <label key={v} className="seg-option">
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={(e) => onChange(v, e)}
            />
            <span>{label}</span>
          </label>
        ))}
      </span>
    </fieldset>
  );
}
