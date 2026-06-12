export interface ProxyOptions {
  host: string;
  port: number;
  bypass?: string[];
  sudo?: boolean;
}

export interface ServerProxy {
  http: {
    host?: string | undefined,
    port?: string | undefined;
  };
  https: {
    host?: string | undefined,
    port?: string | undefined;
  };
}

export function getServerProxy(callback: (err: Error | null, conf: ServerProxy) => void): void;

export async function sudoMacProxyHelper(sudoPrompt: (cmd: string, callback: (err: Error | null, stdout?: string) => void) => void): Promise<void>;

export function enableProxy(options: ProxyOptions): boolean;

export function disableProxy(sudo?: boolean): boolean;

export function getBypass(bypass: string): string[] | undefined;
