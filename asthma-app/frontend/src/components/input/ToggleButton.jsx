import { Button } from "react-bootstrap";

function ToggleButton({
    isCollapse = false,
    onClick,
    className = "",
    style = {},
    width = 36,
    height = 36,
}) {
    const path = isCollapse
        ? `
            M 3 7
            L 8 12
            L 13 7
          `
        : `
            M 3 10
            L 8 5
            L 13 10
          `;

    return (
        <Button
            className={className}
            style={style}
            onClick={onClick}
            // isCollapse means "currently collapsed", so the action is to expand
            aria-label={isCollapse ? "Expand chat" : "Collapse chat"}
        >
            <svg
                width={width}
                height={height}
                viewBox="0 0 16 16"
                fill="none"
            >
                <path
                    d={path}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </Button>
    );
}

export default ToggleButton;