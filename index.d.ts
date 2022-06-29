export interface ProxyOptions {
  host: string;
  port: number;
  bypass?: string;
  sudo?: boolean;
}

export function enableProxy(options: ProxyOptions): boolean;

export function disableProxy(): boolean;
