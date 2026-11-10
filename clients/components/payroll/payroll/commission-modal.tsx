import { InlineInput } from "./inline-input";
import { SectionDivider } from "./section-divider";
import Image from "next/image";
import AddCircle from "@/assets/images/add-circle.png";

export type CommissionPreference =
  | "per-unit"
  | "percentage"
  | "per-pack"
  | "flat";

export interface ProductEntry {
  name: string;
  rate: string;
}

interface CommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  preference: CommissionPreference;
  onPreferenceChange: (p: CommissionPreference) => void;
  products: ProductEntry[];
  onProductsChange: (p: ProductEntry[]) => void;
  productErrors?: { name?: string; rate?: string }[];
  onProductErrorClear?: (index: number, field: "name" | "rate") => void;
}

const PREFERENCE_OPTIONS: {
  value: CommissionPreference;
  label: string;
  color: "blue" | "tan";
}[] = [
  { value: "per-unit", label: "Per Unit Calculation", color: "blue" },
  { value: "percentage", label: "Percentage", color: "tan" },
  { value: "per-pack", label: "Per Pack Calculation", color: "blue" },
  { value: "flat", label: "Flat", color: "tan" },
];

export function CommissionModal({
  isOpen,
  preference,
  onPreferenceChange,
  products,
  onProductsChange,
  productErrors = [],
  onProductErrorClear,
}: CommissionModalProps) {
  if (!isOpen) return null;

  const addProduct = () => {
    onProductsChange([...products, { name: "", rate: "" }]);
  };

  const updateProduct = (index: number, field: "name" | "rate", value: string) => {
    const updated = [...products];
    updated[index] = { ...updated[index], [field]: value };
    onProductsChange(updated);
    onProductErrorClear?.(index, field);
  };

  return (
    <div className="fixed right-119.75 bottom-3.25 z-60">
      <div className="relative bg-white rounded-3xl w-full max-w-105 p-7 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026]">
        <h3 className="text-[20px] font-bold text-[#0B1215] mb-6">
          Commission
        </h3>

        <SectionDivider label="Choose Preference" />

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-6">
          {PREFERENCE_OPTIONS.map((opt) => {
            const isSelected = preference === opt.value;
            const pillBg =
              opt.color === "blue" ? "bg-[#D9E8F5]" : "bg-[#E8D5B0]";
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onPreferenceChange(opt.value)}
                className="flex items-center gap-2.5 cursor-pointer"
              >
                <span
                  className={`shrink-0 w-[17px] h-[17px] rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected ? "border-[#0B1215]" : "border-gray-300"
                  }`}
                >
                  {isSelected && (
                    <span className="w-2.25 h-2.25 rounded-full bg-[#0B1215]" />
                  )}
                </span>
                <span
                  className={`flex-1 h-8 px-4 rounded-full flex items-center text-[10px] font-semibold text-[#0B1215] ${pillBg}`}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>

        <SectionDivider label="Add Product" />

        <div className="space-y-3 mb-5">
          {products.map((product, i) => (
            <div key={i}>
              <div className="grid grid-cols-2 gap-3">
                <InlineInput
                  placeholder="Product Name"
                  value={product.name}
                  onChange={(e) => updateProduct(i, "name", e.target.value)}
                  className="h-12 px-5 rounded-2xl border border-gray-200 text-[13px] text-[#0B1215] outline-none placeholder:text-gray-400 focus:border-gray-400 transition-colors"
                />
                <InlineInput
                  placeholder="Commission Rate"
                  value={product.rate}
                  onChange={(e) => updateProduct(i, "rate", e.target.value)}
                  className="h-12 px-5 rounded-2xl border border-gray-200 text-[13px] text-[#0B1215] outline-none placeholder:text-gray-400 focus:border-gray-400 transition-colors"
                />
              </div>
              {(productErrors[i]?.name || productErrors[i]?.rate) && (
                <div className="grid grid-cols-2 gap-3 mt-0.5">
                  <p className="text-[11px] text-red-500">{productErrors[i]?.name}</p>
                  <p className="text-[11px] text-red-500">{productErrors[i]?.rate}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={addProduct}
            className="w-9.5 h-8 bg-[#F8F8F8] shrink-0 rounded-[10px] border-[0.5px] border-[#D1D1D1] flex items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <Image
              src={AddCircle}
              alt="Add Product Icon"
              width={13}
              height={13}
            />
          </button>
          <button
            type="submit"
            form="set-payroll-form"
            className="w-fit px-9.25 py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
