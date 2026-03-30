import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@uno-flip/shared";
import { io, type Socket } from "socket.io-client";

// Use the same hostname the browser loaded from (works on localhost AND LAN)
export const SERVER_URL = `http://${window.location.hostname}:3001`;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
  io(SERVER_URL);
