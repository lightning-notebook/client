import ReconnectingWebsocket, { UrlProvider } from "reconnecting-websocket";
import jsonrpc, { IParsedObject } from "jsonrpc-lite";
import normalizeUrl from "normalize-url";
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

type Callback = Function;

class Socket {
  private listeners = new Map<string, Set<Callback>>();
  private requests = new Map<string, Callback>();
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
      try {
        let data = await event.data.text();
        let parsed = jsonrpc.parse(data);
        parsed instanceof Array
          ? parsed.forEach(this.handleMessage)
          : this.handleMessage(parsed);
      } catch (error) {
        console.error(error);
      }
    };

    socket.onopen = () => {
      let id = uuid();

      this.sendRequest("start_notebook", {
        notebook_id: id,
      });
    };

    this.socket = socket;
  }

  handleMessage(message: IParsedObject) {
    console.log("message", message);
    switch (message.type) {
      case "success": {
        const { id, result } = message.payload;

        if (!id || typeof id !== "string") {
          console.log("Invalid id", id);
          return;
        }

        let request = this.requests.get(id);
        if (!request) {
          console.log(`Request with id: ${id} not found`);
          return;
        }

        request(result);
        this.requests.delete(id);

        break;
      }
      case "notification": {
        const { method, params } = message.payload;

        this.listeners.get(method)?.forEach((listener) => {
          listener(params);
        });

        break;
      }
      case "error": /* falls through */
      case "invalid": /* falls through */
      case "request": /* falls through */
      default: {
        console.log("message", message);
      }
    }
  }

  async sendRequest<T extends string>(method: T, body = {}) {
    let request_id = uuid();
    this.socket.send(jsonrpc.request(request_id, method, body).serialize());
    return new Promise((resolve) => {
      this.requests.set(request_id, resolve);
    });
  }

  sendNotification<T extends string>(method: T, body = {}) {
    this.socket.send(jsonrpc.notification(method, body).serialize());
  }

  on<T extends string>(method: T, listener: Callback) {
    if (!this.listeners.has(method)) {
      this.listeners.set(method, new Set());
    }

    this.listeners.get(method)!.add(listener);
  }

  off<T extends string>(method: T, listener: Callback) {
    let listeners = this.listeners.get(method);
    if (!listeners?.has(listener)) {
      return;
    }

    if (listeners.size === 1) {
      this.listeners.delete(method);
    } else {
      listeners.delete(listener);
    }
  }
}

const useSocket = create<{ socket: Socket }>((set, get) => ({
  socket: new Socket(),
}));

export { useSocket };
