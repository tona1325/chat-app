// server.js
require('dotenv').config(); // Load biến môi trường từ .env
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000; // Dùng cổng từ env hoặc mặc định 3000
const saltRounds = 10; // Độ phức tạp cho bcrypt

app.use(express.json()); // Middleware để parse JSON request body
app.use(express.static('public')); // Phục vụ các file tĩnh trong thư mục 'public'

// --- Routes ---

// Route cơ bản để phục vụ trang login
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

// Route đăng ký
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
            data: {
                username,
                password: hashedPassword,
            },
        });
        console.log('User created:', newUser.username);
        // Không trả về password hash
        res.status(201).json({ message: 'User created successfully', userId: newUser.id, username: newUser.username });

    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ message: 'Error creating user' });
    }
});

// Route đăng nhập
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
        // Đăng nhập thành công, trả về thông tin user (không có password)
        res.status(200).json({ message: 'Login successful', userId: user.id, username: user.username });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: 'Error logging in' });
    }
});


// --- Socket.IO Logic ---
const activeUsers = {}; // Lưu thông tin user đang kết nối { socketId: { username, userId, currentRoom } }

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Xử lý khi user tham gia phòng chat
    socket.on('joinRoom', async ({ username, userId, room }) => {
        console.log(`${username} (ID: ${userId}) is joining room: ${room}`);

        // Lưu thông tin user và phòng hiện tại
        activeUsers[socket.id] = { username, userId, currentRoom: room };

        // Tham gia vào "room" của Socket.IO
        socket.join(room);

        // Thông báo cho những người khác trong phòng là có người mới vào
        socket.to(room).emit('userJoined', { username });

        // Gửi lịch sử chat của phòng này cho user vừa vào
        try {
            const messages = await prisma.message.findMany({
                where: { room: room },
                orderBy: { createdAt: 'asc' },
                take: 50, // Lấy 50 tin nhắn gần nhất
                include: { user: { select: { username: true } } } // Lấy cả username của người gửi
            });
            socket.emit('loadHistory', messages.map(msg => ({
                username: msg.user.username, // Lấy từ relation
                text: msg.text,
                room: msg.room,
                createdAt: msg.createdAt
            })));
             // Thông báo cho user biết đã vào phòng thành công
            socket.emit('joinedRoom', { room });
        } catch (error) {
            console.error(`Error fetching history for room ${room}:`, error);
            // Có thể emit lỗi về client nếu cần
        }

    });

    // Xử lý khi user gửi tin nhắn
    socket.on('sendMessage', async (data) => {
        const senderInfo = activeUsers[socket.id];
        if (!senderInfo) {
            console.error("Error: User info not found for socket:", socket.id);
            // Có thể gửi lỗi về client
            socket.emit('chatError', { message: 'Authentication error. Please refresh.' });
            return;
        }

        const { message, room } = data; // Nhận room từ client
        const { username, userId } = senderInfo;

        console.log(`Message from ${username} in room ${room}: ${message}`);

        if(!room) {
            console.error("Error: Room not specified by client.");
            socket.emit('chatError', { message: 'No room selected.' });
            return;
        }

        // Lưu tin nhắn vào database
        try {
            const savedMessage = await prisma.message.create({
                data: {
                    text: message,
                    room: room,
                    userId: userId,
                }
            });

            // Gửi tin nhắn đến tất cả mọi người trong phòng đó (bao gồm cả người gửi)
            io.to(room).emit('newMessage', {
                username: username,
                text: savedMessage.text,
                room: savedMessage.room,
                createdAt: savedMessage.createdAt
            });

        } catch (error) {
            console.error("Error saving message:", error);
             socket.emit('chatError', { message: 'Error sending message.' });
        }
    });

    // Xử lý khi user đổi phòng
    socket.on('leaveRoom', (room) => {
        const userInfo = activeUsers[socket.id];
        if(userInfo && userInfo.currentRoom === room) {
            console.log(`${userInfo.username} left room ${room}`);
            socket.leave(room);
            socket.to(room).emit('userLeft', { username: userInfo.username });
            userInfo.currentRoom = null; // Cập nhật user không còn ở phòng này nữa
        }
    });


    // Xử lý khi user ngắt kết nối
    socket.on('disconnect', () => {
        const userInfo = activeUsers[socket.id];
        if (userInfo) {
            console.log(`${userInfo.username} disconnected`);
            // Thông báo cho những người trong phòng cuối cùng của user biết họ đã rời đi
            if(userInfo.currentRoom) {
                socket.to(userInfo.currentRoom).emit('userLeft', { username: userInfo.username });
            }
            delete activeUsers[socket.id]; // Xóa user khỏi danh sách active
        } else {
             console.log('A user disconnected:', socket.id);
        }
    });
});

// Khởi động server
server.listen(PORT, () => {
    console.log(`Server listening on *:${PORT}`);
});