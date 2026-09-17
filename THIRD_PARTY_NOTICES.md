# Third-party notices

This file tracks third-party code and libraries used by CONVERGENCE. It is not a license for CONVERGENCE itself.

## ciefa/idle-game-template

Repository: https://github.com/ciefa/idle-game-template  
License: MIT  
Use: adapted portions of deterministic RNG, wall-clock scheduler, event buffer, and FNV-1a save hash.

MIT License

Copyright (c) 2026 ciefa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Runtime dependencies

The integration spike also uses these packages under their upstream licenses. Exact versions are pinned in `package.json`.

- `@idlekitjs/economy` — MIT — https://github.com/idlekitjs/idlekit
- `@yggdrasil-forge/core` — MIT — https://github.com/fraga-labs/yggdrasil-forge
- `inkjs` — MIT — https://github.com/y-lohse/inkjs
- `vue` — MIT
- `pinia` — MIT
- `@capacitor/core` / `@capacitor/preferences` — MIT
- `zod` — MIT

Before public beta packaging, generate and verify the complete production dependency license manifest from the resolved lockfile.
