const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join-room", (roomID) => {
    const room = io.sockets.adapter.rooms.get(roomID) || { size: 0 };
    const roomSize = room.size;

    if (roomSize < 2) {
      socket.join(roomID);
      socket.to(roomID).emit("user-joined", socket.id);
    } else {
      socket.emit("room-full");
    }
  });

  socket.on("offer", (data) => {
    socket.to(data.roomID).emit("offer", data.sdp);
  });

  socket.on("audio-on", ({ roomID, userId }) => {
    console.log(`User ${userId} turned on their audio`);
    socket.to(roomID).emit("audio-on", { userId });
  });

  socket.on("audio-off", ({ roomID, userId }) => {
    console.log(`User ${userId} turned off their audio`);
    socket.to(roomID).emit("audio-off", { userId });
  });



  socket.on("video-on", ({ roomID, userId }) => {
    console.log(`User ${userId} turned on their video`);
    socket.to(roomID).emit("video-on", { userId });
  });

  socket.on("video-off", ({ roomID, userId }) => {
    console.log(`User ${userId} turned off their video`);
    socket.to(roomID).emit("video-off", { userId });
  });

  socket.on("answer", (data) => {
    socket.to(data.roomID).emit("answer", data.sdp);
  });

  socket.on("ice-candidate", (data) => {
    socket.to(data.roomID).emit("ice-candidate", data.candidate);
  });

  socket.on("screen-share", (data) => {
    console.log("User is sharing the screen:", data.userId);
    socket.to(data.roomID).emit("screen-share", { userId: data.userId, screenStream: data.screenStream });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    socket.rooms.forEach((roomID) => {
      socket.to(roomID).emit("user-left", socket.id);
    });
  });
});

server.listen(5000, () => console.log("Signaling server running on port 5000"));
