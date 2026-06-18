// Helper functions for numeric version comparison for plugin download
function parseVersion(v: string) {
	// Match format: major.minor.patch-build
	const match = v.match(/^(\d+)\.(\d+)\.(\d+)-(\d+)$/)
	if (!match) {
		throw new Error(`Invalid version format: ${v}`)
	}
	return match.slice(1).map(Number)
}

// Helper functions for numeric version comparison for plugin download
export function isNewerVersion(downloadVersion: string, currentVersion: string) {
	const d = parseVersion(downloadVersion)
	const c = parseVersion(currentVersion)

	for (let i = 0; i < 4; i++) {
		if (d[i] > c[i]) return true
		if (d[i] < c[i]) return false
	}

	return false // equal
}
