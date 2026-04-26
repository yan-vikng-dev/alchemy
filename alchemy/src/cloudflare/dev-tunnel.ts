import type { Scope } from "../scope.ts";
import { Tunnel } from "./tunnel.ts";

export interface NamedDevTunnelOptions {
  /**
   * The Cloudflare Tunnel name to create, adopt, and run.
   */
  name?: string;
  /**
   * The public hostname routed to the local dev server.
   */
  hostname?: string;
  /**
   * Whether to adopt an existing tunnel with the same name.
   *
   * @default true
   */
  adopt?: boolean;
  /**
   * Whether to delete the tunnel on destroy.
   *
   * @default false
   */
  delete?: boolean;
  /**
   * How to run the local tunnel connector.
   *
   * @default "wrangler"
   */
  run?: "wrangler" | false;
}

export interface NamedDevTunnel extends NamedDevTunnelOptions {
  name: string;
  hostname: string;
}

type DomainInput = string | { domainName: string };

export type DevTunnel = boolean | "named" | NamedDevTunnelOptions;
export type ResolvedDevTunnel = boolean | NamedDevTunnel;

export const isNamedDevTunnel = (
  tunnel: DevTunnel | boolean | undefined,
): tunnel is NamedDevTunnelOptions | "named" =>
  tunnel === "named" || (typeof tunnel === "object" && tunnel !== null);

export function getDevTunnel(
  tunnel: DevTunnel | undefined,
  scopeTunnel: boolean,
): DevTunnel | undefined;
export function getDevTunnel(
  tunnel: DevTunnel | undefined,
  scopeTunnel: boolean,
  input: {
    domains?: DomainInput[];
    resourceId: string;
    stage: string;
  },
): ResolvedDevTunnel | undefined;
export function getDevTunnel(
  tunnel: DevTunnel | undefined,
  scopeTunnel: boolean,
  input?: {
    domains?: DomainInput[];
    resourceId: string;
    stage: string;
  },
): DevTunnel | ResolvedDevTunnel | undefined {
  const devTunnel = tunnel ?? (scopeTunnel ? true : undefined);
  if (!isNamedDevTunnel(devTunnel)) {
    return devTunnel;
  }
  if (input === undefined) {
    return devTunnel;
  }
  return resolveNamedDevTunnel(devTunnel, input);
}

export const resolveNamedDevTunnel = (
  tunnel: NamedDevTunnelOptions | "named",
  input: {
    domains?: DomainInput[];
    resourceId: string;
    stage: string;
  },
): NamedDevTunnel => {
  const options = tunnel === "named" ? {} : tunnel;
  const name = options.name ?? `tunnel-${input.resourceId}-${input.stage}`;
  const hostname = options.hostname ?? inferDevTunnelHostname(name, input);
  return {
    ...options,
    name,
    hostname,
  };
};

const inferDevTunnelHostname = (
  name: string,
  input: {
    domains?: DomainInput[];
    resourceId: string;
    stage: string;
  },
): string => {
  const domain = input.domains?.[0];
  const domainName = typeof domain === "string" ? domain : domain?.domainName;
  if (!domainName) {
    throw new Error(
      `Unable to infer dev tunnel hostname for '${input.resourceId}'. Provide a domain or set dev.tunnel.hostname.`,
    );
  }
  return `${name}.${domainName}`;
};

export const getDevTunnelEnv = (
  tunnel: ResolvedDevTunnel | undefined,
): Record<string, string> => {
  if (tunnel === true) {
    return { ALCHEMY_DEV_TUNNEL: "quick" };
  }
  if (typeof tunnel === "object" && tunnel !== null) {
    return {
      ALCHEMY_DEV_TUNNEL: "named",
      ALCHEMY_DEV_TUNNEL_HOST: tunnel.hostname,
      ALCHEMY_DEV_URL: `https://${tunnel.hostname}`,
    };
  }
  return {};
};

export const namedTunnel = async (
  scope: Scope,
  id: string,
  tunnel: NamedDevTunnel,
  localUrl: string,
) => {
  const service = new URL(localUrl).origin;

  await Tunnel(`${id}-tunnel`, {
    name: tunnel.name,
    adopt: tunnel.adopt ?? true,
    delete: tunnel.delete ?? false,
    token: false,
    ingress: [
      {
        hostname: tunnel.hostname,
        service,
      },
      {
        service: "http_status:404",
      },
    ],
  });

  if (tunnel.run !== false) {
    await scope.spawn(`${id}-tunnel-run`, {
      cmd: `wrangler tunnel run ${JSON.stringify(tunnel.name)}`,
      processName: "wrangler",
    });
  }

  return `https://${tunnel.hostname}`;
};
