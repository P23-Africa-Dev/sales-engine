type ToggleProps = {
  enabled: boolean;
  onToggle: () => void;
};

export function Toggle({ enabled, onToggle }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-7 w-[52px] items-center rounded-full transition-colors cursor-pointer ${
        enabled ? "bg-[#4CAF50]" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-flex items-center justify-center h-[22px] w-[22px] transform rounded-full bg-white shadow-sm transition-transform ${
          enabled ? "translate-x-[27px]" : "translate-x-[3px]"
        }`}
      >
        <span
          className={`block w-[2px] h-[10px] rounded-full ${
            enabled ? "bg-[#4CAF50]" : "bg-gray-400"
          }`}
        />
      </span>
    </button>
  );
}
