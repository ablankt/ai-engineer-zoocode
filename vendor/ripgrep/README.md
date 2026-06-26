# Vendored ripgrep binaries

These are prebuilt `ripgrep` binaries from
[microsoft/ripgrep-prebuilt](https://github.com/microsoft/ripgrep-prebuilt) — the
same releases `@vscode/ripgrep` downloads at install time.

We vendor them because `@vscode/ripgrep`'s postinstall fetches the binary from
GitHub (`api.github.com` / `github.com`), which is blocked in our CI and fails
with HTTP 403. To keep `pnpm install` hermetic:

- `@vscode/ripgrep` is removed from `pnpm.onlyBuiltDependencies` in the root
  `package.json`, so its downloading postinstall never runs.
- The root `postinstall` runs `scripts/vendor-ripgrep.mjs`, which copies the
  binary for the current platform/arch from here into the installed
  `@vscode/ripgrep` package's `bin/` directory.

The binaries are committed **directly to git** (not Git LFS): a plain
`git clone` materializes them in CI without needing `git-lfs` installed or any
external network access (installing git-lfs and fetching LFS objects proved
unreliable in the locked-down runners).

## Current version

- ripgrep prebuilt release: **v15.0.0** (matches `@vscode/ripgrep@1.17.0`'s
  pinned `VERSION`).

## Layout

Directory names match the target strings produced by
`@vscode/ripgrep/lib/postinstall.js` `getTarget()`:

```
vendor/ripgrep/
  x86_64-unknown-linux-musl/rg     # linux x64 (CI runners)
  aarch64-unknown-linux-musl/rg    # linux arm64
  aarch64-apple-darwin/rg          # macOS Apple Silicon
  x86_64-apple-darwin/rg           # macOS Intel
  x86_64-pc-windows-msvc/rg.exe    # Windows x64
```

If you develop on a platform not listed above, add its binary under the matching
target directory and update `.gitattributes` if needed.

## How to refresh

When `@vscode/ripgrep` bumps its pinned ripgrep `VERSION`:

```bash
VERSION=v15.0.0   # <- new version from @vscode/ripgrep/lib/postinstall.js
BASE="https://github.com/microsoft/ripgrep-prebuilt/releases/download/$VERSION"

for t in x86_64-unknown-linux-musl aarch64-unknown-linux-musl \
         aarch64-apple-darwin x86_64-apple-darwin; do
  curl -sSL "$BASE/ripgrep-$VERSION-$t.tar.gz" | tar xz -C "vendor/ripgrep/$t"
  chmod 755 "vendor/ripgrep/$t/rg"
done

curl -sSL -o /tmp/rg-win.zip \
  "$BASE/ripgrep-$VERSION-x86_64-pc-windows-msvc.zip"
unzip -oj /tmp/rg-win.zip rg.exe -d vendor/ripgrep/x86_64-pc-windows-msvc/
```

Then commit the updated binaries directly (they are intentionally not in LFS).
