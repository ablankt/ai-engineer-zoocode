#!/usr/bin/env node

/**
 * Installs the ripgrep binary from the vendored copies committed under
 * `vendor/ripgrep/<target>/` into the installed `@vscode/ripgrep` package(s).
 *
 * Why this exists:
 * `@vscode/ripgrep`'s own postinstall downloads a prebuilt binary from GitHub
 * (api.github.com / github.com). In locked-down CI environments that egress is
 * blocked and the download fails with HTTP 403, breaking `pnpm install`. To make
 * installs hermetic, `@vscode/ripgrep` is removed from `pnpm.onlyBuiltDependencies`
 * (so its downloading postinstall never runs) and this script supplies the binary
 * from the in-repo vendor directory instead.
 *
 * The vendored binaries are tracked with Git LFS (see .gitattributes). The LFS
 * objects live on the GitLab host itself, so they are reachable from CI even when
 * external network access is blocked. See vendor/ripgrep/README.md for how to
 * refresh them.
 */

import { existsSync, readdirSync, mkdirSync, copyFileSync, chmodSync, statSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const isWindows = process.platform === "win32"
const binName = isWindows ? "rg.exe" : "rg"

// Mirrors the target resolution in @vscode/ripgrep/lib/postinstall.js so the
// copied binary matches what the package expects for this platform/arch.
function getTarget() {
	const arch = process.env.npm_config_arch || process.arch
	switch (process.platform) {
		case "darwin":
			return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin"
		case "win32":
			return arch === "x64"
				? "x86_64-pc-windows-msvc"
				: arch === "arm64"
					? "aarch64-pc-windows-msvc"
					: "i686-pc-windows-msvc"
		case "linux":
			return arch === "x64"
				? "x86_64-unknown-linux-musl"
				: arch === "arm" || arch === "armv7l"
					? "arm-unknown-linux-gnueabihf"
					: arch === "arm64"
						? "aarch64-unknown-linux-musl"
						: arch === "ppc64"
							? "powerpc64le-unknown-linux-gnu"
							: arch === "riscv64"
								? "riscv64gc-unknown-linux-gnu"
								: arch === "s390x"
									? "s390x-unknown-linux-gnu"
									: "i686-unknown-linux-musl"
		default:
			throw new Error(`Unknown platform: ${process.platform}`)
	}
}

// Guard against an unresolved Git LFS pointer being copied in place of the real
// binary (happens when `git lfs pull`/smudge did not run during checkout).
function assertNotLfsPointer(file) {
	const { size } = statSync(file)
	if (size < 1024) {
		const head = readFileSync(file, "utf8").slice(0, 64)
		if (head.startsWith("version https://git-lfs")) {
			throw new Error(
				`Vendored ripgrep at ${file} is an unresolved Git LFS pointer. ` +
					`Run \`git lfs pull\` (or enable LFS fetching in CI) and reinstall.`,
			)
		}
	}
}

// Locate every installed @vscode/ripgrep package directory. Under pnpm the real
// package lives in the virtual store and is symlinked elsewhere, so copying into
// the store dir covers all consumers (e.g. the CLI app).
function findRipgrepPackages() {
	const dirs = []
	const seen = new Set()

	const add = (dir) => {
		if (existsSync(join(dir, "package.json")) && !seen.has(dir)) {
			seen.add(dir)
			dirs.push(dir)
		}
	}

	const pnpmDir = join(repoRoot, "node_modules", ".pnpm")
	if (existsSync(pnpmDir)) {
		for (const entry of readdirSync(pnpmDir)) {
			if (entry.startsWith("@vscode+ripgrep@")) {
				add(join(pnpmDir, entry, "node_modules", "@vscode", "ripgrep"))
			}
		}
	}

	// Non-pnpm / hoisted layout fallback.
	add(join(repoRoot, "node_modules", "@vscode", "ripgrep"))

	return dirs
}

function main() {
	const target = getTarget()
	const source = join(repoRoot, "vendor", "ripgrep", target, binName)

	if (!existsSync(source)) {
		console.warn(
			`[vendor-ripgrep] No vendored ripgrep binary for target "${target}" ` +
				`(${join("vendor", "ripgrep", target, binName)}). Skipping. ` +
				`Add it under vendor/ripgrep/ if this platform needs an offline binary.`,
		)
		return
	}

	assertNotLfsPointer(source)

	const packages = findRipgrepPackages()
	if (packages.length === 0) {
		console.warn("[vendor-ripgrep] @vscode/ripgrep is not installed; nothing to do.")
		return
	}

	for (const pkgDir of packages) {
		const binDir = join(pkgDir, "bin")
		mkdirSync(binDir, { recursive: true })
		const dest = join(binDir, binName)
		copyFileSync(source, dest)
		if (!isWindows) {
			chmodSync(dest, 0o755)
		}
		console.log(`[vendor-ripgrep] Installed ${target}/${binName} -> ${dest}`)
	}
}

main()
