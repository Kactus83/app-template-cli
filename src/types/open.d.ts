declare module 'open' {
  export default function open(url: string, options?: { app?: string | string[]; }): Promise<void>;
}
