import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// Changes on every commit, so phones pick up the new offline page after a deploy.
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

const serwist = createSerwistRoute({
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
});

export const { generateStaticParams } = serwist;

/**
 * Builds sw.js (and its source map) with esbuild. Cached, so with Cache Components the
 * files are produced once at build time and served as static files, without esbuild or
 * the source at runtime. (Serwist's own `dynamic`/`revalidate` exports aren't allowed
 * with Cache Components.)
 */
async function buildFile(path: string) {
  "use cache";
  const res = await serwist.GET(new Request(`http://build.local/serwist/${path}`), {
    params: Promise.resolve({ path }),
  });
  return { body: await res.text(), type: res.headers.get("Content-Type") ?? "text/plain" };
}

export async function GET(_request: Request, { params }: RouteContext<"/serwist/[path]">) {
  const { path } = await params;
  const file = await buildFile(path);
  if (!file.body) return new Response("Not found", { status: 404 });
  return new Response(file.body, {
    headers: {
      "Content-Type": file.type,
      // Served from /serwist/ but controls the whole site.
      "Service-Worker-Allowed": "/",
    },
  });
}
