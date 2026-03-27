import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Track current room and username for each socket
  const socketData = new Map<string, { room: string, username: string }>();

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-channel", (data: { channelId: string, frequency: string, username: string }) => {
      const newRoom = `${data.channelId}-${data.frequency}`;
      const username = data.username || `Op_${socket.id.slice(0, 4)}`;
      
      // Leave previous room if any
      const prevData = socketData.get(socket.id);
      if (prevData && prevData.room !== newRoom) {
        socket.leave(prevData.room);
        updateRoomUsers(prevData.room);
      }

      socket.join(newRoom);
      socketData.set(socket.id, { room: newRoom, username });
      console.log(`User ${username} (${socket.id}) joined: ${newRoom}`);

      updateRoomUsers(newRoom);
    });

    socket.on("audio-stream", (data) => {
      if (data.frequency === 'FREE') {
        // Broadcast to everyone except sender
        socket.broadcast.emit("audio-receive", {
          userId: socket.id,
          audio: data.audio,
          username: data.username,
          frequency: data.frequency,
          isFreeChannel: true
        });
      } else {
        const room = `${data.channelId}-${data.frequency}`;
        socket.to(room).emit("audio-receive", {
          userId: socket.id,
          audio: data.audio,
          username: data.username,
          frequency: data.frequency
        });
      }
    });

    socket.on("emergency-sos", (data: { from: string, targetId: string }) => {
      // Broadcast to all connected clients. 
      // The client-side logic will check if the targetId matches their own username.
      io.emit("emergency-sos", data);
    });

    socket.on("disconnect", () => {
      const data = socketData.get(socket.id);
      if (data) {
        updateRoomUsers(data.room);
      }
      socketData.delete(socket.id);
      console.log("User disconnected:", socket.id);
    });

    function updateRoomUsers(room: string) {
      const clients = io.sockets.adapter.rooms.get(room);
      const userList: string[] = [];
      
      if (clients) {
        clients.forEach(clientId => {
          const d = socketData.get(clientId);
          if (d) userList.push(d.username);
        });
      }

      io.to(room).emit("user-list", userList);
      io.to(room).emit("user-count", userList.length);
      
      // Also broadcast global directory update
      broadcastGlobalDirectory();
    }

    function broadcastGlobalDirectory() {
      const directory = Array.from(socketData.values()).map(d => ({
        username: d.username,
        room: d.room
      }));

      // Add some simulated AI operators to make the world feel alive
      const aiOperators = [
        { username: "BASE_STATION_ALPHA", room: "Global Net-144.800" },
        { username: "REPEATER_WEST", room: "Local Net-145.200" },
        { username: "DX_HUNTER_99", room: "DX Net-14.250" },
        { username: "WEATHER_BOT", room: "Global Net-162.550" }
      ];

      io.emit("global-directory", [...directory, ...aiOperators]);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
