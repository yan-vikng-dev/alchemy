import { readFile } from "node:fs/promises";
import path from "pathe";
import { getPackageManagerRunner } from "../../util/detect-package-manager.ts";
import type { Assets } from "../assets.ts";
import type { Bindings } from "../bindings.ts";
import { withSkipPathValidation } from "../miniflare/paths.ts";
import {
  spreadBuildProps,
  spreadDevProps,
  Website,
  type WebsiteProps,
} from "../website.ts";
import type { Worker } from "../worker.ts";

export interface ViteProps<
  B extends Bindings,
  RPC extends Rpc.WorkerEntrypointBranded = Rpc.WorkerEntrypointBranded,
> extends WebsiteProps<B, RPC> {}

export type Vite<
  B extends Bindings,
  RPC extends Rpc.WorkerEntrypointBranded = Rpc.WorkerEntrypointBranded,
> = B extends { ASSETS: any } ? never : Worker<B & { ASSETS: Assets }, RPC>;

export async function Vite<
  B extends Bindings,
  RPC extends Rpc.WorkerEntrypointBranded = Rpc.WorkerEntrypointBranded,
>(id: string, props: ViteProps<B, RPC>): Promise<Vite<B, RPC>> {
  const runner = await getPackageManagerRunner();
  const viteBin = await detectVitePlus(props.cwd ?? process.cwd());
  let dev = spreadDevProps(props, `${runner} ${viteBin} dev`);
  let domain = typeof dev === "object" ? dev.domain : undefined;
  const command = typeof dev === "object" ? dev.command! : dev;
  if (!domain) {
    let port;
    const args = command.split(" ");
    if (args.find((arg) => arg.startsWith("--port="))) {
      port = args.find((arg) => arg.startsWith("--port="))?.split("=")[1];
    } else if (args.includes("--port")) {
      const index = args.indexOf("--port");
      port = args[index + 1];
    } else {
      try {
        const config = await withSkipPathValidation(
          () =>
            import(path.resolve(props.cwd ?? process.cwd(), "vite.config.ts")),
        );
        port = config.default?.server?.port ?? 5173;
      } catch {}
    }
    if (port) {
      domain = `localhost:${port}`;
    }
  }
  return await Website(id, {
    spa: true,
    ...props,
    assets:
      typeof props.assets === "string"
        ? { directory: props.assets }
        : {
            ...(props.assets ?? {}),
            directory:
              props.assets?.directory ??
              (props.entrypoint || props.script ? "dist/client" : "dist"),
          },
    build: spreadBuildProps(props, `${runner} ${viteBin} build`),
    dev: domain
      ? typeof dev === "string"
        ? { command: dev, domain }
        : { ...dev, domain }
      : dev,
  });
}

async function detectVitePlus(cwd: string): Promise<string> {
  try {
    const pkgJson = JSON.parse(
      await readFile(path.resolve(cwd, "package.json"), "utf-8"),
    );
    const deps = {
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
    };
    if ("vite-plus" in deps) {
      return "vp";
    }
  } catch {}
  return "vite";
}
