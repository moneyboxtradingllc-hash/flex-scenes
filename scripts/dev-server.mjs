import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const interfaces = Object.values(os.networkInterfaces()).flat().filter((entry) => entry?.family === "IPv4" && !entry.internal);
const isPrivate = (address) => {
  const [first, second] = address.split(".").map(Number);
  return first === 10 || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31;
};
const lanAddress = interfaces.find((entry) => isPrivate(entry.address))?.address ?? interfaces[0]?.address;

if (!lanAddress) {
  console.error("No active IPv4 network address was found. Start Flex Scenes with a LAN adapter connected.");
  process.exit(1);
}

console.log(`Flex Scenes is starting for this computer and its local network: http://127.0.0.1:3200 and http://${lanAddress}:3200`);
console.log("The phone must be connected to the same private Wi-Fi/LAN.");

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, [nextBin, "dev", "--hostname", "0.0.0.0", "--port", "3200"], {
  cwd: root,
  env: { ...process.env, FLEX_SCENES_LAN_IP: lanAddress },
  stdio: "inherit",
  windowsHide: true,
});

server.on("error", (error) => {
  console.error(`Unable to start the Flex Scenes development server: ${error.message}`);
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
