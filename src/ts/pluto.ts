import ReconnectingWebsocket, { UrlProvider } from "reconnecting-websocket";
import normalizeUrl from "normalize-url";
import jsonrpc from "jsonrpc-lite";
import { v4 as uuid } from "uuid";
import create from "zustand";

function createWebsocket(
  urlProvider: UrlProvider,
  options?: {
    maxReconnectionDelay?: number;
    minReconnectionDelay?: number;
    reconnectionDelayGrowFactor?: number;
    connectionTimeout?: number;
    maxRetries?: number;
    debug?: boolean;
  }
): ReconnectingWebsocket {
  return new ReconnectingWebsocket(
    async () => {
      let url =
        typeof urlProvider === "string" ? urlProvider : await urlProvider();
      return normalizeUrl(url);
    },
    [],
    {
      maxReconnectionDelay: 10000,
      minReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1.3,
      connectionTimeout: 10000,
      maxRetries: Infinity,
      debug: false,
      ...options,
    }
  );
}

class Socket {
  private socket: ReconnectingWebsocket;

  constructor(port: number = 1234) {
    let socket = createWebsocket(
      () => {
        let { protocol, hostname } = window.location;
        return `${protocol === "https:" ? "wss" : "ws"}://${hostname}:${port}/`;
      },
      { debug: true, maxRetries: 0 }
    );

    socket.onmessage = async (event) => {
      let data = await event.data.text();
      let message = jsonrpc.parse(data);
      console.log("message", message);
    };

    socket.onopen = () => {
      socket.send(jsonrpc.request(uuid(), "wow").serialize());
    };

    this.socket = socket;
  }
}

const useSocket = create<{ socket: Socket }>((set, get) => ({
  socket: new Socket(),
}));

export { useSocket };
