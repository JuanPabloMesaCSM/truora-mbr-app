import { motion } from "framer-motion";
import { Check } from "lucide-react";

interface AnimatedCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onClick?: (e: React.MouseEvent) => void;
}

export function AnimatedCheckbox({ checked, onCheckedChange, onClick }: AnimatedCheckboxProps) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        onClick?.(e);
        onCheckedChange(!checked);
      }}
      className={`
        h-[18px] w-[18px] shrink-0 rounded border-2 flex items-center justify-center
        transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
        ${checked
          ? "bg-primary border-primary"
          : "border-muted-foreground/40 bg-transparent hover:border-primary/60"
        }
      `}
      whileTap={{ scale: 0.9 }}
      animate={checked ? { scale: [1.05, 1] } : { scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
    >
      {checked && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
        >
          <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
        </motion.div>
      )}
    </motion.button>
  );
}
