import { Link, useLocation } from "react-router";
import { Crop } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Header() {
  const { pathname } = useLocation();

  const navItem = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        to={href}
        className={cn(
          "rounded-[4px] px-2 py-1.5 -mx-2 -my-1.5 text-[12px] transition-colors focus-visible:ring-2 focus-visible:ring-blue",
          active
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
        aria-current={active ? "page" : undefined}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b border-border bg-card">
      <div className="flex h-[52px] items-center gap-4 px-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-[13px] font-semibold tracking-tight"
          aria-current={pathname === "/" ? "page" : undefined}
        >
          <span
            className="grid h-5 w-5 place-items-center rounded-[5px] text-white"
            style={{
              background: "linear-gradient(135deg, #2e80ff, #8b5cf6)",
            }}
            aria-hidden="true"
          >
            <Crop className="h-3 w-3" />
          </span>
          <span>WF Cropper</span>
        </Link>
        <div className="flex-1" />
        <nav aria-label="Main navigation" className="flex items-center gap-5">
          {navItem("/", "Cropper")}
          {navItem("/wizard", "Wizard")}
          {navItem("/admin", "Templates")}
        </nav>
      </div>
    </header>
  );
}
