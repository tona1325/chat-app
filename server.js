// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    // Cấu hình thêm nếu cần (ví dụ: CORS cho môi trường dev khác)
    // cors: {
    //   origin: "http://localhost:8080", // Địa chỉ frontend dev nếu khác port
    //   methods: ["GET", "POST"]
    // }
});

const PORT = process.env.PORT || 3000;
const saltRounds = 10;

app.use(express.json());
app.use(express.static('public'));

// --- Routes ---
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.post('/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }
    try {
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(409).json({ message: 'Username already taken' });
        }
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = await prisma.user.create({
            data: { username, password: hashedPassword },
        });
        console.log('User created:', newUser.username);
        res.status(201).json({ message: 'User created successfully. Please login.', userId: newUser.id, username: newUser.username });
    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ message: 'Error creating user' });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        console.log('User logged in:', user.username);
        res.status(200).json({ message: 'Login successful', userId: user.id, username: user.username });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: 'Error logging in' });
    }
});

// --- Socket.IO Logic ---
const activeUsers = {}; // { socketId: { username, userId, currentRoom } }

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinRoom', async ({ username, userId, room }) => {
        console.log(`${username} (ID: ${userId}) is joining room: ${room}`);
        activeUsers[socket.id] = { username, userId, currentRoom: room };
        socket.join(room);
        socket.to(room).emit('userJoined', { username });

        try {
            // ** Lấy lịch sử trong 24 giờ gần nhất **
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const messages = await prisma.message.findMany({
                where: {
                    room: room,
                    createdAt: { gte: twentyFourHoursAgo } // Chỉ lấy tin nhắn >= 24h trước
                },
                orderBy: { createdAt: 'asc' },
                // take: 100, // Bỏ giới hạn số lượng, lấy hết trong 24h
                include: { user: { select: { username: true } } }
            });

            console.log(`Sending ${messages.length} messages (last 24h) for room ${room} to ${username}`);
            socket.emit('loadHistory', messages.map(msg => ({
                username: msg.user.username,
                text: msg.text,
                room: msg.room,
                createdAt: msg.createdAt
            })));

            socket.emit('joinedRoom', { room }); // Xác nhận đã vào phòng
        } catch (error) {
            console.error(`Error fetching history for room ${room}:`, error);
            socket.emit('chatError', { message: `Error loading message history.` });
        }
    });

    socket.on('sendMessage', async (data) => {
        const senderInfo = activeUsers[socket.id];
        if (!senderInfo) {
            console.error("Auth Error: User info not found for socket:", socket.id);
            socket.emit('chatError', { message: 'Authentication error. Please refresh.' });
            return;
        }

        const { message, room } = data;
        const { username, userId } = senderInfo; // userId là string

        const userIdInt = parseInt(userId, 10);
        if (isNaN(userIdInt)) {
            console.error(`Validation Error: Invalid userId format. SocketId: ${socket.id}, userId: ${userId}`);
            socket.emit('chatError', { message: 'Internal server error processing request.' });
            return;
        }

        if (!room) {
            console.error("Input Error: Room not specified by client.");
            socket.emit('chatError', { message: 'No room selected.' });
            return;
        }
        if (!message || message.trim().length === 0) {
             console.log(`Input Info: Empty message ignored from ${username}.`);
             // Không cần gửi lỗi về client nếu tin nhắn rỗng
             // socket.emit('chatError', { message: 'Message cannot be empty.' });
             return;
        }

        console.log(`Message from ${username} (ID: ${userIdInt}) in room ${room}: ${message}`);

        try {
            const savedMessage = await prisma.message.create({
                data: {
                    text: message, // Lưu nội dung gốc
                    room: room,
                    userId: userIdInt, // Dùng ID dạng số
                }
            });

            // Gửi lại cho tất cả trong phòng (bao gồm người gửi)
            io.to(room).emit('newMessage', {
                username: username, // Gửi username của người gửi
                text: savedMessage.text,
                room: savedMessage.room,
                createdAt: savedMessage.createdAt
            });

        } catch (error) {
            console.error("Error saving message:", error);
             if (error.code === 'P2003') { // Lỗi khóa ngoại
                 console.error(`Foreign key constraint failed for userId: ${userIdInt}`);
                 socket.emit('chatError', { message: 'Error sending message: Invalid user data.' });
             } else if (error instanceof Prisma.PrismaClientValidationError) {
                 console.error("Prisma Validation Error:", error.message);
                 socket.emit('chatError', { message: 'Error sending message: Invalid data format.' });
             } else {
                 socket.emit('chatError', { message: 'Error sending message.' });
             }
        }
    });

    socket.on('leaveRoom', (room) => {
        const userInfo = activeUsers[socket.id];
        if (userInfo && userInfo.currentRoom === room) {
            console.log(`${userInfo.username} left room ${room}`);
            socket.leave(room);
            socket.to(room).emit('userLeft', { username: userInfo.username });
            userInfo.currentRoom = null;
        }
    });

    socket.on('disconnect', (reason) => {
        const userInfo = activeUsers[socket.id];
        if (userInfo) {
            console.log(`${userInfo.username} disconnected. Reason: ${reason}`);
            if (userInfo.currentRoom) {
                socket.to(userInfo.currentRoom).emit('userLeft', { username: userInfo.username });
            }
            delete activeUsers[socket.id];
        } else {
             console.log('A user disconnected without joining a room:', socket.id, `Reason: ${reason}`);
        }
    });

     socket.on('error', (err) => {
        console.error(`Socket Error for ${socket.id}:`, err);
     });
});

// Optional: Express Error Handling Middleware (cuối cùng)
app.use((err, req, res, next) => {
  console.error("Unhandled Express Error:", err.stack);
  res.status(500).send('Internal Server Error!');
});

// Start Server
server.listen(PORT, () => {
    console.log(`🚀 Server listening on *:${PORT}`);
});