// Entry point for the classic-script browser bundle (`bff-interpreter.js`).
// esbuild exposes these exports on the `BFF` global and the build adds a
// top-level `BrainfuckVM` alias for backwards compatibility with bff-ui.
export { BrainfuckVM, BrainfuckError, BrainfuckSyntaxError, StepLimitExceededError } from "./index.js";
