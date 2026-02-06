/// <reference types="vite/client" />
/// <reference types="node" />

declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_KEY: string;
  }
}
