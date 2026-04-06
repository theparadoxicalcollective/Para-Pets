import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
    try {
      const entry = JSON.stringify({
        msg: String(error?.message ?? error).slice(0, 500),
        source: String(info?.componentStack ?? "").slice(0, 400),
        ts: Date.now(),
      });
      localStorage.setItem("__para_last_error", entry);
    } catch (_) {}
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback;

      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#07090f",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 32,
            zIndex: 9999,
          }}
        >
          <div
            style={{
              fontFamily: "fantasy, serif",
              fontSize: 18,
              color: "#7fbfb0",
              textAlign: "center",
              letterSpacing: "0.15em",
              textShadow: "0 0 20px rgba(127,191,176,0.4)",
              marginBottom: 4,
            }}
          >
            Something went wrong
          </div>
          {this.state.error?.message && (
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                color: "#f87171",
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: 8,
                padding: "8px 12px",
                maxWidth: 320,
                wordBreak: "break-word",
                lineHeight: 1.6,
                textAlign: "left",
              }}
            >
              {this.state.error.message}
            </div>
          )}
          <div
            style={{
              fontFamily: "fantasy, serif",
              fontSize: 11,
              color: "rgba(127,191,176,0.45)",
              textAlign: "center",
              letterSpacing: "0.12em",
              maxWidth: 280,
              lineHeight: 1.8,
            }}
          >
            An unexpected error occurred. Tap below to return to the game.
          </div>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: 8,
              fontFamily: "fantasy, serif",
              fontSize: 11,
              letterSpacing: "0.2em",
              color: "rgba(212,160,23,0.9)",
              background: "linear-gradient(160deg, rgba(30,18,4,0.96) 0%, rgba(15,9,2,0.98) 100%)",
              border: "1.5px solid rgba(212,160,23,0.55)",
              borderRadius: 9999,
              padding: "10px 24px",
              cursor: "pointer",
              boxShadow: "0 0 18px rgba(212,160,23,0.18), 0 4px 16px rgba(0,0,0,0.55)",
            }}
          >
            Return to Game
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
