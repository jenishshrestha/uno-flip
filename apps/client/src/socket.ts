import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@uno-flip/shared";
import { io, type Socket } from "socket.io-client";

export const SERVER_URL = "http://localhost:3001";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
  io(SERVER_URL);
