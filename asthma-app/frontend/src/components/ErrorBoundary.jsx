import { Component } from "react";

// Shows a way out instead of a blank page if any screen crashes.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Lobelia crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="cream-body min-vh-100 at-middle-center vertical-16 p-4 text-center">
        <h1>Something went wrong</h1>
        <p className="paragraph">Please reload the page. If you're having trouble breathing, call 911.</p>
        <div className="btn-row" style={{ width: "min(480px, 100%)" }}>
          <button type="button" className="btn button-dark btn-large-text" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="btn help-call-911 btn-large-text" href="tel:911">
            Call 911
          </a>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;
