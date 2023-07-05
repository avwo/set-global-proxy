export interface ProxyOptions {
  host: string;
  port: number;
  bypass?: string;
  sudo?: boolean;
}

export function enableProxy(options: ProxyOptions): boolean;

export function disableProxy(sudo?: boolean): boolean;

export function getMacProxyHelper(): string | undefined;

export function getUid(file: string): number | undefined;

export function getBypass(bypass: string): string[] | undefined;
