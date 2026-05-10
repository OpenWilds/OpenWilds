import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

type SegmentedValue = number | string;

export type SegmentedControlOption<TValue extends SegmentedValue> = {
  ariaLabel?: string;
  disabled?: boolean;
  icon?: ReactNode;
  label: ReactNode;
  value: TValue;
};

export function SegmentedControl<TValue extends SegmentedValue>({
  ariaLabel,
  className,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  className?: string;
  options: readonly SegmentedControlOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  const controlClassName = ["studio-segmented-control", className]
    .filter(Boolean)
    .join(" ");
  const style = {
    "--studio-segment-count": options.length,
  } as CSSProperties;

  const focusSibling = (
    event: KeyboardEvent<HTMLButtonElement>,
    direction: 1 | -1
  ) => {
    const buttons = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        "[data-segment-option]"
      ) ?? []
    ).filter((button) => !button.disabled);
    const currentIndex = buttons.indexOf(event.currentTarget);

    if (!buttons.length || currentIndex < 0) {
      return;
    }

    event.preventDefault();
    const nextIndex =
      (currentIndex + direction + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  return (
    <div
      aria-label={ariaLabel}
      className={controlClassName}
      role="radiogroup"
      style={style}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            aria-checked={selected}
            aria-label={option.ariaLabel}
            data-active={selected ? "" : undefined}
            data-segment-option=""
            disabled={option.disabled}
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                focusSibling(event, 1);
              }

              if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                focusSibling(event, -1);
              }
            }}
            role="radio"
            type="button"
          >
            {option.icon ? (
              <span className="studio-segmented-control__icon">
                {option.icon}
              </span>
            ) : null}
            <span className="studio-segmented-control__label">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
