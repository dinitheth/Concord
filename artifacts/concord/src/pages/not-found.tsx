import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center text-center px-6">
      <div>
        <p className="text-[72px] font-bold text-foreground/10 sf-display mb-2">404</p>
        <h1 className="sf-display text-[28px] text-foreground mb-2">Page Not Found</h1>
        <p className="text-[15px] text-foreground/40 mb-8">This page doesn't exist or the link is invalid.</p>
        <button
          onClick={() => navigate("/")}
          className="btn-apple px-7 py-3 text-[15px]"
        >
          Back to Concord
        </button>
      </div>
    </div>
  );
}


