# BFF Brainfuck Interpreter (`bff-interpreter`)

> **[Applied Tape Mechanics](https://github.com/applied-tape-mechanics)** — *Empirical computation and discrete field dynamics on minimal linear substrates.*
> *Enterprise-grade cloud microservices—except the core business logic is pure Brainfuck. Best Friends Forever (`BFF`) with the most hostile programming language ever created.*

A small, fast, **zero-dependency** Brainfuck virtual machine written in TypeScript. **One implementation runs everywhere**: Node.js microservices, the CLI, and the browser (`bff-ui`).

---

## Semantics

| Behavior | Definition |
|---|---|
| Cells | 8-bit, wrapping (`255 + 1 == 0`, `0 - 1 == 255`) |
| Tape | `65,536` cells by default (`tapeSize`) |
| Pointer | **Wraps around** both ends of the tape; it never errors |
| `,` at EOF | Stores `0` in the cell |
| Other characters | Treated as comments |
| Step | One executed source instruction (see below) |
| Runtime Dependencies | **Zero** (`dependencies: {}`) |

**Optimization.** By default runs of `+ - > <` are collapsed and `[-]` / `[+]` become a single `CLEAR`. Collapsed operations count as the number of source instructions they replace (a clear loop counts as 3), so `maxSteps` behaves the same with or without optimization. A run is allowed exactly `maxSteps` steps; the next one throws.

---

## Install (Node.js / TypeScript)

Pin directly to a released GitHub tag in your microservice's `package.json`:

```jsonc
"dependencies": {
  "bff-interpreter": "github:applied-tape-mechanics/bff-interpreter#v1.0.0"
}
```

The compiled `dist/` and the browser bundle (`bff-interpreter.js`) are committed and attached to GitHub Releases, so installing from GitHub requires no build step. Requires Node ≥ 22.18.

---

## Browser (Runtime CDN)

`bff-interpreter.js` is a standalone, zero-dependency classic-script bundle exposing a global `BrainfuckVM`. Load any released version directly at runtime via jsDelivr CDN:

```html
<script src="https://cdn.jsdelivr.net/gh/applied-tape-mechanics/bff-interpreter@v1.0.0/bff-interpreter.js"></script>
<script>
  const vm = new BrainfuckVM();
  console.log(vm.executeToString(',[.,]', 'Hello Applied Tape Mechanics!'));
</script>
```

---

## Usage (Node / TypeScript)

```ts
import { BrainfuckVM, BrainfuckSyntaxError, StepLimitExceededError } from 'bff-interpreter';

const vm = new BrainfuckVM({ tapeSize: 65_536, maxSteps: 50_000_000 });

vm.executeToString(',[.,]', 'Hello BFF!');        // "Hello BFF!"
vm.execute(code, inputBytes, { optimize: false }); // Uint8Array
vm.execute(code, '', { maxSteps: 1_000, resetTape: true });

try {
  vm.execute(untrustedCode);
} catch (err) {
  if (err instanceof BrainfuckSyntaxError) { /* unbalanced brackets -> HTTP 400 */ }
  else if (err instanceof StepLimitExceededError) { /* runaway program -> HTTP 422 */ }
}
```

Both errors extend `BrainfuckError`. One-shot helper: `execute(code, input, options)`.
For repeated runs, compile once: `const p = compile(code); vm.run(p, input)`.

### Persistent Tape

State machines (e.g. `bff-key-value-database`) keep data on the tape between runs. `execute` does **not** clear the tape unless `resetTape: true`.

| Method | Description |
|---|---|
| `pointer` / `resetPointer()` | Data pointer; move back to cell 0 without clearing |
| `reset()` | Clear tape and pointer |
| `readCell(i)` / `writeCell(i, v)` | One cell (`writeCell` wraps modulo 256; out of range is ignored) |
| `readTape(start, len)` | Copy of a tape slice (clipped to the tape) |
| `writeTape(start, bytes \| string)` | Write bytes or a UTF-8 string |
| `getTapeSlice(start, len)` | Slice as `number[]` |

---

## CLI

```bash
bff-interpreter script.bf
bff-interpreter -c "++++++++[>++++++++<-]>+."
bff-interpreter -c ",[.,]" -i "Hello world"
echo "piped" | bff-interpreter -c ",[.,]" -i -     # -i - reads input from stdin
bff-interpreter script.bf --tape-size 100000 --max-steps 100000000 --no-optimize
```

Exit codes: `0` success, `1` execution/IO error, `2` bad usage.

---

## Docker (Zero Host Dependencies)

A pre-built container image is published automatically to **GitHub Container Registry (`ghcr.io`)** on every release:

```bash
# Run directly from GitHub Container Registry (no clone needed)
docker run --rm ghcr.io/applied-tape-mechanics/bff-interpreter:latest

# Execute inline Brainfuck code via the published GHCR image
docker run --rm ghcr.io/applied-tape-mechanics/bff-interpreter:latest -c ",[.,]" -i "Hello from GHCR!"
```

Or run locally via Docker Compose for development, testing, and building without installing Node.js on your host machine:

```bash
# Run the CLI runner (executes a default Hello World program)
docker compose run --rm bff-interpreter

# Execute inline Brainfuck code or pass stdin via Docker
docker compose run --rm bff-interpreter -c ",[.,]" -i "Hello from Docker!"

# Run the unit test suite inside Docker
docker compose run --rm test

# Run TypeScript type checking inside Docker
docker compose run --rm test npm run typecheck

# Rebuild dist/ and the browser bundle inside Docker
docker compose run --rm test npm run build
```

---

## Local Development & Testing (Node.js ≥ 22.18)

```bash
npm install
npm test             # node:test, runs the TypeScript tests directly
npm run typecheck
npm run build        # dist/ (library + types) and bff-interpreter.js (browser)
npm run bench        # run raw vs. optimized vs. JIT performance benchmark suite
```
