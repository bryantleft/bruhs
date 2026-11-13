/** Build targets shared by packaging and its architecture checks. */
export function macTargets(requested = "native", host = process.arch) {
  const native = host === "arm64" ? "arm64" : host === "x64" || host === "x86_64" ? "x86_64" : null;
  if (!native) throw new Error(`Pith can't build for the host architecture ${host}. Use an Apple Silicon or Intel Mac.`);
  const choice = requested === "native" ? native : requested;
  const architectures = choice === "universal" ? ["arm64", "x86_64"] : [choice];
  if (architectures.some((arch) => arch !== "arm64" && arch !== "x86_64")) {
    throw new Error(`Unknown Pith architecture ${requested}. Choose native, arm64, x86_64 or universal.`);
  }
  return {
    requested,
    architectures,
    deploymentTarget: "14.0",
    rustTargets: architectures.map((arch) => arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin"),
    swiftArguments: architectures.flatMap((arch) => ["--arch", arch]),
  };
}

export function buildArchitecture(args, environment = {}) {
  const flags = args.flatMap((arg, index) => arg === "--arch" ? [args[index + 1]] : arg.startsWith("--arch=") ? [arg.slice(7)] : []);
  if (flags.length > 1) throw new Error("Pass --arch only once.");
  if (flags.length && (!flags[0] || flags[0].startsWith("--"))) throw new Error("--arch needs native, arm64, x86_64 or universal.");
  return flags[0] ?? environment.PITH_ARCH ?? (args.includes("--release") ? "universal" : "native");
}

/** Every bundled executable must contain the requested architectures; app/scanner should contain exactly those. */
export function verifyArchitectures(output, required, file, exact = false) {
  const found = output.trim().split(/\s+/).filter(Boolean);
  if (required.some((arch) => !found.includes(arch)) || (exact && found.length !== required.length)) {
    throw new Error(`${file} contains ${found.join(", ") || "no architectures"}; this build requires ${required.join(", ")}. Rebuild every bundled executable for the same target.`);
  }
  return found;
}

/** vtool reports a deployment version for each Mach-O slice. A newer minimum breaks the advertised macOS floor. */
export function verifyDeploymentTarget(output, maximum, file, slices) {
  const versions = [...output.matchAll(/^\s*minos\s+(\d+(?:\.\d+){0,2})\s*$/gm)].map((match) => match[1]);
  const parts = (version) => version.split(".").map(Number);
  const newer = (version) => {
    const found = parts(version), allowed = parts(maximum);
    for (let i = 0; i < Math.max(found.length, allowed.length); i++) {
      if ((found[i] ?? 0) !== (allowed[i] ?? 0)) return (found[i] ?? 0) > (allowed[i] ?? 0);
    }
    return false;
  };
  if (versions.length !== slices || versions.some(newer)) {
    throw new Error(`${file} has deployment targets ${versions.join(", ") || "unknown"}; all ${slices} slices must support macOS ${maximum}. Check MACOSX_DEPLOYMENT_TARGET and Swift package platforms.`);
  }
  return versions;
}
