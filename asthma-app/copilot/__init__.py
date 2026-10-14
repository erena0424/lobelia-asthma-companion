"""Context-aware recommendation workflow for the Asthma Copilot."""

__all__ = ["generate_copilot_advice"]


def __getattr__(name: str):
    # Loaded on first use: copilot.workflow pulls in langgraph, which is slow to import
    # and would otherwise run whenever any copilot submodule (e.g. copilot.state) is imported.
    if name == "generate_copilot_advice":
        from copilot.workflow import generate_copilot_advice

        return generate_copilot_advice
    raise AttributeError(f"module 'copilot' has no attribute {name!r}")
