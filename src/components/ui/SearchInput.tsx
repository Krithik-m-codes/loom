import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";

export interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export function SearchInput({ className, containerClassName, type = "search", ...props }: SearchInputProps) {
  return (
    <div className={["loom-search", containerClassName].filter(Boolean).join(" ")}>
      <Search aria-hidden="true" className="loom-search__icon" size={16} />
      <input {...props} type={type} className={["loom-input", className].filter(Boolean).join(" ")} />
    </div>
  );
}
